import { ConvexError, v } from "convex/values"

import { HOME_PATH, PageDocSchema } from "@magicwebs/page-schema"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server"
import {
  ensurePages,
  findDraft,
  findPage,
  getDraft,
  listPages,
  loadDoc,
  loadSnapshot,
  ownedProject,
  requireProject,
  snapshotDoc,
  queueAgentSync,
} from "./lib"

/** How long after the last edit the draft is published automatically. */
const AUTO_PUBLISH_DELAY_MS = 1000
/** Edits auto-publish, so the workspace's knowledge waits for a quiet moment. */
const AGENT_SYNC_DELAY_MS = 2 * 60 * 1000

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    if (!(await ownedProject(ctx, projectId))) return []
    const versions = await ctx.db
      .query("versions")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(50)
    return versions.map(({ doc: _doc, ...rest }) => rest)
  },
})

export const get = query({
  args: { versionId: v.id("versions") },
  handler: async (ctx, { versionId }) => {
    const version = await ctx.db.get(versionId)
    if (!version || !(await ownedProject(ctx, version.projectId))) return null
    return { ...version, doc: await loadDoc(ctx, version.doc) }
  },
})

/**
 * Snapshot every page's draft as a new immutable version of the site and make
 * it live. Pages still being cloned for the first time are left out until they're ready.
 */
async function publishDraft(ctx: MutationCtx, projectId: Id<"projects">, note?: string) {
  const project = await ctx.db.get(projectId)
  if (!project) throw new ConvexError("Project not found")
  const home = await getDraft(ctx, projectId, HOME_PATH)
  if (!PageDocSchema.safeParse(await loadDoc(ctx, home.doc)).success) {
    throw new ConvexError("The draft is not a valid page and can't be published")
  }
  if (project.autoPublishId) await ctx.scheduler.cancel(project.autoPublishId)

  const pages: NonNullable<Doc<"versions">["pages"]> = []
  for (const page of await listPages(ctx, project)) {
    const draft = page.path === HOME_PATH ? home : await findDraft(ctx, projectId, page.path)
    if (!draft || (draft.revision === 0 && page.path !== HOME_PATH)) continue
    pages.push({ path: page.path, title: page.title, sourceUrl: page.sourceUrl, snapshot: await snapshotDoc(ctx, draft.doc) })
  }

  const latest = await ctx.db
    .query("versions")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .order("desc")
    .first()
  const number = (latest?.number ?? 0) + 1
  const now = Date.now()
  const versionId = await ctx.db.insert("versions", { projectId, number, doc: home.doc, pages, note, createdAt: now })
  await ctx.db.patch(projectId, { publishedVersionId: versionId, publishedAt: now, autoPublishId: undefined })
  await ctx.scheduler.runAfter(0, internal.edge.syncSite, { projectId })
  await queueAgentSync(ctx, projectId, AGENT_SYNC_DELAY_MS)
  return { versionId, number }
}

export const publish = mutation({
  args: { projectId: v.id("projects"), note: v.optional(v.string()) },
  handler: async (ctx, { projectId, note }) => {
    await requireProject(ctx, projectId)
    return publishDraft(ctx, projectId, note)
  },
})

/**
 * Publish the draft shortly after an edit. Each new edit pushes the publish
 * back, so a burst of edits (an AI reply, dragging a slider) becomes one version.
 */
export async function scheduleAutoPublish(ctx: MutationCtx, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId)
  if (!project) return
  if (project.autoPublishId) await ctx.scheduler.cancel(project.autoPublishId)
  const autoPublishId = await ctx.scheduler.runAfter(AUTO_PUBLISH_DELAY_MS, internal.versions.autoPublish, { projectId })
  await ctx.db.patch(projectId, { autoPublishId })
}

export const autoPublish = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const draft = await findDraft(ctx, projectId, HOME_PATH)
    // An invalid draft stays unpublished; the editor still shows it as unpublished.
    if (!draft || !PageDocSchema.safeParse(await loadDoc(ctx, draft.doc)).success) return
    await publishDraft(ctx, projectId, "Auto-published")
  },
})

/**
 * Load every page of a version back into the drafts. Pages added since stay
 * as they are; pages removed since come back.
 */
async function restoreVersion(ctx: MutationCtx, project: Doc<"projects">, version: Doc<"versions">, result: string) {
  await ensurePages(ctx, project)
  const now = Date.now()
  const entries = version.pages ?? [{ path: HOME_PATH, title: "Home", sourceUrl: project.sourceUrl, snapshot: "" }]
  let order = (await listPages(ctx, project)).reduce((max, p) => Math.max(max, p.order), 0)
  for (const entry of entries) {
    const stored = entry.snapshot ? await loadSnapshot(ctx, entry.snapshot) : version.doc
    if (!(await findPage(ctx, project._id, entry.path))) {
      await ctx.db.insert("pages", {
        projectId: project._id,
        path: entry.path,
        title: entry.title,
        sourceUrl: entry.sourceUrl,
        status: "ready",
        order: ++order,
        createdAt: now,
      })
    }
    const draft = await findDraft(ctx, project._id, entry.path)
    const revision = (draft?.revision ?? 0) + 1
    if (draft) await ctx.db.patch(draft._id, { doc: stored, revision, updatedAt: now })
    else await ctx.db.insert("drafts", { projectId: project._id, path: entry.path, doc: stored, revision, updatedAt: now })
    await ctx.db.insert("edits", {
      projectId: project._id,
      path: entry.path,
      revision,
      source: "rollback",
      ops: [],
      results: [result],
      createdAt: now,
    })
  }
  return now
}

/**
 * Make an earlier version live again and load it into the drafts. The version
 * history itself is never rewritten, so a rollback can be rolled back too.
 */
export const rollback = mutation({
  args: { projectId: v.id("projects"), versionId: v.id("versions") },
  handler: async (ctx, { projectId, versionId }) => {
    const project = await requireProject(ctx, projectId)
    const version = await ctx.db.get(versionId)
    if (!version || version.projectId !== projectId) throw new ConvexError("Version not found")
    const now = await restoreVersion(ctx, project, version, `Restored version ${version.number}`)
    await ctx.db.patch(projectId, { publishedVersionId: versionId, publishedAt: now })
    await ctx.scheduler.runAfter(0, internal.edge.syncSite, { projectId })
  },
})

/** Load an earlier version into the drafts without publishing it. */
export const restoreToDraft = mutation({
  args: { projectId: v.id("projects"), versionId: v.id("versions") },
  handler: async (ctx, { projectId, versionId }) => {
    const project = await requireProject(ctx, projectId)
    const version = await ctx.db.get(versionId)
    if (!version || version.projectId !== projectId) throw new ConvexError("Version not found")
    await restoreVersion(ctx, project, version, `Loaded version ${version.number} into the draft`)
    await scheduleAutoPublish(ctx, projectId)
  },
})

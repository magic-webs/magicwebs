import { ConvexError, v } from "convex/values"

import { PageDocSchema } from "@magicwebs/page-schema"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server"
import { getDraft } from "./lib"

/** How long after the last edit the draft is published automatically. */
const AUTO_PUBLISH_DELAY_MS = 1000

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
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
  handler: async (ctx, { versionId }) => ctx.db.get(versionId),
})

/** Snapshot the current draft as a new immutable version and make it live. */
async function publishDraft(ctx: MutationCtx, projectId: Id<"projects">, note?: string) {
  const project = await ctx.db.get(projectId)
  if (!project) throw new ConvexError("Project not found")
  const draft = await getDraft(ctx, projectId)
  if (!PageDocSchema.safeParse(draft.doc).success) {
    throw new ConvexError("The draft is not a valid page and can't be published")
  }
  if (project.autoPublishId) await ctx.scheduler.cancel(project.autoPublishId)

  const latest = await ctx.db
    .query("versions")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .order("desc")
    .first()
  const number = (latest?.number ?? 0) + 1
  const now = Date.now()
  const versionId = await ctx.db.insert("versions", { projectId, number, doc: draft.doc, note, createdAt: now })
  await ctx.db.patch(projectId, { publishedVersionId: versionId, publishedAt: now, autoPublishId: undefined })
  await ctx.scheduler.runAfter(0, internal.edge.syncSite, { projectId })
  return { versionId, number }
}

export const publish = mutation({
  args: { projectId: v.id("projects"), note: v.optional(v.string()) },
  handler: async (ctx, { projectId, note }) => publishDraft(ctx, projectId, note),
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
    const draft = await getDraft(ctx, projectId)
    // An invalid draft stays unpublished; the editor still shows it as unpublished.
    if (!PageDocSchema.safeParse(draft.doc).success) return
    await publishDraft(ctx, projectId, "Auto-published")
  },
})

/**
 * Make an earlier version live again and load it into the draft. The version
 * history itself is never rewritten, so a rollback can be rolled back too.
 */
export const rollback = mutation({
  args: { projectId: v.id("projects"), versionId: v.id("versions") },
  handler: async (ctx, { projectId, versionId }) => {
    const version = await ctx.db.get(versionId)
    if (!version || version.projectId !== projectId) throw new ConvexError("Version not found")
    const draft = await getDraft(ctx, projectId)
    const now = Date.now()
    const revision = draft.revision + 1
    await ctx.db.patch(draft._id, { doc: version.doc, revision, updatedAt: now })
    await ctx.db.insert("edits", {
      projectId,
      revision,
      source: "rollback",
      ops: [],
      results: [`Restored version ${version.number}`],
      createdAt: now,
    })
    await ctx.db.patch(projectId, { publishedVersionId: versionId, publishedAt: now })
    await ctx.scheduler.runAfter(0, internal.edge.syncSite, { projectId })
  },
})

/** Load an earlier version into the draft without publishing it. */
export const restoreToDraft = mutation({
  args: { projectId: v.id("projects"), versionId: v.id("versions") },
  handler: async (ctx, { projectId, versionId }) => {
    const version = await ctx.db.get(versionId)
    if (!version || version.projectId !== projectId) throw new ConvexError("Version not found")
    const draft = await getDraft(ctx, projectId)
    const now = Date.now()
    await ctx.db.patch(draft._id, { doc: version.doc, revision: draft.revision + 1, updatedAt: now })
    await ctx.db.insert("edits", {
      projectId,
      revision: draft.revision + 1,
      source: "rollback",
      ops: [],
      results: [`Loaded version ${version.number} into the draft`],
      createdAt: now,
    })
    await scheduleAutoPublish(ctx, projectId)
  },
})

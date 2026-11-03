import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError } from "convex/values"

import { HOME_PATH, MAX_SITE_PAGES, type PageDoc } from "@magicwebs/page-schema"

import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

export function sitesRootDomain(): string {
  return process.env.SITES_ROOT_DOMAIN ?? "magicwebs.ai"
}

/**
 * The signed-in user, or null. The session must still exist, so signing out or
 * revoking an agent's API key cuts off tokens issued before it at once.
 */
export async function getViewer(ctx: QueryCtx): Promise<Id<"users"> | null> {
  const userId = await getAuthUserId(ctx)
  const sessionId = await getAuthSessionId(ctx)
  if (!userId || !sessionId || !(await ctx.db.get(sessionId))) return null
  return userId
}

export async function requireUser(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getViewer(ctx)
  if (!userId) throw new ConvexError("Sign in to continue")
  return userId
}

/** The project if the signed-in user owns it, else null. */
export async function ownedProject(ctx: QueryCtx, projectId: Id<"projects">): Promise<Doc<"projects"> | null> {
  const userId = await getViewer(ctx)
  if (!userId) return null
  const project = await ctx.db.get(projectId)
  return project && project.userId === userId ? project : null
}

/** The project, or an error that doesn't reveal whether someone else owns it. */
export async function requireProject(ctx: QueryCtx, projectId: Id<"projects">): Promise<Doc<"projects">> {
  await requireUser(ctx)
  const project = await ownedProject(ctx, projectId)
  if (!project) throw new ConvexError("Project not found")
  return project
}

/** The signed-in user's projects, newest first. */
export async function viewerProjects(ctx: QueryCtx, limit = 100): Promise<Doc<"projects">[]> {
  const userId = await getViewer(ctx)
  if (!userId) return []
  return ctx.db
    .query("projects")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(limit)
}

/** Machine-to-machine calls (crawler workers) must present the shared secret. */
export function assertWorker(secret: string) {
  const expected = process.env.WORKER_SECRET
  if (!expected || secret !== expected) {
    throw new ConvexError("Invalid worker secret")
  }
}

/** Convex rejects `undefined` inside stored values; round-trip through JSON. */
function toStored(doc: PageDoc): PageDoc {
  return JSON.parse(JSON.stringify(doc))
}

// Exact clones carry the original page's markup and CSS, which can be far
// larger than Convex's 1 MiB document limit. Long strings are stored in the
// blobs table, keyed by content hash and split into chunks, and the stored
// page keeps `{ mwBlob: hash }` in their place (Convex reserves `$` names). Unchanged strings hash the same,
// so versions and edits share them.

/** Strings longer than this move out of the page document. */
const BLOB_THRESHOLD = 64 * 1024
/** Characters per chunk; at most 3 bytes each in UTF-8, safely under 1 MiB. */
const CHUNK_CHARS = 300_000

type BlobRef = { mwBlob: string }

function isBlobRef(value: unknown): value is BlobRef {
  return !!value && typeof value === "object" && typeof (value as BlobRef).mwBlob === "string"
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function mapStrings(node: unknown, fn: (value: string) => Promise<unknown>): Promise<unknown> {
  if (typeof node === "string") return fn(node)
  if (Array.isArray(node)) return Promise.all(node.map((n) => mapStrings(n, fn)))
  if (node && typeof node === "object") {
    const entries = await Promise.all(Object.entries(node).map(async ([k, v]) => [k, await mapStrings(v, fn)] as const))
    return Object.fromEntries(entries)
  }
  return node
}

/** Store a long string in the blobs table, once per distinct content, and return its hash. */
async function putBlob(ctx: MutationCtx, value: string): Promise<string> {
  const hash = await sha256(value)
  const existing = await ctx.db
    .query("blobs")
    .withIndex("by_hash", (q) => q.eq("hash", hash))
    .first()
  if (!existing) {
    for (let index = 0; index * CHUNK_CHARS < value.length; index++) {
      await ctx.db.insert("blobs", { hash, index, data: value.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS) })
    }
  }
  return hash
}

async function getBlob(ctx: QueryCtx, hash: string): Promise<string> {
  const chunks = await ctx.db
    .query("blobs")
    .withIndex("by_hash", (q) => q.eq("hash", hash))
    .collect()
  return chunks
    .sort((a, b) => a.index - b.index)
    .map((c) => c.data)
    .join("")
}

/** The page as it is stored: JSON-safe, with long strings moved to blobs. */
export async function storeDoc(ctx: MutationCtx, doc: PageDoc): Promise<unknown> {
  return mapStrings(toStored(doc), async (value) => {
    if (value.length <= BLOB_THRESHOLD) return value
    return { mwBlob: await putBlob(ctx, value) } satisfies BlobRef
  })
}

/**
 * Snapshot a stored page for a version: the whole stored document goes into
 * the blobs table as one string, so a version of a many-page site stays a
 * small row, and a page that didn't change shares its snapshot with the last version.
 */
export async function snapshotDoc(ctx: MutationCtx, stored: unknown): Promise<string> {
  return putBlob(ctx, JSON.stringify(stored))
}

/** The stored page a snapshot holds (still with its blob references). */
export async function loadSnapshot(ctx: QueryCtx, snapshot: string): Promise<unknown> {
  return JSON.parse(await getBlob(ctx, snapshot))
}

/** Reassemble a stored page, reading its blobs back in. */
export async function loadDoc(ctx: QueryCtx, stored: unknown): Promise<PageDoc> {
  const resolve = async (node: unknown): Promise<unknown> => {
    if (isBlobRef(node)) return getBlob(ctx, node.mwBlob)
    if (Array.isArray(node)) return Promise.all(node.map(resolve))
    if (node && typeof node === "object") {
      const entries = await Promise.all(Object.entries(node).map(async ([k, v]) => [k, await resolve(v)] as const))
      return Object.fromEntries(entries)
    }
    return node
  }
  return (await resolve(stored)) as PageDoc
}

/** A project's page at `path`. Drafts from before multi-page sites have no path and are the home page. */
export async function findDraft(ctx: QueryCtx, projectId: Id<"projects">, path: string = HOME_PATH) {
  const draft = await ctx.db
    .query("drafts")
    .withIndex("by_project_path", (q) => q.eq("projectId", projectId).eq("path", path))
    .first()
  if (draft || path !== HOME_PATH) return draft
  return ctx.db
    .query("drafts")
    .withIndex("by_project_path", (q) => q.eq("projectId", projectId).eq("path", undefined))
    .first()
}

export async function getDraft(ctx: QueryCtx, projectId: Id<"projects">, path: string = HOME_PATH) {
  const draft = await findDraft(ctx, projectId, path)
  if (!draft) throw new ConvexError(path === HOME_PATH ? "Project has no draft" : `This site has no page ${path}`)
  return draft
}

export type SitePageRow = {
  path: string
  title: string
  sourceUrl: string
  status: "cloning" | "ready" | "failed"
  step?: string
  error?: string
  order: number
  /** True for a project from before multi-page sites, which has no page rows yet. */
  legacy?: boolean
}

/** Every page of a project, home first. Older projects without page rows are one home page. */
export async function listPages(ctx: QueryCtx, project: Doc<"projects">): Promise<SitePageRow[]> {
  const rows = await ctx.db
    .query("pages")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .take(MAX_SITE_PAGES * 2)
  if (rows.length) return rows
  return [
    {
      path: HOME_PATH,
      title: "Home",
      sourceUrl: project.sourceUrl,
      status: project.status,
      step: project.step,
      error: project.error,
      order: 0,
      legacy: true,
    },
  ]
}

export async function findPage(ctx: QueryCtx, projectId: Id<"projects">, path: string) {
  return ctx.db
    .query("pages")
    .withIndex("by_project_path", (q) => q.eq("projectId", projectId).eq("path", path))
    .first()
}

/**
 * Give an older single-page project its page row and path, so it can grow
 * into a site. Does nothing for projects that already have pages.
 */
export async function ensurePages(ctx: MutationCtx, project: Doc<"projects">) {
  const existing = await ctx.db
    .query("pages")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .first()
  if (existing) return
  await ctx.db.insert("pages", {
    projectId: project._id,
    path: HOME_PATH,
    title: "Home",
    sourceUrl: project.sourceUrl,
    status: project.status,
    error: project.error,
    order: 0,
    createdAt: project.createdAt,
  })
  const draft = await findDraft(ctx, project._id, HOME_PATH)
  if (draft && draft.path === undefined) await ctx.db.patch(draft._id, { path: HOME_PATH })
}

/** Record a page's cloning state and roll it up into the project's. */
export async function setPageState(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  path: string,
  state: { status?: SitePageRow["status"]; step?: string; error?: string },
) {
  const page = await findPage(ctx, projectId, path)
  if (!page) {
    // An older single-page project: the project row is the page.
    const patch: Partial<Doc<"projects">> = { step: state.step }
    if (state.status) Object.assign(patch, { status: state.status, error: state.error })
    await ctx.db.patch(projectId, patch)
    return
  }
  const patch: Partial<Doc<"pages">> = { step: state.step }
  if (state.status) Object.assign(patch, { status: state.status, error: state.error })
  await ctx.db.patch(page._id, patch)
  await syncProjectStatus(ctx, projectId)
}

/**
 * Roll the pages' states up into the project's: cloning while any page is,
 * failed only when every page failed, otherwise ready (naming failed pages).
 * The step shows what the cloning pages are doing.
 */
export async function syncProjectStatus(ctx: MutationCtx, projectId: Id<"projects">) {
  const pages = await ctx.db
    .query("pages")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(MAX_SITE_PAGES * 2)
  if (!pages.length) return
  const cloning = pages.filter((p) => p.status === "cloning")
  const failed = pages.filter((p) => p.status === "failed")
  if (cloning.length) {
    const done = pages.length - cloning.length
    const active = cloning.find((p) => p.step && p.step !== "Queued") ?? cloning[0]!
    const step =
      pages.length === 1
        ? (active.step ?? "Queued")
        : `${done} of ${pages.length} pages done · ${active.title}: ${active.step ?? "Queued"}`
    await ctx.db.patch(projectId, { status: "cloning", step, error: undefined })
  } else if (failed.length === pages.length) {
    await ctx.db.patch(projectId, { status: "failed", step: undefined, error: failed[0]?.error ?? "Cloning failed" })
  } else {
    const error = failed.length
      ? `${failed.length === 1 ? "1 page" : `${failed.length} pages`} couldn't be cloned: ${failed.map((p) => p.title).join(", ")}`
      : undefined
    await ctx.db.patch(projectId, { status: "ready", step: undefined, error })
  }
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\.[a-z]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "site"
  )
}

import { ConvexError } from "convex/values"

import type { PageDoc } from "@magicwebs/page-schema"

import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

export function sitesRootDomain(): string {
  return process.env.SITES_ROOT_DOMAIN ?? "magicwebs.ai"
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

async function sha256(text: string): Promise<string> {
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

/** The page as it is stored: JSON-safe, with long strings moved to blobs. */
export async function storeDoc(ctx: MutationCtx, doc: PageDoc): Promise<unknown> {
  return mapStrings(toStored(doc), async (value) => {
    if (value.length <= BLOB_THRESHOLD) return value
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
    return { mwBlob: hash } satisfies BlobRef
  })
}

/** Reassemble a stored page, reading its blobs back in. */
export async function loadDoc(ctx: QueryCtx, stored: unknown): Promise<PageDoc> {
  const resolve = async (node: unknown): Promise<unknown> => {
    if (isBlobRef(node)) {
      const chunks = await ctx.db
        .query("blobs")
        .withIndex("by_hash", (q) => q.eq("hash", node.mwBlob))
        .collect()
      return chunks
        .sort((a, b) => a.index - b.index)
        .map((c) => c.data)
        .join("")
    }
    if (Array.isArray(node)) return Promise.all(node.map(resolve))
    if (node && typeof node === "object") {
      const entries = await Promise.all(Object.entries(node).map(async ([k, v]) => [k, await resolve(v)] as const))
      return Object.fromEntries(entries)
    }
    return node
  }
  return (await resolve(stored)) as PageDoc
}

export async function getDraft(ctx: QueryCtx, projectId: Id<"projects">) {
  const draft = await ctx.db
    .query("drafts")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .unique()
  if (!draft) throw new ConvexError("Project has no draft")
  return draft
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

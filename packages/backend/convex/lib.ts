import { ConvexError } from "convex/values"

import type { PageDoc } from "@magicwebs/page-schema"

import type { Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"

export function sitesRootDomain(): string {
  return process.env.SITES_ROOT_DOMAIN ?? "magicwebs.site"
}

/** Machine-to-machine calls (crawler workers) must present the shared secret. */
export function assertWorker(secret: string) {
  const expected = process.env.WORKER_SECRET
  if (!expected || secret !== expected) {
    throw new ConvexError("Invalid worker secret")
  }
}

/** Convex rejects `undefined` inside stored values; round-trip through JSON. */
export function toStored(doc: PageDoc): PageDoc {
  return JSON.parse(JSON.stringify(doc))
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

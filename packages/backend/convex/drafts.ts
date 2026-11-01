import { ConvexError, v } from "convex/values"
import { z } from "zod"

import { applyOps as applyPageOps, OpError, OpSchema, outline, type PageDoc } from "@magicwebs/page-schema"

import { mutation, query } from "./_generated/server"
import { getDraft, toStored } from "./lib"
import { scheduleAutoPublish } from "./versions"

/** The live draft. Editors subscribe to this, so every edit shows up instantly. */
export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .unique()
    if (!draft) return null
    return { doc: draft.doc as PageDoc, revision: draft.revision, updatedAt: draft.updatedAt }
  },
})

export const outlineOf = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => outline((await getDraft(ctx, projectId)).doc as PageDoc),
})

export const recentEdits = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) =>
    ctx.db
      .query("edits")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(30),
})

/**
 * Apply a batch of edit operations atomically. Used by the visual editor, the
 * AI chat and MCP clients alike. Convex runs mutations serializably, so
 * concurrent editors never overwrite each other's batches.
 */
export const applyOps = mutation({
  args: {
    projectId: v.id("projects"),
    ops: v.array(v.any()),
    source: v.union(v.literal("editor"), v.literal("ai"), v.literal("mcp")),
  },
  handler: async (ctx, args) => {
    const parsed = z.array(OpSchema).safeParse(args.ops)
    if (!parsed.success) {
      throw new ConvexError(`Invalid operation: ${z.prettifyError(parsed.error)}`)
    }
    const draft = await getDraft(ctx, args.projectId)

    let next
    try {
      next = applyPageOps(draft.doc as PageDoc, parsed.data as never)
    } catch (error) {
      if (error instanceof OpError) throw new ConvexError(error.message)
      throw error
    }

    const revision = draft.revision + 1
    const now = Date.now()
    await ctx.db.patch(draft._id, { doc: toStored(next.doc), revision, updatedAt: now })
    await ctx.db.insert("edits", {
      projectId: args.projectId,
      revision,
      source: args.source,
      ops: JSON.parse(JSON.stringify(parsed.data)),
      results: next.results,
      createdAt: now,
    })
    await scheduleAutoPublish(ctx, args.projectId)
    return { revision, results: next.results }
  },
})

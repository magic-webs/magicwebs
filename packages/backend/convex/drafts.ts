import { ConvexError, v } from "convex/values"
import { z } from "zod"

import { applyOps as applyPageOps, HOME_PATH, OpError, OpSchema, outline } from "@magicwebs/page-schema"

import { mutation, query } from "./_generated/server"
import { findDraft, getDraft, loadDoc, ownedProject, requireProject, storeDoc } from "./lib"
import { scheduleAutoPublish } from "./versions"

/**
 * The live draft of one page of the site (the home page by default). Editors
 * subscribe to this, so every edit shows up instantly.
 */
export const get = query({
  args: { projectId: v.id("projects"), path: v.optional(v.string()) },
  handler: async (ctx, { projectId, path }) => {
    if (!(await ownedProject(ctx, projectId))) return null
    const draft = await findDraft(ctx, projectId, path ?? HOME_PATH)
    if (!draft) return null
    return {
      path: path ?? HOME_PATH,
      doc: await loadDoc(ctx, draft.doc),
      revision: draft.revision,
      updatedAt: draft.updatedAt,
    }
  },
})

export const outlineOf = query({
  args: { projectId: v.id("projects"), path: v.optional(v.string()) },
  handler: async (ctx, { projectId, path }) => {
    await requireProject(ctx, projectId)
    return outline(await loadDoc(ctx, (await getDraft(ctx, projectId, path ?? HOME_PATH)).doc))
  },
})

export const recentEdits = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    if (!(await ownedProject(ctx, projectId))) return []
    return ctx.db
      .query("edits")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(30)
  },
})

/**
 * Apply a batch of edit operations atomically to one page (the home page by
 * default). Used by the visual editor, the AI chat and MCP clients alike.
 * Convex runs mutations serializably, so concurrent editors never overwrite
 * each other's batches.
 */
export const applyOps = mutation({
  args: {
    projectId: v.id("projects"),
    path: v.optional(v.string()),
    ops: v.array(v.any()),
    source: v.union(v.literal("editor"), v.literal("ai"), v.literal("mcp")),
  },
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId)
    const parsed = z.array(OpSchema).safeParse(args.ops)
    if (!parsed.success) {
      throw new ConvexError(`Invalid operation: ${z.prettifyError(parsed.error)}`)
    }
    const path = args.path ?? HOME_PATH
    const draft = await getDraft(ctx, args.projectId, path)

    let next
    try {
      next = applyPageOps(await loadDoc(ctx, draft.doc), parsed.data as never)
    } catch (error) {
      if (error instanceof OpError) throw new ConvexError(error.message)
      throw error
    }

    const revision = draft.revision + 1
    const now = Date.now()
    await ctx.db.patch(draft._id, { doc: await storeDoc(ctx, next.doc), revision, updatedAt: now })
    await ctx.db.insert("edits", {
      projectId: args.projectId,
      path,
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

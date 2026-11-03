import { v } from "convex/values"

import type { Id } from "./_generated/dataModel"
import { mutation, query, type MutationCtx } from "./_generated/server"
import { ownedProject, requireProject } from "./lib"

// The in-app AI chat history of a project. The API server loads it before each
// turn and appends the turn's messages when the reply finishes; the editor
// reads it to show the conversation when the project is reopened.

/** Messages kept per project; older ones are dropped as new ones arrive. */
const MAX_MESSAGES = 200

/** The conversation, oldest first. */
export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    if (!(await ownedProject(ctx, projectId))) return []
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(MAX_MESSAGES)
    return rows.reverse().map((row) => row.message)
  },
})

/**
 * Save a turn's messages. A message already stored (a reply continued after a
 * tool call) is replaced. `replaceFrom` drops that message and everything after
 * it first, for a regenerated reply.
 */
export const append = mutation({
  args: { projectId: v.id("projects"), messages: v.array(v.any()), replaceFrom: v.optional(v.string()) },
  handler: async (ctx, { projectId, messages, replaceFrom }) => {
    await requireProject(ctx, projectId)
    if (replaceFrom) {
      const from = await byMessageId(ctx, projectId, replaceFrom)
      if (from) {
        const later = await ctx.db
          .query("chatMessages")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .filter((q) => q.gte(q.field("_creationTime"), from._creationTime))
          .collect()
        for (const row of later) await ctx.db.delete(row._id)
      }
    }
    for (const message of messages) {
      const messageId = String(message.id)
      const existing = await byMessageId(ctx, projectId, messageId)
      if (existing) await ctx.db.patch(existing._id, { message })
      else await ctx.db.insert("chatMessages", { projectId, messageId, message })
    }

    const overflow = await ctx.db
      .query("chatMessages")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .collect()
    for (const row of overflow.slice(MAX_MESSAGES)) await ctx.db.delete(row._id)
  },
})

/** Start a new conversation. */
export const clear = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProject(ctx, projectId)
    await deleteChat(ctx, projectId)
  },
})

export async function deleteChat(ctx: MutationCtx, projectId: Id<"projects">) {
  const rows = await ctx.db
    .query("chatMessages")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect()
  for (const row of rows) await ctx.db.delete(row._id)
}

function byMessageId(ctx: MutationCtx, projectId: Id<"projects">, messageId: string) {
  return ctx.db
    .query("chatMessages")
    .withIndex("by_message", (q) => q.eq("projectId", projectId).eq("messageId", messageId))
    .unique()
}

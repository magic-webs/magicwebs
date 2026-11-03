import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalQuery, query, type ActionCtx } from "./_generated/server"
import { getViewer } from "./lib"

/** The signed-in user, or null. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getViewer(ctx)
    if (!userId) return null
    const user = await ctx.db.get(userId)
    return user && { _id: user._id, name: user.name, email: user.email, image: user.image }
  },
})

export const sessionExists = internalQuery({
  args: { sessionId: v.id("authSessions") },
  handler: async (ctx, { sessionId }) => (await ctx.db.get(sessionId)) !== null,
})

/** requireUser for actions, which can't read the database directly. */
export async function requireActionUser(ctx: ActionCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx)
  const sessionId = await getAuthSessionId(ctx)
  if (!userId || !sessionId || !(await ctx.runQuery(internal.users.sessionExists, { sessionId }))) {
    throw new ConvexError("Sign in to continue")
  }
  return userId
}

import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action, internalMutation, mutation, query, type MutationCtx } from "./_generated/server"
import { getViewer, requireUser, sha256 } from "./lib"
import { requireActionUser } from "./users"

// Personal API keys for MCP clients and other agents. A key is shown once when
// it is created; only its SHA-256 hash is stored. Each key signs in to one
// auth session, so revoking the key ends every token issued for it.

const KEY_PREFIX = "mw_"
/** Sessions for agents last this long before the key signs in to a fresh one. */
const SESSION_MS = 30 * 24 * 60 * 60 * 1000

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getViewer(ctx)
    if (!userId) return []
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect()
    return keys.map(({ _id, name, prefix, lastUsedAt, createdAt }) => ({ _id, name, prefix, lastUsedAt, createdAt }))
  },
})

/**
 * Create a key and return it in full, the only time it is readable. An action,
 * because mutations' randomness is deterministic and unfit for secrets.
 */
export const create = action({
  args: { name: v.string() },
  handler: async (ctx, { name }): Promise<{ keyId: Id<"apiKeys">; key: string }> => {
    const userId = await requireActionUser(ctx)
    const label = name.trim().slice(0, 60)
    if (!label) throw new ConvexError("Give the key a name")

    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const key = KEY_PREFIX + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    const keyId = await ctx.runMutation(internal.apiKeys.insert, {
      userId,
      name: label,
      prefix: key.slice(0, KEY_PREFIX.length + 6),
      hash: await sha256(key),
    })
    return { keyId, key }
  },
})

export const insert = internalMutation({
  args: { userId: v.id("users"), name: v.string(), prefix: v.string(), hash: v.string() },
  handler: async (ctx, args) => ctx.db.insert("apiKeys", { ...args, createdAt: Date.now() }),
})

export const revoke = mutation({
  args: { keyId: v.id("apiKeys") },
  handler: async (ctx, { keyId }) => {
    const userId = await requireUser(ctx)
    const key = await ctx.db.get(keyId)
    if (!key || key.userId !== userId) throw new ConvexError("Key not found")
    if (key.sessionId) await endSession(ctx, key.sessionId)
    await ctx.db.delete(keyId)
  },
})

/** Called by the "api-key" auth provider: the user and session a key signs in to. */
export const signIn = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }): Promise<{ userId: Id<"users">; sessionId: Id<"authSessions"> } | null> => {
    if (!key.startsWith(KEY_PREFIX)) return null
    const hash = await sha256(key)
    const found = await ctx.db
      .query("apiKeys")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique()
    if (!found) return null

    const now = Date.now()
    const session = found.sessionId && (await ctx.db.get(found.sessionId))
    let sessionId = session && session.expirationTime > now ? session._id : null
    if (!sessionId) {
      if (found.sessionId) await endSession(ctx, found.sessionId)
      sessionId = await ctx.db.insert("authSessions", { userId: found.userId, expirationTime: now + SESSION_MS })
    }
    await ctx.db.patch(found._id, { sessionId, lastUsedAt: now })
    return { userId: found.userId, sessionId }
  },
})

async function endSession(ctx: MutationCtx, sessionId: Id<"authSessions">) {
  const tokens = await ctx.db
    .query("authRefreshTokens")
    .withIndex("sessionId", (q) => q.eq("sessionId", sessionId))
    .collect()
  for (const token of tokens) await ctx.db.delete(token._id)
  if (await ctx.db.get(sessionId)) await ctx.db.delete(sessionId)
}

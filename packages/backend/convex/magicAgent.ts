import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  action,
  internalAction,
  internalMutation,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server"
import { findUserByEmail, getViewer, requireProject, sitesRootDomain } from "./lib"
import { requireActionUser } from "./users"

// Accounts live on Magic Agent. People sign in there (from our sign-in page,
// which talks to Magic Agent directly) and hand us the session it opened; we
// check it with Magic Agent, link it to a Magicwebs user by account id or
// email, and keep the session to act as that person: every website gets its
// own workspace on their account. Magic Agent sessions opened for us are
// "magicwebs" sessions there, which never sign the person out of Magic Agent.

/** Magic Agent sessions last 30 days; a day's margin so we ask again before it ends. */
const SESSION_MS = 29 * 24 * 60 * 60 * 1000

function deploymentUrl(): string | null {
  return process.env.MAGIC_AGENT_CONVEX_URL?.replace(/\/$/, "") || null
}

function requireDeploymentUrl(): string {
  const url = deploymentUrl()
  if (!url) throw new ConvexError("Magic Agent isn't connected to this deployment")
  return url
}

type Reply<T> = { status: "success"; value: T } | { status: "error"; errorMessage?: string; errorData?: unknown }

/** One call to a Magic Agent function through Convex's HTTP API. */
async function call<T>(
  kind: "query" | "mutation" | "action",
  path: string,
  args: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const response = await fetch(`${requireDeploymentUrl()}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ path, args, format: "json" }),
  })
  const reply = (await response.json().catch(() => null)) as Reply<T> | null
  if (!reply) throw new Error(`Magic Agent responded ${response.status}`)
  if (reply.status === "success") return reply.value
  const data = reply.errorData
  const message =
    typeof data === "string"
      ? data
      : data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message
        : "Magic Agent couldn't do that. Try again."
  throw new ConvexError(message)
}

/** A short-lived token for calling Magic Agent as the session's owner, or null once the session has ended. */
async function accessToken(sessionToken: string): Promise<string | null> {
  const minted = await call<{ token: string } | null>("action", "auth:mintAccessToken", { sessionToken })
  return minted?.token ?? null
}

function subjectOf(token: string): string | null {
  try {
    const payload = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")
    const claims = JSON.parse(atob(payload)) as { sub?: unknown }
    return typeof claims.sub === "string" ? claims.sub : null
  } catch {
    return null
  }
}

type Account = { maUserId: string; email: string; name?: string }

/** Who a Magic Agent session belongs to: only a personal account (`user`) can sign in here. */
async function accountOf(sessionToken: string): Promise<Account | null> {
  const token = await accessToken(sessionToken)
  if (!token) return null
  const [role, id] = subjectOf(token)?.split("|") ?? []
  if (role !== "user" || !id) return null
  const me = await call<{ role: string; email?: string; label?: string } | null>("query", "authDb:me", {}, token)
  if (!me || me.role !== "user" || !me.email) return null
  return { maUserId: id, email: me.email.trim().toLowerCase(), name: me.label }
}

/**
 * The "magic-agent" sign-in provider (see auth.ts): checks the session with
 * Magic Agent and returns the Magicwebs user it belongs to, made if need be.
 */
export async function signInWithMagicAgent(
  ctx: Pick<ActionCtx, "runMutation">,
  sessionToken: unknown,
): Promise<{ userId: Id<"users"> } | null> {
  if (typeof sessionToken !== "string" || !sessionToken || !deploymentUrl()) return null
  const account = await accountOf(sessionToken)
  if (!account) return null
  const userId: Id<"users"> = await ctx.runMutation(internal.magicAgent.linkAccount, { ...account, sessionToken })
  return { userId }
}

/**
 * Connects the signed-in user to a Magic Agent account they just signed in to:
 * people who signed up before accounts moved, and Google sign-ins.
 */
export const link = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const userId = await requireActionUser(ctx)
    const account = await accountOf(sessionToken)
    if (!account) throw new ConvexError("That sign-in has ended. Sign in again.")
    await ctx.runMutation(internal.magicAgent.linkAccount, { ...account, sessionToken, userId })
  },
})

export const linkAccount = internalMutation({
  args: {
    maUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    sessionToken: v.string(),
    /** Link this signed-in user rather than finding one. */
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    const now = Date.now()
    const existing = await ctx.db
      .query("magicAgentAccounts")
      .withIndex("by_ma_user", (q) => q.eq("maUserId", args.maUserId))
      .unique()
    if (args.userId && existing && existing.userId !== args.userId) {
      throw new ConvexError("That Magic account is already connected to another Magicwebs account.")
    }

    let userId = args.userId ?? existing?.userId
    if (!userId) {
      // Magic Agent verified this email when the account was opened, so an
      // older Magicwebs account with the same email is this person's.
      const byEmail = await findUserByEmail(ctx, args.email)
      if (byEmail) {
        const linked = await linkOf(ctx, byEmail._id)
        if (linked && linked.maUserId !== args.maUserId) {
          throw new ConvexError("The Magicwebs account with this email is connected to a different Magic account.")
        }
        userId = byEmail._id
      } else {
        userId = await ctx.db.insert("users", { email: args.email, name: args.name, emailVerificationTime: now })
      }
    }

    // One Magic account per user: connecting another replaces the old link.
    const previous = await linkOf(ctx, userId)
    if (previous && previous.maUserId !== args.maUserId) await ctx.db.delete(previous._id)

    const fields = { userId, email: args.email, sessionToken: args.sessionToken, expiresAt: now + SESSION_MS, updatedAt: now }
    if (existing) await ctx.db.patch(existing._id, fields)
    else await ctx.db.insert("magicAgentAccounts", { maUserId: args.maUserId, ...fields })

    // Every website gets a workspace, including the ones made before the account was connected.
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
    for (const project of projects) {
      if (project.magicAgent?.status !== "ready" || !project.widget) await queueWorkspace(ctx, project._id)
    }
    return userId
  },
})

async function linkOf(ctx: MutationCtx, userId: Id<"users">) {
  return ctx.db
    .query("magicAgentAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique()
}

/** Whether the signed-in user still has to connect (or reconnect) a Magic account. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getViewer(ctx)
    if (!userId) return null
    if (!deploymentUrl()) return { required: false as const }
    const [user, account] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query("magicAgentAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    ])
    return {
      required: !account || account.expiresAt < Date.now(),
      reconnect: account !== null,
      email: account?.email ?? user?.email ?? null,
    }
  },
})

/**
 * Queue the project's workspace and its chat widget to be made, unless they
 * exist or are on their way. A workspace made before widgets keeps its slug
 * and only gets the widget.
 */
export async function queueWorkspace(ctx: MutationCtx, projectId: Id<"projects">) {
  if (!deploymentUrl()) return
  const project = await ctx.db.get(projectId)
  const state = project?.magicAgent
  if (!project?.userId || (state?.status === "ready" && project.widget)) return
  if (state?.status === "pending" || state?.status === "creating") return
  await ctx.db.patch(projectId, { magicAgent: { status: "pending", workspaceSlug: state?.workspaceSlug } })
  await ctx.scheduler.runAfter(0, internal.magicAgent.createWorkspace, { projectId })
}

/** Try again after a workspace couldn't be made. */
export const retryWorkspace = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId)
    if (project.magicAgent?.status === "failed" || (project.magicAgent?.status === "ready" && !project.widget)) {
      await queueWorkspace(ctx, projectId)
    }
  },
})

export const claimWorkspace = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId)
    if (!project?.userId || project.magicAgent?.status !== "pending") return null
    const account = await ctx.db
      .query("magicAgentAccounts")
      .withIndex("by_user", (q) => q.eq("userId", project.userId!))
      .unique()
    const workspaceSlug = project.magicAgent.workspaceSlug
    if (!account) {
      await ctx.db.patch(projectId, {
        magicAgent: { status: "failed", workspaceSlug, error: "Connect your Magic account to give this website its workspace." },
      })
      return null
    }
    await ctx.db.patch(projectId, { magicAgent: { status: "creating", workspaceSlug } })
    return {
      workspaceSlug,
      name: project.name,
      website: `https://${project.slug}.${sitesRootDomain()}`,
      sessionToken: account.sessionToken,
      accountId: account._id,
    }
  },
})

export const finishWorkspace = internalMutation({
  args: {
    projectId: v.id("projects"),
    workspaceSlug: v.optional(v.string()),
    /** The workspace's web channel, whose widget goes on every page. */
    channelKey: v.optional(v.string()),
    error: v.optional(v.string()),
    /** The account's session has ended: ask the person to sign in again. */
    accountId: v.optional(v.id("magicAgentAccounts")),
  },
  handler: async (ctx, { projectId, workspaceSlug, channelKey, error, accountId }) => {
    if (accountId && (await ctx.db.get(accountId))) await ctx.db.patch(accountId, { expiresAt: 0 })
    const project = await ctx.db.get(projectId)
    if (!project) return
    if (!channelKey) {
      await ctx.db.patch(projectId, { magicAgent: { status: "failed", workspaceSlug, error } })
      return
    }
    await ctx.db.patch(projectId, {
      magicAgent: { status: "ready", workspaceSlug },
      // On by default; a new channel keeps the settings the site already had.
      widget: project.widget ? { ...project.widget, channelKey } : { channelKey, enabled: true },
    })
    if (project.publishedVersionId) await ctx.scheduler.runAfter(0, internal.edge.syncSite, { projectId })
  },
})

export const createWorkspace = internalAction({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const claim = await ctx.runMutation(internal.magicAgent.claimWorkspace, { projectId })
    if (!claim) return
    let workspaceSlug = claim.workspaceSlug
    try {
      const token = await accessToken(claim.sessionToken)
      if (!token) {
        await ctx.runMutation(internal.magicAgent.finishWorkspace, {
          projectId,
          workspaceSlug,
          error: "Your Magic account sign-in has ended. Sign in again to finish setting up.",
          accountId: claim.accountId,
        })
        return
      }
      workspaceSlug =
        claim.workspaceSlug ??
        (
          await call<{ slug: string }>(
            "mutation",
            "workspaces:createForUser",
            { name: claim.name, website: claim.website },
            token,
          )
        ).slug
      const { channelKey } = await call<{ channelKey: string }>("mutation", "channels:websiteWidget", { workspaceSlug }, token)
      await ctx.runMutation(internal.magicAgent.finishWorkspace, { projectId, workspaceSlug, channelKey })
    } catch (error) {
      console.error("magicAgent.createWorkspace failed:", error)
      await ctx.runMutation(internal.magicAgent.finishWorkspace, {
        projectId,
        workspaceSlug,
        error: error instanceof ConvexError && typeof error.data === "string" ? error.data : "Couldn't reach Magic Agent. Try again.",
      })
    }
  },
})

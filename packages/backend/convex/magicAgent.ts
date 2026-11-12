import { ConvexError, v, type Infer } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server"
import { HOME_PATH, pageText, parseSiteDetails, siteProfile, type PageDoc, type SiteDetails } from "@magicwebs/page-schema"

import { versionPageDoc } from "./edgeData"
import type { chatLead } from "./leads"
import { findDraft, findUserByEmail, getViewer, listPages, loadDoc, queueAgentSync, requireProject, sitesRootDomain } from "./lib"
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

type ChatLead = Infer<typeof chatLead>

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
      if (!isSetUp(project)) await queueWorkspace(ctx, project._id)
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

/** The site has its workspace, its chat widget and the book its leads go to. */
function isSetUp(project: Doc<"projects">): boolean {
  return project.magicAgent?.status === "ready" && Boolean(project.widget && project.magicAgent.leadsUrl)
}

/**
 * Queue the project's workspace, chat widget and lead book to be made, unless
 * they exist or are on their way. A workspace made before the widget or the
 * book keeps its slug and only gets what it lacks.
 */
export async function queueWorkspace(ctx: MutationCtx, projectId: Id<"projects">) {
  if (!deploymentUrl()) return
  const project = await ctx.db.get(projectId)
  const state = project?.magicAgent
  if (!project?.userId || isSetUp(project)) return
  if (state?.status === "pending" || state?.status === "creating") return
  await ctx.db.patch(projectId, { magicAgent: { status: "pending", workspaceSlug: state?.workspaceSlug } })
  await ctx.scheduler.runAfter(0, internal.magicAgent.createWorkspace, { projectId })
}

/** Try again after a workspace couldn't be made. */
export const retryWorkspace = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId)
    if (project.magicAgent?.status === "failed" || (project.magicAgent?.status === "ready" && !isSetUp(project))) {
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
    /** Where the site's leads are sent. */
    leadsUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    /** The account's session has ended: ask the person to sign in again. */
    accountId: v.optional(v.id("magicAgentAccounts")),
  },
  handler: async (ctx, { projectId, workspaceSlug, channelKey, leadsUrl, error, accountId }): Promise<boolean> => {
    if (accountId && (await ctx.db.get(accountId))) await ctx.db.patch(accountId, { expiresAt: 0 })
    const project = await ctx.db.get(projectId)
    // Deleted while its workspace was being made: the caller deletes the workspace too.
    if (!project) return false
    if (!channelKey || !leadsUrl) {
      await ctx.db.patch(projectId, { magicAgent: { status: "failed", workspaceSlug, error } })
      return true
    }
    await ctx.db.patch(projectId, {
      magicAgent: { status: "ready", workspaceSlug, leadsUrl },
      // On by default; a new channel keeps the settings the site already had.
      widget: project.widget ? { ...project.widget, channelKey } : { channelKey, enabled: true },
    })
    if (project.publishedVersionId) await ctx.scheduler.runAfter(0, internal.edge.syncSite, { projectId })
    // Leads sent before the book existed.
    await ctx.scheduler.runAfter(0, internal.leads.deliverPending, { projectId })
    // A site already cloned fills its workspace now; one still cloning does when it's done.
    if (project.status === "ready") await queueAgentSync(ctx, projectId)
    return true
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
      const { url: leadsUrl } = await call<{ url: string }>("mutation", "recordIntake:websiteEnquiries", { workspaceSlug }, token)
      const kept = await ctx.runMutation(internal.magicAgent.finishWorkspace, { projectId, workspaceSlug, channelKey, leadsUrl })
      // The website was deleted while this ran; don't leave its workspace behind.
      if (!kept) await call("mutation", "workspaces:removeForUser", { workspaceSlug }, token)
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

export const accountSession = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const account = await ctx.db
      .query("magicAgentAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    return account?.sessionToken ?? null
  },
})

const DELETE_RETRIES_MS = [60_000, 10 * 60_000, 60 * 60_000]

/**
 * Delete a deleted website's workspace on Magic Agent, so it leaves the
 * person's workspace list there too. Retried a few times while Magic Agent
 * can't be reached; gives up when the sign-in has ended.
 */
export const deleteWorkspace = internalAction({
  args: { userId: v.id("users"), workspaceSlug: v.string(), attempt: v.optional(v.number()) },
  handler: async (ctx, { userId, workspaceSlug, attempt = 0 }) => {
    if (!deploymentUrl()) return
    const sessionToken = await ctx.runQuery(internal.magicAgent.accountSession, { userId })
    if (!sessionToken) {
      console.warn(`magicAgent.deleteWorkspace: no Magic account for ${userId}; workspace ${workspaceSlug} left in place`)
      return
    }
    try {
      const token = await accessToken(sessionToken)
      if (!token) {
        console.warn(`magicAgent.deleteWorkspace: sign-in ended; workspace ${workspaceSlug} left in place`)
        return
      }
      await call("mutation", "workspaces:removeForUser", { workspaceSlug }, token)
    } catch (error) {
      console.error(`magicAgent.deleteWorkspace ${workspaceSlug} failed:`, error)
      // Magic Agent refused (not ours, no access): trying again won't change that.
      if (error instanceof ConvexError) return
      const delay = DELETE_RETRIES_MS[attempt]
      if (delay !== undefined) {
        await ctx.scheduler.runAfter(delay, internal.magicAgent.deleteWorkspace, { userId, workspaceSlug, attempt: attempt + 1 })
      }
    }
  },
})

// --- Keeping the workspace in step with the site ---------------------------------

/**
 * The site as Magic Agent should know it: the published pages (or the drafts,
 * before the first publish) as text, and the company details they state.
 */
export const siteContent = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId)
    if (!project?.userId || project.magicAgent?.status !== "ready" || !project.magicAgent.workspaceSlug) return null
    const account = await ctx.db
      .query("magicAgentAccounts")
      .withIndex("by_user", (q) => q.eq("userId", project.userId!))
      .unique()
    if (!account) return null
    const version = project.publishedVersionId ? await ctx.db.get(project.publishedVersionId) : null
    const pages: { path: string; title: string; doc: PageDoc }[] = []
    for (const page of await listPages(ctx, project)) {
      let doc: PageDoc | null = null
      if (version) doc = await versionPageDoc(ctx, version, page.path)
      else {
        const draft = await findDraft(ctx, projectId, page.path)
        if (draft) doc = await loadDoc(ctx, draft.doc)
      }
      if (doc) pages.push({ path: page.path, title: page.title, doc })
    }
    const home = pages.find((p) => p.path === HOME_PATH)?.doc ?? pages[0]?.doc
    if (!home) return null
    const website = `https://${project.slug}.${sitesRootDomain()}`
    return {
      workspaceSlug: project.magicAgent.workspaceSlug,
      sessionToken: account.sessionToken,
      accountId: account._id,
      sourceUrl: project.sourceUrl,
      original: project.originalDetails ?? null,
      site: { ...siteProfile(home, pages.map((p) => p.doc)), website },
      pages: pages.map((p) => ({ path: p.path, title: p.title, text: pageText(p.doc) })),
    }
  },
})

const ORIGINAL_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ORIGINAL_MAX_BYTES = 3_000_000

/** Read what the original website states about the business. Null when it can't be fetched. */
async function fetchOriginalDetails(url: string): Promise<SiteDetails | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MagicwebsBot/1.0; +https://magicwebs.ai)", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("html")) return null
    const html = (await response.text()).slice(0, ORIGINAL_MAX_BYTES)
    return parseSiteDetails(html, response.url || url)
  } catch {
    return null
  }
}

export const saveOriginalDetails = internalMutation({
  args: { projectId: v.id("projects"), details: v.any() },
  handler: async (ctx, { projectId, details }) => {
    if (await ctx.db.get(projectId)) await ctx.db.patch(projectId, { originalDetails: { fetchedAt: Date.now(), details } })
  },
})

type SiteFacts = ReturnType<typeof siteProfile> & { website: string }

/**
 * The company profile for Magic Agent: what the original site declares about
 * itself first (it is the business's own statement), then what the new site
 * shows. The logo the new site displays wins, as it is the one visitors see.
 */
function companyProfile(site: SiteFacts, original: SiteDetails | null) {
  const facts: { key: string; value: string }[] = []
  const add = (key: string, value: string | undefined) => value && facts.push({ key, value })
  add("Opening hours", original?.openingHours)
  add("Price range", original?.priceRange)
  add("Areas served", original?.areaServed)
  add("Founded", original?.foundingDate)
  for (const [network, link] of Object.entries(original?.socials ?? {})) add(network, link)
  return {
    profile: {
      description: original?.description ?? site.description,
      tagline: site.tagline,
      industry: original?.industry,
      address: original?.address,
      supportEmail: original?.email ?? site.supportEmail,
      supportPhone: original?.phone ?? site.supportPhone,
      website: site.website,
      logoUrl: site.logo ?? original?.logo,
    },
    facts,
  }
}

export const noteAgentSync = internalMutation({
  args: { projectId: v.id("projects"), error: v.optional(v.string()), accountId: v.optional(v.id("magicAgentAccounts")) },
  handler: async (ctx, { projectId, error, accountId }) => {
    if (accountId && (await ctx.db.get(accountId))) await ctx.db.patch(accountId, { expiresAt: 0 })
    const project = await ctx.db.get(projectId)
    if (!project) return
    await ctx.db.patch(projectId, {
      agentSync: error ? { ...project.agentSync, scheduledId: undefined, error } : { syncedAt: Date.now() },
    })
  },
})

/** Pages that make poor welcome-menu options: the visitor has just given their details, and nobody opens a chat for the legal small print. */
const NOT_A_TOPIC = /\b(contact|privacy|terms|policy|policies|legal|cookies?|disclaimer|login|sign[ -]?(in|up)|cart|checkout|sitemap|404)\b/i

/**
 * The welcome menu's options: the site's own pages, in site order, so a visitor
 * can pick what they came for. These workspaces have no specialists, so without
 * them Magic Agent sends no welcome menu, and a widget visitor who has just
 * given their name and number gets no reply. Magic Agent saves them only while
 * the workspace has no menu, and trims each title to fit a button.
 */
function welcomeOptions(pages: { path: string; title: string }[]): { title: string }[] {
  const options: { title: string }[] = []
  for (const page of pages) {
    if (page.path === HOME_PATH) continue
    // "Magic 360 – WhatsApp Platform | MagicWebs" → "Magic 360"
    const title = page.title.split(/\s+[|–—-]\s+|\s*\|\s*/)[0]?.trim()
    if (!title || NOT_A_TOPIC.test(title) || NOT_A_TOPIC.test(page.path)) continue
    options.push({ title })
    if (options.length === 9) break
  }
  return options.length ? options : [{ title: "Our services" }, { title: "Talk to someone" }]
}

/**
 * Fill the workspace from the site: the company details it doesn't have yet,
 * a front desk and a marketing desk, a welcome menu, and one knowledge source
 * per page, refreshed when the page changes.
 */
export const syncAgent = internalAction({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const content = await ctx.runQuery(internal.magicAgent.siteContent, { projectId })
    if (!content) return
    try {
      const token = await accessToken(content.sessionToken)
      if (!token) {
        await ctx.runMutation(internal.magicAgent.noteAgentSync, {
          projectId,
          error: "Your Magic account sign-in has ended. Sign in again to keep the agent in step with the site.",
          accountId: content.accountId,
        })
        return
      }
      let original = (content.original?.details as SiteDetails | undefined) ?? null
      if (!content.original || Date.now() - content.original.fetchedAt > ORIGINAL_TTL_MS) {
        original = (await fetchOriginalDetails(content.sourceUrl)) ?? original
        await ctx.runMutation(internal.magicAgent.saveOriginalDetails, { projectId, details: original ?? { socials: {} } })
      }
      const { profile, facts } = companyProfile(content.site, original)
      await call(
        "mutation",
        "websites:setUp",
        {
          workspaceSlug: content.workspaceSlug,
          profile,
          facts,
          pages: content.pages,
          welcomeMenu: { options: welcomeOptions(content.pages) },
        },
        token,
      )
      await ctx.runMutation(internal.magicAgent.noteAgentSync, { projectId })
    } catch (error) {
      console.error("magicAgent.syncAgent failed:", error)
      await ctx.runMutation(internal.magicAgent.noteAgentSync, {
        projectId,
        error: error instanceof ConvexError && typeof error.data === "string" ? error.data : "Couldn't reach Magic Agent. Try again.",
      })
    }
  },
})

/** Sync the workspace with the site now. */
export const syncAgentNow = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId)
    if (project.magicAgent?.status !== "ready") throw new ConvexError("This site's Magic Agent workspace isn't ready yet.")
    await queueAgentSync(ctx, projectId)
  },
})

/**
 * Bring the site's chat widget leads over from Magic Agent, where the widget
 * keeps them, so the Leads page lists them beside the form submissions. The
 * page runs it when it opens. Returns how many there are, or null when the
 * site has no workspace (or no live sign-in) to ask.
 */
export const syncChatLeads = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }): Promise<number | null> => {
    const source = await ctx.runQuery(internal.leads.chatLeadSource, { projectId })
    if (!source) return null
    const token = await accessToken(source.sessionToken)
    if (!token) return null
    const leads = await call<ChatLead[]>("query", "websites:chatLeads", { workspaceSlug: source.workspaceSlug }, token)
    await ctx.runMutation(internal.leads.saveChatLeads, { projectId, leads })
    return leads.length
  },
})

/** How the workspace's setup from the site stands, for the editor. */
export const agentStatus = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId)
    let pending = false
    if (project.agentSync?.scheduledId) {
      const job = await ctx.db.system.get(project.agentSync.scheduledId)
      pending = job?.state.kind === "pending" || job?.state.kind === "inProgress"
    }
    return {
      workspace: project.magicAgent ?? null,
      syncedAt: project.agentSync?.syncedAt ?? null,
      error: project.agentSync?.error ?? null,
      pending,
    }
  },
})

import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx } from "./_generated/server"
import { requireActionUser } from "./users"
import { createCustomHostname, deleteCustomHostname, getCustomHostname, type CustomHostname } from "./cloudflare"
import { ownedProject, requireProject, requireUser, sitesRootDomain } from "./lib"

const HOSTNAME = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    if (!(await ownedProject(ctx, projectId))) return []
    return ctx.db
      .query("domains")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
  },
})

/** Attach a customer-owned hostname through Cloudflare for SaaS. */
export const addCustom = mutation({
  args: { projectId: v.id("projects"), hostname: v.string() },
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId)
    const hostname = args.hostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    if (!HOSTNAME.test(hostname)) throw new ConvexError("Enter a hostname like www.example.com")
    if (hostname.endsWith(`.${sitesRootDomain()}`)) {
      throw new ConvexError("Subdomains of the platform domain are assigned automatically")
    }
    const taken = await ctx.db
      .query("domains")
      .withIndex("by_hostname", (q) => q.eq("hostname", hostname))
      .first()
    if (taken) throw new ConvexError("That hostname is already connected to a project")

    const domainId = await ctx.db.insert("domains", {
      projectId: args.projectId,
      hostname,
      kind: "custom",
      status: "pending",
      createdAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.domains.provision, { domainId })
    return domainId
  },
})

export const remove = mutation({
  args: { domainId: v.id("domains") },
  handler: async (ctx, { domainId }) => {
    await requireUser(ctx)
    const domain = await ctx.db.get(domainId)
    if (!domain || !(await ownedProject(ctx, domain.projectId))) throw new ConvexError("Domain not found")
    if (domain.kind === "subdomain") throw new ConvexError("The platform subdomain can't be removed")
    await ctx.db.delete(domainId)
    await ctx.scheduler.runAfter(0, internal.domains.deprovision, {
      hostname: domain.hostname,
      cloudflareId: domain.cloudflareId,
    })
  },
})

/** Ask Cloudflare whether DNS and certificate validation have completed. */
export const refresh = action({
  args: { domainId: v.id("domains") },
  handler: async (ctx, { domainId }) => {
    const domain = await ctx.runQuery(internal.domains.getOwned, { domainId, userId: await requireActionUser(ctx) })
    if (!domain?.cloudflareId) return
    const result = await getCustomHostname(domain.cloudflareId)
    await applyCloudflareState(ctx, domainId, domain.projectId, result)
  },
})

export const getOwned = internalQuery({
  args: { domainId: v.id("domains"), userId: v.id("users") },
  handler: async (ctx, { domainId, userId }) => {
    const domain = await ctx.db.get(domainId)
    const project = domain && (await ctx.db.get(domain.projectId))
    return project?.userId === userId ? domain : null
  },
})

export const getInternal = internalQuery({
  args: { domainId: v.id("domains") },
  handler: async (ctx, { domainId }) => ctx.db.get(domainId),
})

export const update = internalMutation({
  args: {
    domainId: v.id("domains"),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("failed")),
    cloudflareId: v.optional(v.string()),
    verification: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { domainId, ...fields }) => {
    if (await ctx.db.get(domainId)) await ctx.db.patch(domainId, fields)
  },
})

export const provision = internalAction({
  args: { domainId: v.id("domains") },
  handler: async (ctx, { domainId }) => {
    const domain = await ctx.runQuery(internal.domains.getInternal, { domainId })
    if (!domain) return
    try {
      const result = await createCustomHostname(domain.hostname)
      await applyCloudflareState(ctx, domainId, domain.projectId, result)
    } catch (error) {
      await ctx.runMutation(internal.domains.update, {
        domainId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },
})

export const deprovision = internalAction({
  args: { hostname: v.string(), cloudflareId: v.optional(v.string()) },
  handler: async (ctx, { hostname, cloudflareId }) => {
    if (cloudflareId) await deleteCustomHostname(cloudflareId)
    await ctx.runAction(internal.edge.routeHost, { hostname })
  },
})


async function applyCloudflareState(
  ctx: ActionCtx,
  domainId: Id<"domains">,
  projectId: Id<"projects">,
  result: CustomHostname,
) {
  const active = result.status === "active" && result.ssl.status === "active"
  await ctx.runMutation(internal.domains.update, {
    domainId,
    status: active ? "active" : "pending",
    cloudflareId: result.id,
    error: result.verification_errors?.join("; "),
    verification: {
      // The customer points their hostname here and proves ownership with TXT records.
      cname: { name: result.hostname, value: process.env.CLOUDFLARE_FALLBACK_ORIGIN ?? `sites.${sitesRootDomain()}` },
      ownership: result.ownership_verification,
      ssl: result.ssl.txt_name ? { name: result.ssl.txt_name, value: result.ssl.txt_value } : undefined,
    },
  })
  if (active) {
    await ctx.runAction(internal.edge.routeHost, { hostname: result.hostname, projectId })
  }
}

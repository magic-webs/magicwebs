import { v } from "convex/values"

import { internal } from "./_generated/api"
import { internalAction } from "./_generated/server"
import { kvDelete, kvPut } from "./cloudflare"

// The edge worker serves pages from Workers KV:
//   host:<hostname>   -> projectId
//   site:<projectId>  -> { version, publishedAt, doc }
// Publishing writes here; no build or deploy is involved.

export const syncSite = internalAction({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const site = await ctx.runQuery(internal.edgeData.publishedSite, { projectId })
    if (!site) return
    await kvPut(
      `site:${projectId}`,
      JSON.stringify({ version: site.version, publishedAt: site.publishedAt, doc: site.doc }),
    )
    for (const hostname of site.hostnames) {
      await kvPut(`host:${hostname}`, projectId)
    }
  },
})

export const routeHost = internalAction({
  args: { hostname: v.string(), projectId: v.optional(v.id("projects")) },
  handler: async (_ctx, { hostname, projectId }) => {
    if (projectId) await kvPut(`host:${hostname}`, projectId)
    else await kvDelete(`host:${hostname}`)
  },
})

/** Stop serving a deleted project: drop its published page and hostname routes. */
export const removeSite = internalAction({
  args: { projectId: v.id("projects"), hostnames: v.array(v.string()) },
  handler: async (_ctx, { projectId, hostnames }) => {
    await kvDelete(`site:${projectId}`)
    for (const hostname of hostnames) await kvDelete(`host:${hostname}`)
  },
})

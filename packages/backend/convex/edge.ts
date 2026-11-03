import { v } from "convex/values"

import { internal } from "./_generated/api"
import { internalAction } from "./_generated/server"
import { kvDelete, kvPut } from "./cloudflare"

// The edge worker falls back to Workers KV when Convex can't be reached:
//   host:<hostname>          -> projectId
//   site:<projectId>         -> { version, publishedAt, pages, doc }   doc is the home page
//   page:<projectId>:<path>  -> { version, doc }                       every other page
// Each page has its own key, as a site's pages together can outgrow a KV value.
// Publishing writes here; no build or deploy is involved.

export const syncSite = internalAction({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const site = await ctx.runQuery(internal.edgeData.publishedSite, { projectId })
    if (!site) return
    for (const page of site.pages) {
      if (page.path === "/") continue
      const doc = await ctx.runQuery(internal.edgeData.publishedPage, { projectId, path: page.path })
      if (doc) await kvPut(`page:${projectId}:${page.path}`, JSON.stringify({ version: site.version, doc }))
    }
    const doc = await ctx.runQuery(internal.edgeData.publishedPage, { projectId, path: "/" })
    await kvPut(
      `site:${projectId}`,
      JSON.stringify({ version: site.version, publishedAt: site.publishedAt, pages: site.pages, doc }),
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

/** Stop serving a deleted project: drop its published pages and hostname routes. */
export const removeSite = internalAction({
  args: { projectId: v.id("projects"), hostnames: v.array(v.string()), paths: v.optional(v.array(v.string())) },
  handler: async (_ctx, { projectId, hostnames, paths }) => {
    await kvDelete(`site:${projectId}`)
    for (const path of paths ?? []) await kvDelete(`page:${projectId}:${path}`)
    for (const hostname of hostnames) await kvDelete(`host:${hostname}`)
  },
})

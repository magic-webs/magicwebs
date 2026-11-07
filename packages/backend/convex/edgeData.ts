import { v } from "convex/values"

import { HOME_PATH, type SitePage } from "@magicwebs/page-schema"

import type { Doc } from "./_generated/dataModel"
import { internalQuery, type QueryCtx } from "./_generated/server"
import { loadDoc, loadSnapshot } from "./lib"
import { edgeWidget } from "./widget"

type PublishedPage = SitePage & { title: string }

/** The pages a version serves. Versions from before multi-page sites are one home page. */
function versionPages(project: Doc<"projects">, version: Doc<"versions">): PublishedPage[] {
  if (!version.pages) return [{ path: HOME_PATH, title: "Home", source: project.sourceUrl }]
  return version.pages.map((p) => ({ path: p.path, title: p.title, source: p.sourceUrl }))
}

/** One page of a version, ready to render. */
async function versionPageDoc(ctx: QueryCtx, version: Doc<"versions">, path: string) {
  if (path === HOME_PATH) return loadDoc(ctx, version.doc)
  const entry = version.pages?.find((p) => p.path === path)
  return entry ? loadDoc(ctx, await loadSnapshot(ctx, entry.snapshot)) : null
}

/** What Workers KV holds for a published site, without the pages' documents (see publishedPage). */
export const publishedSite = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId)
    if (!project?.publishedVersionId) return null
    const version = await ctx.db.get(project.publishedVersionId)
    if (!version) return null
    const domains = await ctx.db
      .query("domains")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
    return {
      version: version.number,
      publishedAt: project.publishedAt ?? version.createdAt,
      pages: versionPages(project, version),
      widget: edgeWidget(project),
      hostnames: domains.filter((d) => d.status === "active").map((d) => d.hostname),
    }
  },
})

/** One page of the live version, for Workers KV. */
export const publishedPage = internalQuery({
  args: { projectId: v.id("projects"), path: v.string() },
  handler: async (ctx, { projectId, path }) => {
    const project = await ctx.db.get(projectId)
    if (!project?.publishedVersionId) return null
    const version = await ctx.db.get(project.publishedVersionId)
    return version ? versionPageDoc(ctx, version, path) : null
  },
})

/** The live version for a hostname, read by the edge worker on every request. */
export const liveVersionByHost = internalQuery({
  args: { hostname: v.string() },
  handler: async (ctx, { hostname }) => {
    const domain = await ctx.db
      .query("domains")
      .withIndex("by_hostname", (q) => q.eq("hostname", hostname))
      .first()
    if (!domain || domain.status !== "active") return null
    const project = await ctx.db.get(domain.projectId)
    if (!project?.publishedVersionId) return null
    const version = await ctx.db.get(project.publishedVersionId)
    if (!version) return null
    return {
      projectId: project._id,
      version: version.number,
      publishedAt: project.publishedAt ?? version.createdAt,
      pages: versionPages(project, version),
      widget: edgeWidget(project),
    }
  },
})

/** A page of a published version, fetched by the edge worker when it has no render cached. */
export const versionDoc = internalQuery({
  args: { projectId: v.id("projects"), version: v.number(), path: v.optional(v.string()) },
  handler: async (ctx, { projectId, version, path }) => {
    const found = await ctx.db
      .query("versions")
      .withIndex("by_project", (q) => q.eq("projectId", projectId).eq("number", version))
      .unique()
    return found ? versionPageDoc(ctx, found, path ?? HOME_PATH) : null
  },
})

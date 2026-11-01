import { v } from "convex/values"

import { internalQuery } from "./_generated/server"

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
      doc: version.doc,
      hostnames: domains.filter((d) => d.status === "active").map((d) => d.hostname),
    }
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
    }
  },
})

/** A published version's page, fetched by the edge worker when it has no render cached. */
export const versionDoc = internalQuery({
  args: { projectId: v.id("projects"), version: v.number() },
  handler: async (ctx, { projectId, version }) => {
    const found = await ctx.db
      .query("versions")
      .withIndex("by_project", (q) => q.eq("projectId", projectId).eq("number", version))
      .unique()
    return found?.doc ?? null
  },
})

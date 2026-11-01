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

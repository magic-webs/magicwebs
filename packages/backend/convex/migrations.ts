import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"
import { sitesRootDomain } from "./lib"

// Platform subdomains are stored when a project is created, so changing
// SITES_ROOT_DOMAIN leaves older projects on the previous root. This moves
// them to the current root and republishes them to KV.
// Run with: bunx convex run migrations:moveSubdomainsToRoot
export const moveSubdomainsToRoot = internalMutation({
  args: {},
  handler: async (ctx) => {
    const root = sitesRootDomain()
    const moved: string[] = []
    for (const domain of await ctx.db.query("domains").collect()) {
      if (domain.kind !== "subdomain" || domain.hostname.endsWith(`.${root}`)) continue
      const project = await ctx.db.get(domain.projectId)
      if (!project) continue
      const hostname = `${project.slug}.${root}`
      await ctx.db.patch(domain._id, { hostname })
      await ctx.scheduler.runAfter(0, internal.edge.routeHost, { hostname: domain.hostname })
      if (project.publishedVersionId) {
        await ctx.scheduler.runAfter(0, internal.edge.syncSite, { projectId: project._id })
      }
      moved.push(`${domain.hostname} -> ${hostname}`)
    }
    return moved
  },
})

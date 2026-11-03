import { internal } from "./_generated/api"
import { v } from "convex/values"

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

// Projects made before accounts existed have no owner and are invisible to
// everyone. This gives them to the account with the given email.
// Run with: bunx convex run migrations:claimProjects '{"email":"you@example.com"}'
export const claimProjects = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    // Sign-up stores the email as typed, so try that before the lowercase form.
    let user = null
    for (const candidate of new Set([email.trim(), email.trim().toLowerCase()])) {
      user ??= await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", candidate))
        .first()
    }
    if (!user) throw new Error(`No account with email ${email}; sign up first`)
    let claimed = 0
    for (const project of await ctx.db.query("projects").collect()) {
      if (project.userId) continue
      await ctx.db.patch(project._id, { userId: user._id })
      claimed++
    }
    return { claimed }
  },
})

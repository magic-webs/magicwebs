import { v } from "convex/values"

import { applyTemplate, getTemplate, RETIRED_TEMPLATES } from "@magicwebs/page-schema"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalMutation } from "./_generated/server"
import { findUserByEmail, loadDoc, sitesRootDomain, storeDoc } from "./lib"
import { scheduleAutoPublish } from "./versions"

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
    const user = await findUserByEmail(ctx, email)
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

// Moves everything that uses a retired design template (RETIRED_TEMPLATES in
// @magicwebs/page-schema) to the template that replaced it: projects, pending
// jobs and briefs, and drafts, which are re-styled with the new template while
// keeping their content. Live sites republish with the new look.
// Run with: bunx convex run migrations:retireTemplate '{"from":"midnight"}'
export const retireTemplate = internalMutation({
  args: { from: v.literal("midnight") },
  handler: async (ctx, { from }) => {
    const to = RETIRED_TEMPLATES[from]
    const template = getTemplate(to)!
    const counts = { projects: 0, jobs: 0, briefs: 0, drafts: 0, republished: 0 }

    for (const project of await ctx.db.query("projects").collect()) {
      if (project.template !== from) continue
      await ctx.db.patch(project._id, { template: to })
      counts.projects++
    }
    for (const job of await ctx.db.query("jobs").collect()) {
      if (job.template !== from) continue
      await ctx.db.patch(job._id, { template: to })
      counts.jobs++
    }
    for (const brief of await ctx.db.query("rebuildBriefs").collect()) {
      if (brief.template !== from) continue
      await ctx.db.patch(brief._id, { template: to })
      counts.briefs++
    }

    const restyled = new Set<Id<"projects">>()
    const now = Date.now()
    for (const draft of await ctx.db.query("drafts").collect()) {
      // The theme is always stored inline (only long strings move to blobs).
      if ((draft.doc as { theme?: { template?: string } })?.theme?.template !== from) continue
      const doc = applyTemplate(await loadDoc(ctx, draft.doc), template)
      const revision = draft.revision + 1
      await ctx.db.patch(draft._id, { doc: await storeDoc(ctx, doc), revision, updatedAt: now })
      await ctx.db.insert("edits", {
        projectId: draft.projectId,
        path: draft.path,
        revision,
        source: "editor",
        ops: [{ op: "apply_template", template: to }],
        results: [`Moved from the retired ${from} template to ${template.name}`],
        createdAt: now,
      })
      restyled.add(draft.projectId)
      counts.drafts++
    }
    for (const projectId of restyled) {
      const project = await ctx.db.get(projectId)
      if (!project?.publishedVersionId) continue
      await scheduleAutoPublish(ctx, projectId)
      counts.republished++
    }
    return counts
  },
})

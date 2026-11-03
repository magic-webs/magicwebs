import { ConvexError, v } from "convex/values"

import { emptyPageDoc } from "@magicwebs/page-schema"

import { internal } from "./_generated/api"
import { deleteChat } from "./chats"
import { mutation, query } from "./_generated/server"
import { ownedProject, requireProject, requireUser, sitesRootDomain, slugify, viewerProjects } from "./lib"
import { aiEffort, aiMode, aiModel } from "./models"

export const list = query({
  args: {},
  handler: async (ctx) => {
    const projects = await viewerProjects(ctx)
    return projects.map((p) => ({ ...p, hostname: `${p.slug}.${sitesRootDomain()}` }))
  },
})

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ownedProject(ctx, projectId)
    if (!project) return null
    return { ...project, hostname: `${project.slug}.${sitesRootDomain()}` }
  },
})

/**
 * Create a project from a public URL and queue it to be rebuilt. Agents pass
 * `ai: "agent"` so a page too large to copy is handed back to them to rebuild
 * with their own model instead of the platform's.
 */
export const create = mutation({
  args: {
    url: v.string(),
    name: v.optional(v.string()),
    model: v.optional(aiModel),
    effort: v.optional(aiEffort),
    ai: v.optional(aiMode),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    let url: URL
    try {
      url = new URL(/^https?:\/\//i.test(args.url) ? args.url : `https://${args.url}`)
    } catch {
      throw new ConvexError("That doesn't look like a valid URL")
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new ConvexError("Only http and https URLs are supported")
    }

    const base = slugify(url.hostname)
    let slug = base
    while (await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", slug)).first()) {
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
    }

    const now = Date.now()
    const name = args.name?.trim() || url.hostname.replace(/^www\./, "")
    const projectId = await ctx.db.insert("projects", {
      userId,
      name,
      slug,
      sourceUrl: url.toString(),
      model: args.model,
      effort: args.effort,
      status: "cloning",
      step: "Queued",
      createdAt: now,
    })
    await ctx.db.insert("drafts", { projectId, doc: emptyPageDoc(name), revision: 0, updatedAt: now })
    await ctx.db.insert("jobs", {
      projectId,
      url: url.toString(),
      model: args.model,
      effort: args.effort,
      ai: args.ai,
      status: "queued",
      attempts: 0,
      createdAt: now,
    })
    await ctx.db.insert("domains", {
      projectId,
      hostname: `${slug}.${sitesRootDomain()}`,
      kind: "subdomain",
      status: "active",
      createdAt: now,
    })
    return projectId
  },
})

/** Run the cloner again against the original URL, replacing the draft. */
export const reclone = mutation({
  args: { projectId: v.id("projects"), ai: v.optional(aiMode) },
  handler: async (ctx, { projectId, ai }) => {
    const project = await requireProject(ctx, projectId)
    await ctx.db.patch(projectId, { status: "cloning", step: "Queued", error: undefined })
    await ctx.db.insert("jobs", {
      projectId,
      url: project.sourceUrl,
      model: project.model,
      effort: project.effort,
      ai,
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
    })
  },
})

export const rename = mutation({
  args: { projectId: v.id("projects"), name: v.string() },
  handler: async (ctx, { projectId, name }) => {
    await requireProject(ctx, projectId)
    if (!name.trim()) throw new ConvexError("Name can't be empty")
    await ctx.db.patch(projectId, { name: name.trim() })
  },
})

/**
 * Delete a project with its draft, history and domains, and take its site off
 * the edge. Stored page blobs are content-addressed and may be shared, so they stay.
 */
export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId)
    if (project.autoPublishId) await ctx.scheduler.cancel(project.autoPublishId)

    const domains = await ctx.db
      .query("domains")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
    for (const domain of domains) {
      await ctx.db.delete(domain._id)
      if (domain.kind === "custom") {
        await ctx.scheduler.runAfter(0, internal.domains.deprovision, {
          hostname: domain.hostname,
          cloudflareId: domain.cloudflareId,
        })
      }
    }
    await ctx.scheduler.runAfter(0, internal.edge.removeSite, {
      projectId,
      hostnames: domains.filter((d) => d.kind === "subdomain").map((d) => d.hostname),
    })

    const briefs = await ctx.db
      .query("rebuildBriefs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
    for (const brief of briefs) {
      for (const file of brief.screenshots) await ctx.storage.delete(file)
    }
    await deleteChat(ctx, projectId)
    for (const table of ["drafts", "edits", "versions", "jobs", "rebuildBriefs"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect()
      for (const row of rows) await ctx.db.delete(row._id)
    }
    await ctx.db.delete(projectId)
  },
})

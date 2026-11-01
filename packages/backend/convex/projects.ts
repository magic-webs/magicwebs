import { ConvexError, v } from "convex/values"

import { emptyPageDoc } from "@magicwebs/page-schema"

import { mutation, query } from "./_generated/server"
import { sitesRootDomain, slugify } from "./lib"

export const list = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").order("desc").take(100)
    return projects.map((p) => ({ ...p, hostname: `${p.slug}.${sitesRootDomain()}` }))
  },
})

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId)
    if (!project) return null
    return { ...project, hostname: `${project.slug}.${sitesRootDomain()}` }
  },
})

/** Create a project from a public URL and queue it for cloning. */
export const create = mutation({
  args: { url: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let url: URL
    try {
      url = new URL(/^https?:\/\//i.test(args.url) ? args.url : `https://${args.url}`)
    } catch {
      throw new ConvexError("That doesn't look like a valid URL")
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new ConvexError("Only http and https URLs can be cloned")
    }

    const base = slugify(url.hostname)
    let slug = base
    while (await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", slug)).first()) {
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
    }

    const now = Date.now()
    const name = args.name?.trim() || url.hostname.replace(/^www\./, "")
    const projectId = await ctx.db.insert("projects", {
      name,
      slug,
      sourceUrl: url.toString(),
      status: "cloning",
      step: "Queued",
      createdAt: now,
    })
    await ctx.db.insert("drafts", { projectId, doc: emptyPageDoc(name), revision: 0, updatedAt: now })
    await ctx.db.insert("jobs", { projectId, url: url.toString(), status: "queued", attempts: 0, createdAt: now })
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
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId)
    if (!project) throw new ConvexError("Project not found")
    await ctx.db.patch(projectId, { status: "cloning", step: "Queued", error: undefined })
    await ctx.db.insert("jobs", {
      projectId,
      url: project.sourceUrl,
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
    })
  },
})

export const rename = mutation({
  args: { projectId: v.id("projects"), name: v.string() },
  handler: async (ctx, { projectId, name }) => {
    if (!name.trim()) throw new ConvexError("Name can't be empty")
    await ctx.db.patch(projectId, { name: name.trim() })
  },
})

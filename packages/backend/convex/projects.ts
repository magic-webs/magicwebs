import { ConvexError, v, type ObjectType } from "convex/values"

import { HOME_PATH, MAX_SITE_PAGES } from "@magicwebs/page-schema"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { deleteChat } from "./chats"
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server"
import { ensurePages, findUserByEmail, listPages, ownedProject, requireProject, requireUser, setPageState, sitesRootDomain, syncProjectStatus, slugify, viewerProjects } from "./lib"
import { insertPages } from "./pages"
import { aiEffort, aiMode, aiModel, templateId } from "./models"

// Subdomains of SITES_ROOT_DOMAIN the platform itself uses (DNS-only records
// that bypass the edge worker), so a project slug must never take one.
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "build", "build-api", "crawler", "admin", "dashboard", "assets", "files", "sites", "mail", "status", "docs",
])

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

const createArgs = {
  url: v.string(),
  name: v.optional(v.string()),
  model: v.optional(aiModel),
  effort: v.optional(aiEffort),
  ai: v.optional(aiMode),
  template: v.optional(templateId),
  pages: v.optional(v.array(v.object({ url: v.string(), title: v.optional(v.string()) }))),
}

/**
 * Create a project from a public URL and queue its pages to be cloned. `pages`
 * are the pages of the same site to clone with it (from pages.discover); the
 * URL itself is always the home page. Agents pass `ai: "agent"` so a page too
 * large to copy is handed back to them to rebuild with their own model
 * instead of the platform's. With `template`, the site is revamped instead of
 * copied: every page is rebuilt by AI in that design template.
 */
export const create = mutation({
  args: createArgs,
  handler: async (ctx, args) => createProject(ctx, await requireUser(ctx), args),
})

/**
 * Create a project for the account with this email, as `create` does for the
 * signed-in user. For support and testing.
 * Run with: bunx convex run projects:createFor '{"email":"you@example.com","url":"https://example.com","template":"minimal"}'
 */
export const createFor = internalMutation({
  args: { ...createArgs, email: v.string() },
  handler: async (ctx, { email, ...args }) => {
    const user = await findUserByEmail(ctx, email)
    if (!user) throw new ConvexError(`No account with email ${email}`)
    return createProject(ctx, user._id, args)
  },
})

async function createProject(ctx: MutationCtx, userId: Id<"users">, args: ObjectType<typeof createArgs>) {
  if ((args.pages?.length ?? 0) + 1 > MAX_SITE_PAGES * 2) throw new ConvexError("Too many pages")
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
  while (
    RESERVED_SLUGS.has(slug) ||
    (await ctx.db.query("projects").withIndex("by_slug", (q) => q.eq("slug", slug)).first())
  ) {
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
    template: args.template,
    status: "cloning",
    step: "Queued",
    createdAt: now,
  })
  const project = (await ctx.db.get(projectId))!
  const others = (args.pages ?? []).filter((p) => p.url !== url.toString())
  await insertPages(ctx, project, [{ url: url.toString(), title: "Home" }, ...others], { now, ai: args.ai })
  await syncProjectStatus(ctx, projectId)
  await ctx.db.insert("domains", {
    projectId,
    hostname: `${slug}.${sitesRootDomain()}`,
    kind: "subdomain",
    status: "active",
    createdAt: now,
  })
  return projectId
}

/**
 * Clone pages again from the original site, replacing their drafts: one page
 * when `path` is given (e.g. retrying a failed page), else every page.
 */
export const reclone = mutation({
  args: { projectId: v.id("projects"), ai: v.optional(aiMode), path: v.optional(v.string()) },
  handler: async (ctx, { projectId, ai, path }) => {
    const project = await requireProject(ctx, projectId)
    await ensurePages(ctx, project)
    const pages = (await listPages(ctx, project)).filter((p) => !path || p.path === path)
    if (!pages.length) throw new ConvexError(`This site has no page ${path}`)
    const now = Date.now()
    for (const page of pages) {
      await ctx.db.insert("jobs", {
        projectId,
        path: page.path,
        url: page.sourceUrl,
        model: project.model,
        effort: project.effort,
        ai,
        template: project.template,
        status: "queued",
        attempts: 0,
        createdAt: now,
      })
      await setPageState(ctx, projectId, page.path, { status: "cloning", step: "Queued" })
    }
  },
})

/**
 * Revamp a project's site in a design template, or go back to exact copies
 * with `template: null`. Every page is rebuilt from the original site and its
 * draft replaced; earlier published versions stay in the history to roll back to.
 */
export const revamp = mutation({
  args: { projectId: v.id("projects"), template: v.union(templateId, v.null()), ai: v.optional(aiMode) },
  handler: async (ctx, { projectId, template, ai }) => {
    const project = await requireProject(ctx, projectId)
    await ensurePages(ctx, project)
    const pages = await listPages(ctx, project)
    if (pages.some((p) => p.status === "cloning")) {
      throw new ConvexError("Wait for the pages being cloned to finish first")
    }
    await ctx.db.patch(projectId, { template: template ?? undefined })
    const now = Date.now()
    for (const page of pages) {
      await ctx.db.insert("jobs", {
        projectId,
        path: page.path,
        url: page.sourceUrl,
        model: project.model,
        effort: project.effort,
        ai,
        template: template ?? undefined,
        status: "queued",
        attempts: 0,
        createdAt: now,
      })
      await setPageState(ctx, projectId, page.path, { status: "cloning", step: "Queued" })
    }
    await syncProjectStatus(ctx, projectId)
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
      paths: (await listPages(ctx, project)).map((p) => p.path).filter((p) => p !== HOME_PATH),
    })

    const briefs = await ctx.db
      .query("rebuildBriefs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
    for (const brief of briefs) {
      for (const file of brief.screenshots) await ctx.storage.delete(file)
    }
    await deleteChat(ctx, projectId)
    for (const table of ["pages", "drafts", "edits", "versions", "jobs", "rebuildBriefs"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect()
      for (const row of rows) await ctx.db.delete(row._id)
    }
    await ctx.db.delete(projectId)
  },
})

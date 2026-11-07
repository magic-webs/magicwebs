import { ConvexError, v } from "convex/values"
import { marked } from "marked"

import type { Doc, Id } from "./_generated/dataModel"
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { addBlogToPage, HOME_PATH } from "@magicwebs/page-schema"

import { findDraft, listPages, loadDoc, requireProject, slugify, storeDoc } from "./lib"
import { scheduleAutoPublish } from "./versions"

// The blog of a published site. Posts are written in Markdown (in the
// dashboard, by the AI chat or over MCP), saved as drafts, and published one
// at a time; the edge serves them at /blog and /blog/<slug> in the site's own
// theme, header and footer (see apps/edge and @magicwebs/renderer's blog.ts).

const MAX_BODY = 200_000
const MAX_TAGS = 12

const fields = {
  title: v.optional(v.string()),
  slug: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  body: v.optional(v.string()),
  cover: v.optional(v.string()),
  coverAlt: v.optional(v.string()),
  author: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
}

type Fields = {
  title?: string
  slug?: string
  excerpt?: string
  body?: string
  cover?: string
  coverAlt?: string
  author?: string
  tags?: string[]
  seoTitle?: string
  seoDescription?: string
}

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false, gfm: true, breaks: false }) as string
}

const optional = (value: string | undefined, max: number) =>
  value === undefined ? undefined : value.trim().slice(0, max) || undefined

/** The changes to store, checked and tidied; `undefined` leaves a field as it is. */
function clean(input: Fields) {
  if (input.body !== undefined && input.body.length > MAX_BODY) throw new ConvexError("That post is too long.")
  if (input.cover !== undefined && input.cover.trim() && !/^https:\/\//i.test(input.cover.trim())) {
    throw new ConvexError("The cover image must be an https URL.")
  }
  const title = input.title?.trim().slice(0, 200)
  if (input.title !== undefined && !title) throw new ConvexError("Give the post a title.")
  return {
    title,
    excerpt: optional(input.excerpt, 400),
    body: input.body,
    cover: optional(input.cover, 1000),
    coverAlt: optional(input.coverAlt, 200),
    author: optional(input.author, 100),
    tags:
      input.tags === undefined
        ? undefined
        : [...new Set(input.tags.map((tag) => tag.trim().slice(0, 40)).filter(Boolean))].slice(0, MAX_TAGS),
    seoTitle: optional(input.seoTitle, 200),
    seoDescription: optional(input.seoDescription, 400),
  }
}

async function uniqueSlug(ctx: QueryCtx, projectId: Id<"projects">, wanted: string, except?: Id<"posts">) {
  const base = slugify(wanted).slice(0, 80) || "post"
  let slug = base
  for (let n = 2; ; n++) {
    const taken = await ctx.db
      .query("posts")
      .withIndex("by_project_slug", (q) => q.eq("projectId", projectId).eq("slug", slug))
      .first()
    if (!taken || taken._id === except) return slug
    slug = `${base}-${n}`
  }
}

async function requirePost(ctx: QueryCtx, postId: Id<"posts">): Promise<Doc<"posts">> {
  const post = await ctx.db.get(postId)
  if (!post) throw new ConvexError("Post not found")
  await requireProject(ctx, post.projectId)
  return post
}

function summary(post: Doc<"posts">) {
  const { body: _body, html: _html, ...rest } = post
  return {
    ...rest,
    /** Published with a date still to come. */
    scheduled: post.status === "published" && (post.publishedAt ?? 0) > Date.now(),
  }
}

/** Every post of a site, drafts included, most recently changed first. */
export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProject(ctx, projectId)
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(500)
    return posts.map(summary)
  },
})

export const get = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const post = await requirePost(ctx, postId)
    const { html: _html, ...rest } = post
    return { ...rest, scheduled: summary(post).scheduled }
  },
})

/** A new draft. */
export const create = mutation({
  args: { projectId: v.id("projects"), ...fields },
  handler: async (ctx, { projectId, ...input }) => {
    await requireProject(ctx, projectId)
    if (!input.title?.trim()) throw new ConvexError("Give the post a title.")
    const tidy = clean(input)
    const now = Date.now()
    const body = tidy.body ?? ""
    return ctx.db.insert("posts", {
      projectId,
      slug: await uniqueSlug(ctx, projectId, input.slug || tidy.title!),
      title: tidy.title!,
      excerpt: tidy.excerpt,
      cover: tidy.cover,
      coverAlt: tidy.coverAlt,
      author: tidy.author,
      tags: tidy.tags ?? [],
      body,
      html: markdownToHtml(body),
      seoTitle: tidy.seoTitle,
      seoDescription: tidy.seoDescription,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    })
  },
})

/** Change a post. A published post shows the change at once. An empty string clears an optional field. */
export const update = mutation({
  args: { postId: v.id("posts"), ...fields },
  handler: async (ctx, { postId, ...input }) => {
    const post = await requirePost(ctx, postId)
    const tidy = clean(input)
    const patch: Partial<Doc<"posts">> = { updatedAt: Date.now() }
    for (const key of ["excerpt", "cover", "coverAlt", "author", "seoTitle", "seoDescription"] as const) {
      if (input[key] !== undefined) patch[key] = tidy[key]
    }
    if (tidy.title) patch.title = tidy.title
    if (tidy.tags) patch.tags = tidy.tags
    if (tidy.body !== undefined) {
      patch.body = tidy.body
      patch.html = markdownToHtml(tidy.body)
    }
    if (input.slug !== undefined && input.slug.trim()) patch.slug = await uniqueSlug(ctx, post.projectId, input.slug, post._id)
    await ctx.db.patch(postId, patch)
  },
})

/**
 * Link the site to its blog: a "Blog" link in every page's navbar and a
 * "Latest posts" section on the home page, then publish like any edit does.
 * Pages that have them already are left alone.
 */
async function linkSiteToBlog(ctx: MutationCtx, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId)
  if (!project) return
  let changed = false
  for (const page of await listPages(ctx, project)) {
    const draft = await findDraft(ctx, projectId, page.path)
    if (!draft) continue
    const next = addBlogToPage(await loadDoc(ctx, draft.doc), { home: page.path === HOME_PATH })
    if (!next) continue
    const revision = draft.revision + 1
    const now = Date.now()
    await ctx.db.patch(draft._id, { doc: await storeDoc(ctx, next), revision, updatedAt: now })
    await ctx.db.insert("edits", {
      projectId,
      path: page.path,
      revision,
      source: "blog",
      ops: [],
      results: [page.path === HOME_PATH ? "Linked the blog in the navbar and added a Latest posts section" : "Linked the blog in the navbar"],
      createdAt: now,
    })
    changed = true
  }
  if (changed && project.publishedVersionId) await scheduleAutoPublish(ctx, projectId)
}

/** Make a post live now, or at `at` (ms since epoch) to schedule it. The site's first post links the site to the blog. */
export const publish = mutation({
  args: { postId: v.id("posts"), at: v.optional(v.number()) },
  handler: async (ctx, { postId, at }) => {
    const post = await requirePost(ctx, postId)
    if (!post.body.trim()) throw new ConvexError("Write the post before publishing it.")
    const others = await ctx.db
      .query("posts")
      .withIndex("by_project_live", (q) => q.eq("projectId", post.projectId).eq("status", "published"))
      .first()
    if (!others) await linkSiteToBlog(ctx, post.projectId)
    const now = Date.now()
    const publishedAt = at ?? (post.status === "published" && post.publishedAt && post.publishedAt <= now ? post.publishedAt : now)
    await ctx.db.patch(postId, { status: "published", publishedAt, updatedAt: now })
  },
})

/** Take a post off the site; it stays as a draft. */
export const unpublish = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    await requirePost(ctx, postId)
    await ctx.db.patch(postId, { status: "draft", updatedAt: Date.now() })
  },
})

export const remove = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    await requirePost(ctx, postId)
    await ctx.db.delete(postId)
  },
})

export const settings = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId)
    return { title: project.blog?.title ?? "Blog", intro: project.blog?.intro ?? "" }
  },
})

/** The blog page's heading and intro. */
export const setSettings = mutation({
  args: { projectId: v.id("projects"), title: v.optional(v.string()), intro: v.optional(v.string()) },
  handler: async (ctx, { projectId, title, intro }) => {
    const project = await requireProject(ctx, projectId)
    await ctx.db.patch(projectId, {
      blog: {
        title: title === undefined ? project.blog?.title : title.trim().slice(0, 120) || undefined,
        intro: intro === undefined ? project.blog?.intro : intro.trim().slice(0, 400) || undefined,
      },
    })
  },
})

// --- For the edge worker ------------------------------------------------------

async function publishedProject(ctx: QueryCtx, hostname: string) {
  const domain = await ctx.db
    .query("domains")
    .withIndex("by_hostname", (q) => q.eq("hostname", hostname))
    .first()
  if (!domain || domain.status !== "active") return null
  const project = await ctx.db.get(domain.projectId)
  return project?.publishedVersionId ? project : null
}

async function livePosts(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">) {
  return ctx.db
    .query("posts")
    .withIndex("by_project_live", (q) => q.eq("projectId", projectId).eq("status", "published").lte("publishedAt", Date.now()))
    .order("desc")
    .take(500)
}

/** The live posts of the site at this hostname, newest first, without their bodies. */
export const blogByHost = internalQuery({
  args: { hostname: v.string() },
  handler: async (ctx, { hostname }) => {
    const project = await publishedProject(ctx, hostname)
    if (!project) return null
    const posts = await livePosts(ctx, project._id)
    return {
      title: project.blog?.title ?? "Blog",
      intro: project.blog?.intro,
      posts: posts.map((post) => ({
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        cover: post.cover,
        author: post.author,
        tags: post.tags,
        publishedAt: post.publishedAt!,
        updatedAt: post.updatedAt,
      })),
    }
  },
})

/** One live post of the site at this hostname. */
export const postByHost = internalQuery({
  args: { hostname: v.string(), slug: v.string() },
  handler: async (ctx, { hostname, slug }) => {
    const project = await publishedProject(ctx, hostname)
    if (!project) return null
    const post = await ctx.db
      .query("posts")
      .withIndex("by_project_slug", (q) => q.eq("projectId", project._id).eq("slug", slug))
      .first()
    if (!post || post.status !== "published" || (post.publishedAt ?? Infinity) > Date.now()) return null
    return {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      cover: post.cover,
      coverAlt: post.coverAlt,
      author: post.author,
      tags: post.tags,
      html: post.html,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      publishedAt: post.publishedAt!,
      updatedAt: post.updatedAt,
    }
  },
})

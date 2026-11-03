import { ConvexError, v } from "convex/values"

import {
  emptyPageDoc,
  HOME_PATH,
  isSameSite,
  MAX_SITE_PAGES,
  pagePath,
  titleFromPath,
} from "@magicwebs/page-schema"

import type { Doc } from "./_generated/dataModel"
import { action, mutation, query, type MutationCtx } from "./_generated/server"
import { ensurePages, findDraft, findPage, listPages, ownedProject, requireProject, syncProjectStatus } from "./lib"
import { scheduleAutoPublish } from "./versions"

// A project is a site of up to MAX_SITE_PAGES pages. Before cloning, the
// pages of the original site are discovered from the links on the page the
// user entered and from the site's sitemap, so the user can pick which to clone.

export type DiscoveredPage = { url: string; path: string; title: string }

const FETCH_TIMEOUT_MS = 10_000
const MAX_HTML_CHARS = 3_000_000
const MAX_CANDIDATES = 60
const USER_AGENT = "Mozilla/5.0 (compatible; MagicwebsBot/1.0; +https://build.magicwebs.ai)"

/** Not pages: files, feeds and account or checkout flows a clone can't reproduce. */
const NOT_A_PAGE =
  /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|zip|rar|gz|mp4|webm|mov|mp3|wav|xml|json|rss|atom|css|js|txt|docx?|xlsx?|pptx?|csv)$/i
const SKIPPED_PATHS =
  /^\/(wp-admin|wp-login|wp-json|feed|login|log-in|signin|sign-in|signup|sign-up|logout|register|account|my-account|cart|checkout|basket|admin|cdn-cgi)(\/|$)/i

async function fetchText(url: string, accept: string): Promise<{ text: string; finalUrl: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: accept },
    })
    if (!res.ok) return null
    const text = (await res.text()).slice(0, MAX_HTML_CHARS)
    return { text, finalUrl: res.url || url }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : match
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
}

function cleanText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim()
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
  const value = match?.[1] ?? match?.[2] ?? match?.[3]
  return value === undefined ? undefined : decodeEntities(value)
}

/** The page URL a link points to on the same site, or null when it isn't a clonable page. */
function pageUrl(href: string, base: URL, site: URL): URL | null {
  if (!href || href.startsWith("#") || /^(mailto:|tel:|sms:|javascript:|data:)/i.test(href)) return null
  let url: URL
  try {
    url = new URL(href, base)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (!isSameSite(url, site)) return null
  const path = pagePath(url)
  if (NOT_A_PAGE.test(path) || SKIPPED_PATHS.test(path)) return null
  return new URL(path, site.origin)
}

function linksIn(html: string, base: URL, site: URL): { url: URL; title: string }[] {
  const found: { url: URL; title: string }[] = []
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const tag = match[1] ?? ""
    const url = pageUrl(attr(tag, "href") ?? "", base, site)
    if (!url) continue
    const text = cleanText(match[2] ?? "") || attr(tag, "aria-label") || attr(tag, "title") || ""
    found.push({ url, title: text.length > 60 ? "" : text })
  }
  return found
}

async function sitemapUrls(site: URL): Promise<string[]> {
  const robots = await fetchText(new URL("/robots.txt", site.origin).href, "text/plain")
  const listed = [...(robots?.text.matchAll(/^\s*sitemap:\s*(\S+)/gim) ?? [])].map((m) => m[1]!).slice(0, 3)
  const sitemaps = listed.length ? listed : [new URL("/sitemap.xml", site.origin).href]
  const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]!))

  const urls: string[] = []
  for (const sitemap of sitemaps) {
    const res = await fetchText(sitemap, "application/xml,text/xml")
    if (!res) continue
    if (/<sitemapindex/i.test(res.text)) {
      // A sitemap index: read the first few sitemaps it lists.
      for (const child of locs(res.text).slice(0, 3)) {
        const inner = await fetchText(child, "application/xml,text/xml")
        if (inner) urls.push(...locs(inner.text))
      }
    } else {
      urls.push(...locs(res.text))
    }
    if (urls.length > 500) break
  }
  return urls
}

/**
 * Find the pages of the site a URL belongs to: the page itself first, then
 * the pages it links to in the order they appear (menus come first), then
 * pages only listed in the sitemap.
 */
export const discover = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<{ url: string; title: string; pages: DiscoveredPage[] }> => {
    if (!(await ctx.auth.getUserIdentity())) throw new ConvexError("Sign in to continue")
    let entered: URL
    try {
      entered = new URL(/^https?:\/\//i.test(args.url) ? args.url : `https://${args.url}`)
    } catch {
      throw new ConvexError("That doesn't look like a valid URL")
    }
    if (entered.protocol !== "http:" && entered.protocol !== "https:") {
      throw new ConvexError("Only http and https URLs are supported")
    }

    const home = await fetchText(entered.href, "text/html,application/xhtml+xml")
    if (!home) throw new ConvexError("Couldn't open that page. Check the URL and that the site is public.")
    const finalUrl = new URL(home.finalUrl)
    const site = new URL(finalUrl.origin)
    const homeUrl = new URL(pagePath(finalUrl), site.origin)
    const pageTitle = cleanText(home.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || finalUrl.hostname

    const pages = new Map<string, DiscoveredPage>()
    const add = (url: URL, title: string) => {
      const path = pagePath(url)
      if (pages.size >= MAX_CANDIDATES && !pages.has(path)) return
      const existing = pages.get(path)
      if (existing) {
        // Keep the shortest real link text as the name.
        if (title && (existing.title === titleFromPath(path) || title.length < existing.title.length)) existing.title = title
        return
      }
      pages.set(path, { url: url.href, path, title: title || titleFromPath(path) })
    }

    add(homeUrl, "Home")
    const baseHref = attr(home.text.match(/<base\b[^>]*>/i)?.[0] ?? "", "href")
    let base = finalUrl
    try {
      if (baseHref) base = new URL(baseHref, finalUrl)
    } catch {
      // Ignore a malformed <base>.
    }
    for (const link of linksIn(home.text, base, site)) add(link.url, link.title)
    for (const loc of await sitemapUrls(site)) {
      const url = pageUrl(loc, site, site)
      if (url) add(url, "")
    }
    // The entered page is the home page of the clone, whatever its path.
    const entry = pages.get(pagePath(homeUrl))!
    entry.title = "Home"
    return { url: homeUrl.href, title: pageTitle, pages: [...pages.values()] }
  },
})

/** The pages of a project's site, home first, without their documents. */
export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ownedProject(ctx, projectId)
    if (!project) return []
    return (await listPages(ctx, project)).map(({ path, title, sourceUrl, status, step, error, order }) => ({
      path,
      title,
      sourceUrl,
      status,
      step,
      error,
      order,
    }))
  },
})

export type PageChoice = { url: string; title?: string }

/**
 * Add pages to a project and queue them for cloning. The first page of a new
 * project is its home page, served at "/" whatever its original path; the
 * others keep their original paths. Pages already in the project are skipped.
 */
export async function insertPages(
  ctx: MutationCtx,
  project: Doc<"projects">,
  choices: PageChoice[],
  options: { now: number; ai?: "platform" | "agent" },
): Promise<string[]> {
  const existing = await listPages(ctx, project)
  const sources = new Set(existing.filter((p) => !p.legacy).map((p) => pagePath(p.sourceUrl)))
  const paths = new Set(existing.filter((p) => !p.legacy).map((p) => p.path))
  let order = existing.filter((p) => !p.legacy).reduce((max, p) => Math.max(max, p.order), -1) + 1
  const added: string[] = []

  for (const choice of choices) {
    let url: URL
    try {
      url = new URL(choice.url)
    } catch {
      throw new ConvexError(`"${choice.url}" isn't a valid URL`)
    }
    if (!isSameSite(url, project.sourceUrl)) {
      throw new ConvexError(`${url.hostname} isn't part of ${new URL(project.sourceUrl).hostname}`)
    }
    const source = pagePath(url)
    if (sources.has(source)) continue
    if (paths.size >= MAX_SITE_PAGES) {
      throw new ConvexError(`A site can have at most ${MAX_SITE_PAGES} pages`)
    }

    // The first page is the home page. A later page whose original path is "/"
    // (the original site's root, when the user started from an inner page) moves to /home.
    let path = paths.size === 0 ? HOME_PATH : source
    if (paths.has(path)) path = path === HOME_PATH ? "/home" : `${path}-2`
    if (paths.has(path)) continue

    const title = choice.title?.trim().slice(0, 80) || titleFromPath(path)
    await ctx.db.insert("pages", {
      projectId: project._id,
      path,
      title: path === HOME_PATH ? "Home" : title,
      sourceUrl: url.href,
      status: "cloning",
      step: "Queued",
      order: order++,
      createdAt: options.now,
    })
    if (!(await findDraft(ctx, project._id, path))) {
      await ctx.db.insert("drafts", { projectId: project._id, path, doc: emptyPageDoc(title), revision: 0, updatedAt: options.now })
    }
    await ctx.db.insert("jobs", {
      projectId: project._id,
      path,
      url: url.href,
      model: project.model,
      effort: project.effort,
      ai: options.ai,
      status: "queued",
      attempts: 0,
      createdAt: options.now,
    })
    sources.add(source)
    paths.add(path)
    added.push(path)
  }
  return added
}

/** Clone more pages of the original site into an existing project. */
export const add = mutation({
  args: {
    projectId: v.id("projects"),
    pages: v.array(v.object({ url: v.string(), title: v.optional(v.string()) })),
    ai: v.optional(v.union(v.literal("platform"), v.literal("agent"))),
  },
  handler: async (ctx, { projectId, pages, ai }) => {
    const project = await requireProject(ctx, projectId)
    await ensurePages(ctx, project)
    const added = await insertPages(ctx, project, pages, { now: Date.now(), ai })
    if (added.length) await syncProjectStatus(ctx, projectId)
    return { added }
  },
})

/** Remove a page from the site. The home page can't be removed. */
export const remove = mutation({
  args: { projectId: v.id("projects"), path: v.string() },
  handler: async (ctx, { projectId, path }) => {
    const project = await requireProject(ctx, projectId)
    if (path === HOME_PATH) throw new ConvexError("The home page can't be removed")
    const page = await findPage(ctx, projectId, path)
    if (!page) throw new ConvexError(`This site has no page ${path}`)
    await ctx.db.delete(page._id)
    const draft = await findDraft(ctx, projectId, path)
    if (draft) await ctx.db.delete(draft._id)
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect()
    for (const job of jobs) {
      if (job.path === path && (job.status === "queued" || job.status === "awaiting_agent")) {
        await ctx.db.patch(job._id, { status: "failed", error: "Page removed" })
      }
    }
    await syncProjectStatus(ctx, projectId)
    // The live site drops the page with the next version.
    if (project.publishedVersionId) await scheduleAutoPublish(ctx, projectId)
  },
})

/** Rename a page as it appears in the editor's page list. */
export const rename = mutation({
  args: { projectId: v.id("projects"), path: v.string(), title: v.string() },
  handler: async (ctx, { projectId, path, title }) => {
    const project = await requireProject(ctx, projectId)
    await ensurePages(ctx, project)
    const page = await findPage(ctx, projectId, path)
    if (!page) throw new ConvexError(`This site has no page ${path}`)
    if (!title.trim()) throw new ConvexError("Name can't be empty")
    await ctx.db.patch(page._id, { title: title.trim().slice(0, 80) })
  },
})

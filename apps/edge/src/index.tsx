import { HOME_PATH, pagePath, rewriteSiteLinks, type PageDoc, type SitePage } from "@magicwebs/page-schema"
import { renderPage } from "@magicwebs/renderer/server"

// One Worker serves every published site. The hostname selects the project,
// the path selects the page, Convex says which version is live, and React
// renders it to HTML. Asking
// Convex makes a publish live within seconds; Workers KV (written on every
// publish) is the fallback when Convex can't be reached.

type Env = {
  SITES: KVNamespace
  /** Convex HTTP actions URL, e.g. https://watchful-robin-407.convex.site */
  CONVEX_SITE_URL?: string
}

type PublishedPage = SitePage & { title?: string }

/** The site's Magic Agent chat widget (see packages/backend/convex/widget.ts). */
type Widget = {
  src: string
  position?: "left" | "right"
  /** Unset: the page's primary color. */
  color?: string
  teaser?: string
  hiddenPaths: string[]
}

type PublishedSite = {
  version: number
  publishedAt: number
  /** Missing on sites published before multi-page sites: then the site is one home page. */
  pages?: PublishedPage[]
  widget?: Widget | null
  /** The home page. */
  doc: PageDoc
}

const KV_CACHE_TTL = 60
const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  // Always revalidate so a publish shows up on the next load. Rendering is
  // cached per version inside the worker, so this stays cheap.
  "Cache-Control": "public, max-age=0, must-revalidate",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
}

/** Bump when the rendered HTML changes shape, so cached renders are rebuilt. */
const RENDER_REVISION = 8

/** How often an open page checks for a newer published version. */
const LIVE_RELOAD_INTERVAL_MS = 4000

/**
 * Keeps an open page in step with what is published: when the live version
 * changes, reload and land back at the same scroll position. Hidden tabs don't poll.
 */
function liveReloadScript(version: number) {
  return `<script>(()=>{const v=${version},k="mw-scroll";try{const y=sessionStorage.getItem(k);if(y!==null){sessionStorage.removeItem(k);addEventListener("load",()=>scrollTo(0,+y))}}catch{}let busy=false;async function check(){if(busy||document.hidden)return;busy=true;try{const r=await fetch("/__version",{cache:"no-store"});if(r.ok){const d=await r.json();if(d.version!==v){try{sessionStorage.setItem(k,String(scrollY))}catch{}location.reload()}}}catch{}busy=false}setInterval(check,${LIVE_RELOAD_INTERVAL_MS});document.addEventListener("visibilitychange",check)})()</script>`
}

function notFound(message: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Not found</title><body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;color:#555"><p>${message}</p></body>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" } },
  )
}

type LiveVersion = {
  projectId: string
  version: number
  publishedAt: number
  pages?: PublishedPage[]
  widget?: Widget | null
}

async function cachedJson<T>(url: string, ctx: ExecutionContext): Promise<T | null> {
  const cache = caches.default
  const key = new Request(url)
  let response = await cache.match(key)
  if (!response) {
    response = await fetch(url)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Convex responded ${response.status}`)
    ctx.waitUntil(cache.put(key, response.clone()))
  }
  return response.json<T>()
}

/** Ask Convex which version is live. Returns undefined when Convex is unavailable. */
async function liveFromConvex(env: Env, hostname: string, ctx: ExecutionContext) {
  if (!env.CONVEX_SITE_URL) return undefined
  try {
    return await cachedJson<LiveVersion>(`${env.CONVEX_SITE_URL}/edge/live?host=${encodeURIComponent(hostname)}`, ctx)
  } catch (error) {
    console.error("Convex live lookup failed, using KV:", error)
    return undefined
  }
}

async function loadSite(
  env: Env,
  hostname: string,
  ctx: ExecutionContext,
): Promise<{ projectId: string; site: PublishedSite | LiveVersion } | null> {
  const live = await liveFromConvex(env, hostname, ctx)
  if (live !== undefined) return live && { projectId: live.projectId, site: live }

  const projectId = await env.SITES.get(`host:${hostname}`, { cacheTtl: KV_CACHE_TTL })
  if (!projectId) return null
  const site = await env.SITES.get<PublishedSite>(`site:${projectId}`, { type: "json", cacheTtl: KV_CACHE_TTL })
  return site ? { projectId, site } : null
}

async function kvPage(env: Env, projectId: string, path: string): Promise<PageDoc | null> {
  if (path === HOME_PATH) return (await env.SITES.get<PublishedSite>(`site:${projectId}`, "json"))?.doc ?? null
  return (await env.SITES.get<{ doc: PageDoc }>(`page:${projectId}:${path}`, "json"))?.doc ?? null
}

/** A page of a version: from the lookup itself (KV), from Convex, or from KV as a last resort. */
async function loadDoc(env: Env, projectId: string, site: PublishedSite | LiveVersion, path: string, ctx: ExecutionContext) {
  if ("doc" in site) return path === HOME_PATH ? site.doc : kvPage(env, projectId, path)
  if (env.CONVEX_SITE_URL) {
    try {
      const doc = await cachedJson<PageDoc>(
        `${env.CONVEX_SITE_URL}/edge/doc?projectId=${projectId}&version=${site.version}&path=${encodeURIComponent(path)}`,
        ctx,
      )
      if (doc) return doc
    } catch (error) {
      console.error("Convex doc fetch failed, using KV:", error)
    }
  }
  return kvPage(env, projectId, path)
}

function sitePages(site: PublishedSite | LiveVersion): PublishedPage[] {
  return site.pages?.length ? site.pages : [{ path: HOME_PATH, source: "" }]
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`)
}

/** The widget's embed script for one page, or "" where it doesn't show. */
function widgetScript(widget: Widget | null | undefined, path: string, doc: PageDoc | null): string {
  if (!widget || widget.hiddenPaths.includes(path)) return ""
  const attrs: Record<string, string | undefined> = {
    "data-position": widget.position,
    "data-color": widget.color ?? doc?.theme.colors.primary,
    "data-teaser": widget.teaser,
  }
  const extra = Object.entries(attrs)
    .filter(([, value]) => value)
    .map(([name, value]) => ` ${name}="${escapeXml(value!)}"`)
    .join("")
  return `<script src="${escapeXml(widget.src)}"${extra} async></script>`
}

/** A short, stable fingerprint, so a change of widget settings misses the render cache. */
function fingerprint(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(36)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } })
    }
    const url = new URL(request.url)
    const hostname = url.hostname.toLowerCase()

    if (url.pathname === "/robots.txt") {
      return new Response(`User-agent: *\nAllow: /\nSitemap: https://${hostname}/sitemap.xml\n`, {
        headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=3600" },
      })
    }

    const found = await loadSite(env, hostname, ctx)
    if (!found) return notFound("This site hasn't been published yet.")
    const { projectId, site } = found

    const pages = sitePages(site)
    if (url.pathname === "/sitemap.xml") {
      const lastmod = new Date(site.publishedAt).toISOString()
      const urls = pages
        .map((p) => `<url><loc>${escapeXml(`https://${hostname}${p.path}`)}</loc><lastmod>${lastmod}</lastmod></url>`)
        .join("")
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
        { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } },
      )
    }
    if (url.pathname === "/__version") {
      return Response.json({ version: site.version }, { headers: { "Cache-Control": "no-store" } })
    }
    let path: string
    try {
      path = pagePath(decodeURI(url.pathname))
    } catch {
      return notFound("Page not found.")
    }
    if (!pages.some((p) => p.path === path)) return notFound("Page not found.")
    // One canonical address per page: /about/ redirects to /about.
    if (url.pathname !== path && encodeURI(path) !== url.pathname) {
      return Response.redirect(`https://${hostname}${encodeURI(path)}${url.search}`, 301)
    }

    // The version is part of the cache key, so a new version is rendered fresh
    // without purging anything.
    const cache = caches.default
    const widget = site.widget && !site.widget.hiddenPaths.includes(path) ? site.widget : null
    const widgetKey = widget ? fingerprint(JSON.stringify(widget)) : "none"
    const cacheKey = new Request(
      `https://render.cache/r${RENDER_REVISION}/${projectId}/v${site.version}/w${widgetKey}/${hostname}${encodeURI(path)}`,
    )
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    const stored = await loadDoc(env, projectId, site, path, ctx)
    if (!stored) return notFound("This site hasn't been published yet.")
    // Links between the cloned pages point at the clone's own paths.
    const doc = pages.length > 1 ? rewriteSiteLinks(stored, pages.filter((p) => p.source)) : stored
    const stream = await renderPage(doc, { url: `https://${hostname}${encodeURI(path)}` })
    const rendered = await new Response(stream).text()
    const script = liveReloadScript(site.version) + widgetScript(widget, path, stored)
    const bodyEnd = rendered.lastIndexOf("</body>")
    const html = bodyEnd < 0 ? rendered + script : rendered.slice(0, bodyEnd) + script + rendered.slice(bodyEnd)
    const response = new Response(html, {
      headers: { ...HTML_HEADERS, ETag: `"${projectId}-v${site.version}-w${widgetKey}-${encodeURIComponent(path)}"` },
    })
    ctx.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  },
} satisfies ExportedHandler<Env>

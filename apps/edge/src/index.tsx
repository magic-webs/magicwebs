import type { PageDoc } from "@magicwebs/page-schema"
import { renderPage } from "@magicwebs/renderer/server"

// One Worker serves every published landing page. The hostname selects the
// project, the published JSON comes from KV, and React renders it to HTML.
// Publishing writes new JSON to KV, so no page ever needs its own build.

type Env = {
  SITES: KVNamespace
}

type PublishedSite = {
  version: number
  publishedAt: number
  doc: PageDoc
}

const KV_CACHE_TTL = 60
const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  // Browsers revalidate; Cloudflare's edge may serve a stale copy while it does.
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
}

function notFound(message: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Not found</title><body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;color:#555"><p>${message}</p></body>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" } },
  )
}

async function loadSite(env: Env, hostname: string): Promise<{ projectId: string; site: PublishedSite } | null> {
  const projectId = await env.SITES.get(`host:${hostname}`, { cacheTtl: KV_CACHE_TTL })
  if (!projectId) return null
  const site = await env.SITES.get<PublishedSite>(`site:${projectId}`, { type: "json", cacheTtl: KV_CACHE_TTL })
  return site ? { projectId, site } : null
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

    const found = await loadSite(env, hostname)
    if (!found) return notFound("This site hasn't been published yet.")
    const { projectId, site } = found

    if (url.pathname === "/sitemap.xml") {
      const lastmod = new Date(site.publishedAt).toISOString()
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${hostname}/</loc><lastmod>${lastmod}</lastmod></url></urlset>`,
        { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } },
      )
    }
    if (url.pathname !== "/") return notFound("Page not found.")

    // The version is part of the cache key, so publishing a new version is
    // picked up as soon as KV propagates, without purging anything.
    const cache = caches.default
    const cacheKey = new Request(`https://render.cache/${projectId}/v${site.version}/${hostname}`)
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    const stream = await renderPage(site.doc, { url: `https://${hostname}/` })
    const html = await new Response(stream).text()
    const response = new Response(html, {
      headers: { ...HTML_HEADERS, ETag: `"${projectId}-v${site.version}"` },
    })
    ctx.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  },
} satisfies ExportedHandler<Env>

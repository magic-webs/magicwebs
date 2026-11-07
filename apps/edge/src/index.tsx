import { HOME_PATH, pagePath, rewriteSiteLinks, type PageDoc, type SitePage } from "@magicwebs/page-schema"
import { blogIndexHtml, blogPostHtml, blogShell, type BlogCard, type BlogPost } from "@magicwebs/renderer"
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
  stoppedForms?: string[]
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
  stoppedForms?: string[]
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

/**
 * Sends the page's forms to /__forms, so what visitors submit becomes a lead:
 * form sections (data-mw-form) and forms copied from the original site, keyed
 * "<section id>:<n>". Search forms and stopped forms are left alone. Answers
 * are taken by name, else id, placeholder or label, so forms built for a
 * script still say what each answer was.
 */
function formsScript(stopped: string[]): string {
  return `<script>(()=>{const off=new Set(${JSON.stringify(stopped).replace(/</g, "\\u003c")});
function key(f){if(f.dataset.mwForm)return f.dataset.mwForm;const s=f.closest("[data-section-id]");return (s?s.getAttribute("data-section-id"):"page")+":"+[...(s||document).querySelectorAll("form")].indexOf(f)}
function search(f){if(f.getAttribute("role")==="search"||/search/i.test(f.getAttribute("action")||"")||f.querySelector("input[type=search]"))return true;const i=[...f.elements].filter(e=>e.name&&!["hidden","submit","button"].includes(e.type));return i.length===1&&/^(q|s|query|search)$/i.test(i[0].name)}
function label(e,f,n){if(e.name)return e.name;if(e.id){const l=f.querySelector('label[for="'+CSS.escape(e.id)+'"]');if(l&&l.textContent.trim())return l.textContent.trim()}return e.getAttribute("aria-label")||e.placeholder||e.id||e.type+"_"+n}
document.addEventListener("submit",async ev=>{const f=ev.target;if(!(f instanceof HTMLFormElement)||f.hasAttribute("data-mw-skip")||search(f))return;const k=key(f);if(off.has(k))return;
ev.preventDefault();ev.stopImmediatePropagation();if(!f.reportValidity())return;
const fields=[];[...f.elements].forEach((e,n)=>{if(!e.type||["submit","button","reset","file","password","image"].includes(e.type)||(e.type==="hidden"&&e.name!=="_hp"))return;if((e.type==="checkbox"||e.type==="radio")&&!e.checked)return;const vals=e.type==="select-multiple"?[...e.selectedOptions].map(o=>o.value):[e.value];for(const v of vals)if(v)fields.push({key:label(e,f,n),value:v})});
const b=f.querySelector("[type=submit],button:not([type])");if(b)b.disabled=true;let ok=false,msg="";
try{const r=await fetch("/__forms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({form:k,path:location.pathname,fields})});ok=r.ok;if(!ok)msg=((await r.json().catch(()=>({}))).error)||""}catch{}
if(b)b.disabled=false;
if(ok){const d=document.createElement("p");d.className="mw-form-done";d.setAttribute("role","status");d.textContent=f.dataset.mwSuccess||"Thanks! We'll be in touch soon.";f.replaceWith(d)}
else{let e=f.querySelector(".mw-form-error");if(!e){e=document.createElement("p");e.className="mw-form-error";e.setAttribute("role","alert");f.appendChild(e)}e.textContent=msg||"Sorry, that didn't send. Please try again."}},true)})()</script>`
}

/**
 * Visitor analytics, without cookies: a view when the page loads (with where
 * the visitor came from), then how long the page was visible and how far it
 * was scrolled, sent again each time the tab is hidden. See /__a.
 */
const ANALYTICS_SCRIPT = `<script>(()=>{if(navigator.webdriver)return;let id=null,since=Date.now(),seen=0,depth=0;const q=new URLSearchParams(location.search);
fetch("/__a",{method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"view",path:location.pathname,referrer:document.referrer,utmSource:q.get("utm_source")||q.get("ref")||undefined,utmMedium:q.get("utm_medium")||undefined,utmCampaign:q.get("utm_campaign")||undefined})}).then(r=>r.ok?r.json():null).then(d=>{id=d&&d.id}).catch(()=>{});
const scroll=()=>{const h=document.documentElement,d=Math.min(100,Math.round((scrollY+innerHeight)/Math.max(h.scrollHeight,1)*100));if(d>depth)depth=d};addEventListener("scroll",scroll,{passive:true});scroll();
const send=()=>{if(id)navigator.sendBeacon("/__a",JSON.stringify({type:"engage",id,duration:seen,scroll:depth}))};
document.addEventListener("visibilitychange",()=>{if(document.hidden){seen+=Date.now()-since;send()}else since=Date.now()});
addEventListener("pagehide",()=>{if(!document.hidden){seen+=Date.now()-since;since=Date.now()}send()})})()</script>`

/** A short, stable fingerprint, so a change of widget settings misses the render cache. */
function fingerprint(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(36)
}

type Blog = { title: string; intro?: string; posts: (BlogCard & { updatedAt: number })[] }
type LivePost = BlogPost & { seoTitle?: string; seoDescription?: string; updatedAt: number }

/** The site's live blog posts, or null when Convex can't say. */
async function loadBlog(env: Env, hostname: string, ctx: ExecutionContext): Promise<Blog | null> {
  if (!env.CONVEX_SITE_URL) return null
  try {
    return await cachedJson<Blog>(`${env.CONVEX_SITE_URL}/edge/blog?host=${encodeURIComponent(hostname)}`, ctx)
  } catch (error) {
    console.error("Blog lookup failed:", error)
    return null
  }
}

function rss(blog: Blog, hostname: string, siteTitle: string): Response {
  const base = `https://${hostname}/blog`
  const items = blog.posts
    .slice(0, 50)
    .map(
      (post) =>
        `<item><title>${escapeXml(post.title)}</title><link>${escapeXml(`${base}/${encodeURIComponent(post.slug)}`)}</link><guid>${escapeXml(
          `${base}/${encodeURIComponent(post.slug)}`,
        )}</guid><pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>${
          post.excerpt ? `<description>${escapeXml(post.excerpt)}</description>` : ""
        }</item>`,
    )
    .join("")
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(`${blog.title} · ${siteTitle}`)}</title><link>${escapeXml(
      base,
    )}</link><description>${escapeXml(blog.intro ?? siteTitle)}</description>${items}</channel></rss>`,
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } },
  )
}

/** Put the site's scripts (analytics, forms, widget) at the end of a rendered page. */
function withScripts(rendered: string, scripts: string): string {
  const bodyEnd = rendered.lastIndexOf("</body>")
  return bodyEnd < 0 ? rendered + scripts : rendered.slice(0, bodyEnd) + scripts + rendered.slice(bodyEnd)
}

const FORM_BODY_MAX = 64_000

/** A form on a published page was sent: hand it to Convex, which files the lead. */
async function submitForm(request: Request, env: Env, hostname: string): Promise<Response> {
  const headers = { "Cache-Control": "no-store" }
  // Same-origin only: the page's own script posts here.
  const origin = request.headers.get("Origin")
  if (origin && new URL(origin).hostname.toLowerCase() !== hostname) return Response.json({ ok: false }, { status: 403, headers })
  if (!env.CONVEX_SITE_URL) return Response.json({ ok: false }, { status: 503, headers })
  const text = await request.text()
  if (text.length > FORM_BODY_MAX) return Response.json({ ok: false }, { status: 413, headers })
  let body: { form?: unknown; path?: unknown; fields?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return Response.json({ ok: false }, { status: 400, headers })
  }
  const response = await fetch(`${env.CONVEX_SITE_URL}/forms/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hostname,
      form: body.form,
      path: body.path,
      fields: body.fields,
      ip: request.headers.get("CF-Connecting-IP") ?? undefined,
    }),
  })
  return new Response(await response.text(), {
    status: response.status,
    headers: { ...headers, "Content-Type": "application/json" },
  })
}

/** A page view or its time on page: add who and where from the request, and hand it to Convex. */
async function collect(request: Request, env: Env, hostname: string, ctx: ExecutionContext): Promise<Response> {
  const headers = { "Cache-Control": "no-store" }
  const text = await request.text()
  if (!env.CONVEX_SITE_URL || text.length > 4_000) return Response.json({ id: null }, { headers })
  let body: Record<string, unknown>
  try {
    body = JSON.parse(text)
  } catch {
    return Response.json({ id: null }, { status: 400, headers })
  }
  const cf = (request as Request & { cf?: { country?: string; city?: string } }).cf
  const forward = fetch(`${env.CONVEX_SITE_URL}/analytics/collect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      hostname,
      ip: request.headers.get("CF-Connecting-IP") ?? undefined,
      ua: request.headers.get("User-Agent") ?? "",
      country: cf?.country,
      city: cf?.city,
    }),
  })
  // Time on page arrives as the visitor leaves; nobody waits for the answer.
  if (body.type === "engage") {
    ctx.waitUntil(forward.then(() => undefined, () => undefined))
    return new Response(null, { status: 204, headers })
  }
  try {
    const response = await forward
    return Response.json(await response.json(), { headers })
  } catch {
    return Response.json({ id: null }, { headers })
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const hostname = url.hostname.toLowerCase()
    if (request.method === "POST" && url.pathname === "/__forms") return submitForm(request, env, hostname)
    if (request.method === "POST" && url.pathname === "/__a") return collect(request, env, hostname, ctx)
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } })
    }

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
      const blog = await loadBlog(env, hostname, ctx)
      const posts = blog?.posts.length
        ? [`https://${hostname}/blog`, ...blog.posts.map((p) => `https://${hostname}/blog/${encodeURIComponent(p.slug)}`)].map(
            (loc, i) =>
              `<url><loc>${escapeXml(loc)}</loc><lastmod>${new Date(i === 0 ? blog.posts[0]!.updatedAt : blog.posts[i - 1]!.updatedAt).toISOString()}</lastmod></url>`,
          )
        : []
      const urls = pages
        .map((p) => `<url><loc>${escapeXml(`https://${hostname}${p.path}`)}</loc><lastmod>${lastmod}</lastmod></url>`)
        .concat(posts)
        .join("")
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
        { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } },
      )
    }
    if (url.pathname === "/__version") {
      return Response.json({ version: site.version }, { headers: { "Cache-Control": "no-store" } })
    }

    // The blog: the site's own header, footer and theme around its posts. A
    // cloned /blog page keeps its place until the first post is published.
    const blogPath = url.pathname.replace(/\/+$/, "") || "/"
    if (blogPath === "/blog" || blogPath.startsWith("/blog/")) {
      const blog = await loadBlog(env, hostname, ctx)
      const clonedBlog = pages.some((p) => p.path === blogPath)
      if (blog && (blog.posts.length > 0 || !clonedBlog)) {
        if (url.pathname !== blogPath) return Response.redirect(`https://${hostname}${blogPath}${url.search}`, 301)
        const stored = await loadDoc(env, projectId, site, HOME_PATH, ctx)
        if (!stored) return notFound("This site hasn't been published yet.")
        const home = pages.length > 1 ? rewriteSiteLinks(stored, pages.filter((p) => p.source)) : stored
        if (blogPath === "/blog/rss.xml") return rss(blog, hostname, home.meta.title)

        const slug = blogPath === "/blog" ? null : decodeURIComponent(blogPath.slice("/blog/".length))
        let post: LivePost | null = null
        if (slug) {
          if (slug.includes("/") || !env.CONVEX_SITE_URL) return notFound("Post not found.")
          post = await cachedJson<LivePost>(
            `${env.CONVEX_SITE_URL}/edge/post?host=${encodeURIComponent(hostname)}&slug=${encodeURIComponent(slug)}`,
            ctx,
          ).catch(() => null)
          if (!post) return notFound("Post not found.")
        }

        const widget = site.widget && !site.widget.hiddenPaths.includes("/blog") ? site.widget : null
        const stopped = site.stoppedForms ?? []
        const key = fingerprint(JSON.stringify([widget, stopped, blog, post?.updatedAt]))
        const cacheKey = new Request(`https://render.cache/r${RENDER_REVISION}/${projectId}/v${site.version}/b${key}/${hostname}${encodeURI(blogPath)}`)
        const hit = await caches.default.match(cacheKey)
        if (hit) return hit

        const lang = home.meta.lang ?? "en"
        const { doc, after } = post
          ? blogShell(home, {
              title: `${post.seoTitle || post.title} · ${home.meta.title}`,
              description: post.seoDescription || post.excerpt || home.meta.description,
              ogImage: post.cover,
            })
          : blogShell(home, { title: `${blog.title} · ${home.meta.title}`, description: blog.intro || home.meta.description })
        const html = post ? blogPostHtml(post, { lang }) : blogIndexHtml(blog.posts, { title: blog.title, intro: blog.intro, lang })
        const stream = await renderPage(doc, {
          url: `https://${hostname}${encodeURI(blogPath)}`,
          main: { html, after },
          type: post ? "article" : "website",
          feed: { title: blog.title, href: "/blog/rss.xml" },
        })
        const rendered = withScripts(
          await new Response(stream).text(),
          ANALYTICS_SCRIPT + formsScript(stopped) + widgetScript(widget, "/blog", doc),
        )
        const response = new Response(rendered, { headers: HTML_HEADERS })
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
        return response
      }
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
    const stopped = site.stoppedForms ?? []
    const widgetKey = fingerprint(JSON.stringify([widget, stopped]))
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
    const script = liveReloadScript(site.version) + ANALYTICS_SCRIPT + formsScript(stopped) + widgetScript(widget, path, stored)
    const bodyEnd = rendered.lastIndexOf("</body>")
    const html = bodyEnd < 0 ? rendered + script : rendered.slice(0, bodyEnd) + script + rendered.slice(bodyEnd)
    const response = new Response(html, {
      headers: { ...HTML_HEADERS, ETag: `"${projectId}-v${site.version}-w${widgetKey}-${encodeURIComponent(path)}"` },
    })
    ctx.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  },
} satisfies ExportedHandler<Env>

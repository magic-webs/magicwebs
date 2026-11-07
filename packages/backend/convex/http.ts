import { httpRouter } from "convex/server"

import { internal } from "./_generated/api"
import { auth } from "./auth"
import type { Id } from "./_generated/dataModel"
import { httpAction } from "./_generated/server"
import { dayOf, describeAgent } from "./analytics"

// Read by the edge worker so a publish is live within seconds, without waiting
// for Workers KV to propagate. Published pages are public, so no secret is needed.

const http = httpRouter()

// Convex Auth's OAuth callbacks and JWKS.
auth.addHttpRoutes(http)

function json(body: unknown, maxAge: number) {
  return new Response(JSON.stringify(body), {
    status: body === null ? 404 : 200,
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}` },
  })
}

http.route({
  path: "/edge/live",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const hostname = new URL(request.url).searchParams.get("host")?.toLowerCase()
    if (!hostname) return json(null, 0)
    // Each colo reuses this answer briefly; it bounds how long a publish takes to show.
    return json(await ctx.runQuery(internal.edgeData.liveVersionByHost, { hostname }), 2)
  }),
})

http.route({
  path: "/edge/doc",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const params = new URL(request.url).searchParams
    const projectId = params.get("projectId")
    const version = Number(params.get("version"))
    if (!projectId || !Number.isInteger(version)) return json(null, 0)
    const path = params.get("path") ?? undefined
    // Versions are immutable, so a fetched doc can be cached for a long time.
    // A malformed id fails argument validation; treat it as not found.
    const doc = await ctx
      .runQuery(internal.edgeData.versionDoc, { projectId: projectId as Id<"projects">, version, path })
      .catch(() => null)
    return json(doc, doc ? 31536000 : 0)
  }),
})

// A published site's blog, read by the edge worker for /blog and /blog/<slug>.
// Briefly cached at each colo, which bounds how long a new post takes to show.
http.route({
  path: "/edge/blog",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const hostname = new URL(request.url).searchParams.get("host")?.toLowerCase()
    if (!hostname) return json(null, 0)
    return json(await ctx.runQuery(internal.posts.blogByHost, { hostname }), 10)
  }),
})

http.route({
  path: "/edge/post",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const params = new URL(request.url).searchParams
    const hostname = params.get("host")?.toLowerCase()
    const slug = params.get("slug")
    if (!hostname || !slug) return json(null, 0)
    return json(await ctx.runQuery(internal.posts.postByHost, { hostname, slug }), 10)
  }),
})

// Form submissions from published sites, forwarded by the edge worker's
// /__forms route. Public like the pages themselves: the hostname picks the
// site, and leads.submit rate-limits each sender.
http.route({
  path: "/forms/submit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const text = await request.text()
    if (text.length > 64_000) return new Response(JSON.stringify({ ok: false }), { status: 413 })
    let body: { hostname?: unknown; form?: unknown; path?: unknown; fields?: unknown; ip?: unknown }
    try {
      body = JSON.parse(text)
    } catch {
      return Response.json({ ok: false }, { status: 400 })
    }
    const { hostname, form, path, fields, ip } = body
    if (typeof hostname !== "string" || typeof form !== "string" || typeof path !== "string" || !Array.isArray(fields)) {
      return Response.json({ ok: false }, { status: 400 })
    }
    const pairs = fields.flatMap((f: unknown) =>
      f && typeof f === "object" && typeof (f as { key?: unknown }).key === "string" && typeof (f as { value?: unknown }).value === "string"
        ? [{ key: (f as { key: string }).key, value: (f as { value: string }).value }]
        : [],
    )
    // A bot filled in the trap field: say yes and keep nothing.
    if (pairs.some((p) => p.key === "_hp" && p.value)) return Response.json({ ok: true })
    const sender =
      typeof ip === "string" && ip
        ? Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(`${ip}|${hostname}|${new Date().toISOString().slice(0, 10)}`),
              ),
            ),
            (b) => b.toString(16).padStart(2, "0"),
          ).join("")
        : undefined
    const status = await ctx.runMutation(internal.leads.submit, {
      hostname: hostname.toLowerCase(),
      form,
      path,
      fields: pairs.filter((p) => p.key !== "_hp"),
      sender,
    })
    if (status === "limited") return Response.json({ ok: false, error: "Too many submissions. Try again later." }, { status: 429 })
    if (status === "unknown") return Response.json({ ok: false }, { status: 404 })
    return Response.json({ ok: true })
  }),
})

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

const str = (value: unknown) => (typeof value === "string" ? value : undefined)

// Page views and time on page from published sites, forwarded by the edge
// worker's /__a route with the visitor's IP, user agent and location. The IP
// only feeds the day's visitor hash and is never stored.
http.route({
  path: "/analytics/collect",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const text = await request.text()
    if (text.length > 8_000) return Response.json({ ok: false }, { status: 413 })
    let body: Record<string, unknown>
    try {
      body = JSON.parse(text)
    } catch {
      return Response.json({ ok: false }, { status: 400 })
    }
    const hostname = str(body.hostname)?.toLowerCase()
    if (!hostname) return Response.json({ ok: false }, { status: 400 })

    if (body.type === "engage") {
      const id = str(body.id)
      if (id && typeof body.duration === "number" && typeof body.scroll === "number") {
        await ctx.runMutation(internal.analytics.recordEngagement, { hostname, id, duration: body.duration, scroll: body.scroll })
      }
      return Response.json({ ok: true })
    }

    const agent = describeAgent(str(body.ua) ?? "")
    const path = str(body.path)
    if (!agent || !path) return Response.json({ ok: true, id: null })
    const salt = process.env.ANALYTICS_SALT ?? process.env.WORKER_SECRET ?? ""
    const visitor = await sha256Hex(`${salt}|${dayOf(Date.now())}|${hostname}|${str(body.ip) ?? ""}|${str(body.ua)}`)
    let referrer: string | undefined
    try {
      const ref = str(body.referrer) && new URL(str(body.referrer)!).hostname.replace(/^www\./, "")
      if (ref && ref !== hostname.replace(/^www\./, "")) referrer = ref
    } catch {
      // Not a URL: leave it out.
    }
    const id = await ctx.runMutation(internal.analytics.recordView, {
      hostname,
      path,
      visitor,
      referrer,
      utmSource: str(body.utmSource),
      utmMedium: str(body.utmMedium),
      utmCampaign: str(body.utmCampaign),
      country: str(body.country),
      city: str(body.city),
      ...agent,
    })
    return Response.json({ ok: true, id })
  }),
})

export default http

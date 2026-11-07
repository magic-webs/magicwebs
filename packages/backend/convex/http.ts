import { httpRouter } from "convex/server"

import { internal } from "./_generated/api"
import { auth } from "./auth"
import type { Id } from "./_generated/dataModel"
import { httpAction } from "./_generated/server"

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

export default http

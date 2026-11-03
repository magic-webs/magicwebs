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

export default http

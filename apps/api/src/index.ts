import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

import { bearer, clientForApiKey, clientForToken, isSignedIn } from "./auth"
import { handleChat } from "./chat"
import { env } from "./env"
import { handleMcp } from "./mcp"

const app = new Hono()

app.use(logger())
app.get("/health", (c) => c.json({ ok: true }))

// The platform UI sends its Convex Auth session token.
app.use(
  "/chat",
  cors({ origin: env.webOrigins, allowMethods: ["POST"], allowHeaders: ["Content-Type", "Authorization"] }),
)
app.post("/chat", async (c) => {
  const token = bearer(c.req.raw)
  const convex = token ? clientForToken(token) : null
  if (!convex || !(await isSignedIn(convex))) return c.json({ error: "Sign in to use the AI chat" }, 401)
  return handleChat(c.req.raw, convex)
})

// MCP clients send a personal API key, created on the dashboard's MCP page.
app.all("/mcp", async (c) => {
  const key = bearer(c.req.raw)
  const convex = key ? await clientForApiKey(key) : null
  if (!convex) {
    return c.json({ error: "Send a Magicwebs API key as Authorization: Bearer <key>" }, 401, {
      "WWW-Authenticate": 'Bearer realm="magicwebs"',
    })
  }
  return handleMcp(c.req.raw, convex)
})

console.log(`API listening on http://localhost:${env.port}`)

export default {
  port: env.port,
  fetch: app.fetch,
  // AI responses stream for longer than Bun's default 10s idle timeout.
  idleTimeout: 120,
}

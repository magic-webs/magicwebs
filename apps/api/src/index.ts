import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

import { bearer, clientForApiKey, clientForToken, isSignedIn } from "./auth"
import { handleUpload } from "./assets"
import { handleBlogAssist } from "./blog-assist"
import { handleChat } from "./chat"
import { env } from "./env"
import { handleMcp } from "./mcp"

const app = new Hono()

// /mcp/<key> carries an API key in the path, so it is masked before logging.
app.use(logger((line, ...rest) => console.log(line.replace(/\/mcp\/[^\s?/]+/g, "/mcp/***"), ...rest)))
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

// AI help in the dashboard's blog editor: ideas, drafts, rewrites and search fields.
app.use(
  "/blog/assist",
  cors({ origin: env.webOrigins, allowMethods: ["POST"], allowHeaders: ["Content-Type", "Authorization"] }),
)
app.post("/blog/assist", async (c) => {
  const token = bearer(c.req.raw)
  const convex = token ? clientForToken(token) : null
  if (!convex || !(await isSignedIn(convex))) return c.json({ error: "Sign in to use AI writing" }, 401)
  return handleBlogAssist(c.req.raw, convex)
})

// Files attached in the AI chat, sent by the platform UI with its session token.
app.use(
  "/assets",
  cors({ origin: env.webOrigins, allowMethods: ["POST"], allowHeaders: ["Content-Type", "Authorization"] }),
)
app.post("/assets", async (c) => {
  const token = bearer(c.req.raw)
  const convex = token ? clientForToken(token) : null
  if (!convex || !(await isSignedIn(convex))) return c.json({ error: "Sign in to upload files" }, 401)
  return handleUpload(c.req.raw, convex)
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

// For clients that can't send headers (ChatGPT's custom MCP servers offer only
// OAuth or no auth): the key is the last path segment instead. Anyone who has
// this URL acts as the key's owner, so it is shown and treated like the key.
app.all("/mcp/:key", async (c) => {
  const convex = await clientForApiKey(c.req.param("key"))
  if (!convex) return c.json({ error: "Unknown or revoked Magicwebs API key in the URL" }, 401)
  return handleMcp(c.req.raw, convex)
})

console.log(`API listening on http://localhost:${env.port}`)

export default {
  port: env.port,
  fetch: app.fetch,
  // AI responses stream for longer than Bun's default 10s idle timeout.
  idleTimeout: 120,
}

import { Hono } from "hono"
import { bearerAuth } from "hono/bearer-auth"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

import { handleChat } from "./chat"
import { env } from "./env"
import { handleMcp } from "./mcp"

const app = new Hono()

app.use(logger())
app.get("/health", (c) => c.json({ ok: true }))

app.use("/chat", cors({ origin: env.webOrigins, allowMethods: ["POST"], allowHeaders: ["Content-Type"] }))
app.post("/chat", (c) => handleChat(c.req.raw))

if (env.mcpApiKey) {
  app.use("/mcp", bearerAuth({ token: env.mcpApiKey }))
} else {
  console.warn("MCP_API_KEY is not set: the /mcp endpoint is open to anyone who can reach this server")
}
app.all("/mcp", (c) => handleMcp(c.req.raw))

console.log(`API listening on http://localhost:${env.port}`)

export default {
  port: env.port,
  fetch: app.fetch,
  // AI responses stream for longer than Bun's default 10s idle timeout.
  idleTimeout: 120,
}

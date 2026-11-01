function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  convexUrl: required("CONVEX_URL"),
  /** Origins allowed to call the API from a browser (the platform UI). */
  webOrigins: (process.env.WEB_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()),
  /** Bearer token external MCP clients must send. */
  mcpApiKey: process.env.MCP_API_KEY,
  /** Vercel AI Gateway model id. Authenticated with AI_GATEWAY_API_KEY. */
  model: process.env.AI_MODEL ?? "anthropic/claude-haiku-5.5",
}

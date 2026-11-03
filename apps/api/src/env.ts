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
  /**
   * Vercel AI Gateway model id for the platform's AI chat. Authenticated with
   * AI_GATEWAY_API_KEY. MCP clients never use it: they bring their own model.
   */
  model: process.env.AI_MODEL ?? "anthropic/claude-haiku-5.5",
}

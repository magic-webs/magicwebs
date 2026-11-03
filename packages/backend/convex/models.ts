import { v, type Infer } from "convex/values"

// The AI model and effort a rebuild runs with. The crawler maps these to
// Vercel AI Gateway model ids.

export const aiModel = v.union(v.literal("haiku"), v.literal("sonnet"), v.literal("opus"))
export const aiEffort = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("xhigh"),
  v.literal("max"),
)

/**
 * Whose AI rebuilds a page that can't be copied exactly. Projects created on the
 * platform use the platform's AI Gateway; projects created by an agent over MCP
 * are handed back to that agent, which rebuilds them with its own model.
 */
export const aiMode = v.union(v.literal("platform"), v.literal("agent"))

/** Tokens and USD cost of one rebuild, summed over its retries. */
export const aiUsage = v.object({
  inputTokens: v.number(),
  outputTokens: v.number(),
  cacheReadTokens: v.number(),
  cacheWriteTokens: v.number(),
  costUsd: v.optional(v.number()),
})

export type AiModel = Infer<typeof aiModel>
export type AiEffort = Infer<typeof aiEffort>
export type AiMode = Infer<typeof aiMode>

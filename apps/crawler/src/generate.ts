import { generateText, type LanguageModelUsage } from "ai"
import { z } from "zod"

import type { AiEffort, AiModel } from "@magicwebs/backend/convex/models"
import { newSectionId, PageDocSchema, SECTION_TYPES, type PageDoc } from "@magicwebs/page-schema"

import type { Capture } from "./capture"
import { env } from "./env"
import type { HtmlFacts } from "./extract"

const INSTRUCTIONS = `You rebuild landing pages as structured JSON for a React component registry. You receive screenshots of the original page (desktop slices from top to bottom, then one mobile screen), the page's visual blocks with computed styles, and its text outline.

Reproduce the original as faithfully as the registry allows:
- One section per visual block, in the same order. Available section types: ${SECTION_TYPES.join(", ")}.
- Pick the closest typed section. Use "custom" (free-form elements with inline CSS) only for blocks that no typed section can represent; keep custom element trees shallow.
- Copy all visible text exactly. Do not invent copy, testimonials, prices or statistics.
- Use the exact image URLs from the extracted data. Never make up image URLs; omit an image if you don't have its URL.
- Theme: take colors from the computed styles (convert rgb() to hex), the heading and body font families as they appear, and list the ones that are Google Fonts in googleFonts. Estimate radius from button border-radius.
- Per-section style: set background, text color and paddingY when they differ from the theme, so alternating backgrounds and dark sections match the screenshots.
- Use the mobile screenshot to choose layouts that collapse the same way.
- Where blocks animate into view, set animation to "fade-up" (or the closest match).
- Section ids: short unique strings like "s_hero".
- Keep link hrefs as absolute URLs from the extracted data, or "#" when unknown.

Reply with one JSON object and nothing else (no prose, no code fences) that matches this JSON Schema:
${JSON.stringify(z.toJSONSchema(PageDocSchema))}`

function compactJson(value: unknown, max: number): string {
  const json = JSON.stringify(value)
  return json.length > max ? json.slice(0, max) + "…(truncated)" : json
}

const MAX_ATTEMPTS = 3

/** Vercel AI Gateway ids for the models a user can pick. */
const GATEWAY_MODELS: Record<AiModel, string> = {
  haiku: "anthropic/claude-haiku-5.5",
  sonnet: "anthropic/claude-sonnet-5.5",
  opus: "anthropic/claude-opus-5.5",
}

/** USD per million tokens: input, output, cache read, cache write. */
const PRICES: Record<string, [number, number, number, number]> = {
  "anthropic/claude-haiku-5.5": [0.1, 0.5, 0.01, 0.125],
  "anthropic/claude-sonnet-5.5": [2, 10, 0.2, 2.5],
  "anthropic/claude-opus-5.5": [4, 20, 0.2, 5],
}

export type AiOptions = { model?: AiModel; effort?: AiEffort }

/** Tokens and cost summed over every attempt, including ones that were retried. */
export type AiUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd?: number
}

class InvalidPageError extends Error {}

export async function reconstruct(
  capture: Capture,
  facts: HtmlFacts,
  ai: AiOptions = {},
): Promise<{ doc: PageDoc; usage: AiUsage }> {
  const usage: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  for (let attempt = 1; ; attempt++) {
    try {
      return { doc: normalize(await generate(capture, facts, ai, usage), facts), usage }
    } catch (error) {
      if (!(error instanceof InvalidPageError) || attempt >= MAX_ATTEMPTS) throw error
      console.warn(`Invalid page JSON (attempt ${attempt}/${MAX_ATTEMPTS}): ${error.message.slice(0, 300)}`)
    }
  }
}

// PageDocSchema is too large for Anthropic's native structured output (at most
// 24 optional fields) and Haiku stops early when filling it as tool input, so
// the model writes the JSON as plain text and we validate it here.
async function generate(capture: Capture, facts: HtmlFacts, ai: AiOptions, usage: AiUsage): Promise<PageDoc> {
  const model = ai.model ? GATEWAY_MODELS[ai.model] : env.model
  // Thinking counts toward output tokens, so higher effort needs more room.
  const deepEffort = ai.effort === "high" || ai.effort === "xhigh" || ai.effort === "max"
  const { text, finishReason, usage: used } = await generateText({
    model,
    // The instructions (with the page JSON Schema) are identical for every job, so cache them.
    instructions: { role: "system", content: INSTRUCTIONS, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
    maxOutputTokens: deepEffort ? 64000 : 32000,
    providerOptions: {
      // Route to Anthropic directly; the gateway otherwise may fall back to Bedrock.
      gateway: { only: ["anthropic"] },
      ...(ai.effort && { anthropic: { effort: ai.effort } }),
    },
    messages: [
      {
        role: "user",
        content: [
          ...capture.desktopSlices.map((data) => ({ type: "file" as const, data, mediaType: "image/jpeg" })),
          { type: "file" as const, data: capture.mobile, mediaType: "image/jpeg" },
          {
            type: "text" as const,
            text: [
              `URL: ${capture.finalUrl}`,
              `Metadata: ${JSON.stringify(facts.meta)}`,
              `Google Fonts linked by the page: ${JSON.stringify(facts.googleFonts)}`,
              `Page globals: ${compactJson(capture.globals, 4000)}`,
              `Visual blocks, top to bottom: ${compactJson(capture.blocks, 60000)}`,
              `Text outline:\n${facts.outline}`,
            ].join("\n\n"),
          },
        ],
      },
    ],
  })
  addUsage(usage, model, used)

  if (finishReason === "length") throw new InvalidPageError("Response hit the output token limit")
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end < start) throw new InvalidPageError("No JSON object in the response")
  let json: unknown
  try {
    json = JSON.parse(text.slice(start, end + 1))
  } catch (error) {
    throw new InvalidPageError(`Malformed JSON: ${(error as Error).message}`)
  }
  const result = PageDocSchema.safeParse(json)
  if (!result.success) throw new InvalidPageError(z.prettifyError(result.error))
  return result.data
}

function addUsage(total: AiUsage, model: string, used: LanguageModelUsage) {
  const cacheRead = used.inputTokenDetails.cacheReadTokens ?? 0
  const cacheWrite = used.inputTokenDetails.cacheWriteTokens ?? 0
  const uncached = used.inputTokenDetails.noCacheTokens ?? (used.inputTokens ?? 0) - cacheRead - cacheWrite
  const output = used.outputTokens ?? 0
  total.inputTokens += used.inputTokens ?? 0
  total.outputTokens += output
  total.cacheReadTokens += cacheRead
  total.cacheWriteTokens += cacheWrite
  const price = PRICES[model]
  if (price) {
    const cost = (uncached * price[0] + output * price[1] + cacheRead * price[2] + cacheWrite * price[3]) / 1_000_000
    total.costUsd = (total.costUsd ?? 0) + cost
  }
}

/** Fill gaps the model tends to leave and guarantee unique section ids. */
function normalize(doc: PageDoc, facts: HtmlFacts): PageDoc {
  const seen = new Set<string>()
  for (const section of doc.sections) {
    if (!section.id || seen.has(section.id)) section.id = newSectionId()
    seen.add(section.id)
  }
  doc.meta = {
    ...doc.meta,
    title: doc.meta.title || facts.meta.title || "Untitled page",
    description: doc.meta.description || facts.meta.description || "",
    favicon: doc.meta.favicon ?? facts.meta.favicon,
    ogImage: doc.meta.ogImage ?? facts.meta.ogImage,
    lang: doc.meta.lang ?? facts.meta.lang,
  }
  return PageDocSchema.parse(doc)
}

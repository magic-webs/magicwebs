import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  tool,
  toUIMessageStream,
  type UIMessage,
} from "ai"
import { z } from "zod"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"
import { outline, SECTION_TYPES } from "@magicwebs/page-schema"

import { env } from "./env"
import { convex, errorMessage, PAGE_TOOLS } from "./tools"

const ChatRequest = z.object({
  projectId: z.string(),
  messages: z.array(z.any()),
})

const INSTRUCTIONS = `You edit a landing page for the user. The page is a JSON document of ordered sections rendered by a fixed component registry (section types: ${SECTION_TYPES.join(", ")}), plus a global theme. Every edit you make appears in the user's live preview immediately.

How to work:
- Use the tools to change the page; never just describe JSON to the user.
- Look up section ids with get_page_outline and read a section with get_section before editing it, unless the current outline below already gives you what you need.
- Prefer set_field for single text, link or image changes. Use apply_operations to make several related changes at once.
- Keep the page's existing voice and visual style unless asked to change it. When changing colors, keep text readable against its background.
- Images must be absolute https URLs. Don't invent image URLs; if the user wants a new image and gives none, say so.
- Publish only when the user explicitly asks.
- After editing, reply with one or two sentences saying what changed.`

export async function handleChat(request: Request): Promise<Response> {
  const body = ChatRequest.safeParse(await request.json())
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 })

  const projectId = body.data.projectId as Id<"projects">
  const messages = body.data.messages as UIMessage[]
  const draft = await convex.query(api.drafts.get, { projectId })
  if (!draft) return Response.json({ error: "Project not found" }, { status: 404 })

  const tools = Object.fromEntries(
    Object.entries(PAGE_TOOLS).map(([name, def]) => [
      name,
      tool({
        description: def.description,
        inputSchema: def.input,
        execute: async (input: Record<string, unknown>) => {
          try {
            return await def.run(projectId, input, "ai")
          } catch (error) {
            return { ok: false, error: errorMessage(error) }
          }
        },
      }),
    ]),
  )

  const result = streamText({
    model: env.model,
    instructions: [
      // Tools and the fixed instructions form a stable prefix Anthropic can cache;
      // the outline changes with every edit, so it comes after the breakpoint.
      { role: "system", content: INSTRUCTIONS, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
      { role: "system", content: `Current page outline (index. [id] type — heading):\n${outline(draft.doc)}` },
    ],
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: isStepCount(15),
    // Route to Anthropic directly; the gateway otherwise may fall back to Bedrock.
    providerOptions: { gateway: { only: ["anthropic"] } },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, originalMessages: messages }),
  })
}

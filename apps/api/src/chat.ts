import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  tool,
  toUIMessageStream,
  type ModelMessage,
  type UIMessage,
} from "ai"
import type { ConvexHttpClient } from "convex/browser"
import { z } from "zod"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"
import { outline, SECTION_TYPES, type PageDoc } from "@magicwebs/page-schema"

import { errorMessage, PAGE_TOOLS } from "./tools"

/** The in-app chat always runs on Claude Haiku 5.5, through the AI Gateway. */
const CHAT_MODEL = "anthropic/claude-haiku-5.5"

/**
 * The client sends only its new message; the conversation itself is stored in
 * Convex (chats.ts) and loaded here, so it survives reloads and devices.
 */
const ChatRequest = z.object({
  projectId: z.string(),
  /** The page open in the editor; the chat edits that page. */
  path: z.string().optional(),
  message: z.object({ id: z.string(), role: z.literal("user"), parts: z.array(z.any()) }).passthrough(),
  selectedId: z.string().nullish(),
})

/** What each user message carries besides its text: the page as it was when it was sent. */
type ChatMetadata = { context?: string }
type ChatMessage = UIMessage<ChatMetadata>

const INSTRUCTIONS = `You edit a landing page for the user. The page is a JSON document of ordered sections rendered by a fixed component registry (section types: ${SECTION_TYPES.join(", ")}), plus a global theme. Every edit you make appears in the user's live preview immediately.

The project may be a site of several pages. You edit the page the user has open in the editor, named in <page_context>; to change another page, ask the user to open it. Shared parts such as headers and footers are copies on each page, so changing one page doesn't change the others.

Each user message ends with a <page_context> block: the open page, the site's pages, the page outline (index. [id] type — heading) at the moment the message was sent, and the section the user has selected in the preview, if any. "This section", "here" and "it" usually mean the selected section. Outlines in earlier messages may be out of date; trust the latest one, and call get_page_outline after you add, remove or move sections.

How to work:
- Use the tools to change the page; never just describe JSON to the user.
- Read a section with get_section before editing it, unless the outline already gives you what you need.
- Prefer set_field for single text, link or image changes. Use apply_operations to make several related changes at once.
- Keep the page's existing voice and visual style unless asked to change it. When changing colors, keep text readable against its background.
- Sections of type "html" are exact copies of the original site: real markup styled by the page stylesheet (styles.css), with the original hover effects and animations. Edit their text, links and images with edit_html, copying the find text exactly from get_section and keeping classes and data-mw-* attributes intact. Change their colors, fonts, spacing or hover effects by finding the rule with search_page_css and editing it with edit_page_css (or appending a more specific rule). Theme changes don't affect html sections. Never add <script> or inline event handlers; they are stripped.
- Images must be absolute https URLs. Don't invent image URLs; if the user wants a new image and gives none, say so.
- If a request is ambiguous, make the most reasonable change and say what you assumed, rather than asking first.
- Publish only when the user explicitly asks.
- After editing, reply with one or two plain sentences saying what changed. No markdown headings or lists.`

const EPHEMERAL = { anthropic: { cacheControl: { type: "ephemeral" } } }

type SitePage = { path: string; title: string }

function pageContext(doc: PageDoc, selectedId: string | null | undefined, page: SitePage, pages: SitePage[]): string {
  const selected = selectedId ? doc.sections.find((s) => s.id === selectedId) : undefined
  return [
    "<page_context>",
    `Open page: ${page.title} (${page.path})`,
    ...(pages.length > 1 ? [`Site pages: ${pages.map((p) => `${p.title} (${p.path})`).join(", ")}`] : []),
    `Outline:\n${outline(doc) || "(no sections yet)"}`,
    selected ? `Selected section: [${selected.id}] ${selected.type}` : "No section selected.",
    "</page_context>",
  ].join("\n")
}

/** User messages as the model sees them: their text followed by the page context they were sent with. */
function withContext(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) =>
    m.role === "user" && m.metadata?.context ? { ...m, parts: [...m.parts, { type: "text", text: m.metadata.context }] } : m,
  )
}

/**
 * Prompt caching: the tools and instructions carry one breakpoint; this moves a
 * second one to the newest message on every step, so each tool round trip and
 * the next turn read the whole conversation so far from the cache. Anthropic
 * allows four breakpoints, so older ones are cleared.
 */
function cacheLatest(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((m, i) => {
    const { cacheControl: _, ...anthropic } = (m.providerOptions?.anthropic ?? {}) as Record<string, unknown>
    const providerOptions = { ...m.providerOptions, anthropic: i === messages.length - 1 ? { ...anthropic, ...EPHEMERAL.anthropic } : anthropic }
    return { ...m, providerOptions } as ModelMessage
  })
}

/** Tool inputs and outputs above this size are cut down before they are stored (Convex rows max out at 1 MiB). */
const MAX_STORED_CHARS = 20_000

function forStorage(message: ChatMessage): ChatMessage {
  const shrink = (value: unknown) => {
    const json = JSON.stringify(value) ?? ""
    return json.length > MAX_STORED_CHARS ? { truncated: true, preview: json.slice(0, 2000) } : value
  }
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") return part
      const p = part as Record<string, unknown>
      return { ...p, input: shrink(p.input), ...("output" in p && { output: shrink(p.output) }) } as typeof part
    }),
  }
}

/**
 * The in-app AI chat. It runs on the platform's AI Gateway key, so it is only
 * open to signed-in users of the platform; `convex` is signed in as them.
 */
export async function handleChat(request: Request, convex: ConvexHttpClient): Promise<Response> {
  const body = ChatRequest.safeParse(await request.json())
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 })

  const projectId = body.data.projectId as Id<"projects">
  const path = body.data.path ?? "/"
  const [draft, pages] = await Promise.all([
    convex.query(api.drafts.get, { projectId, path }).catch(() => null),
    convex.query(api.pages.list, { projectId }).catch(() => []),
  ])
  if (!draft) return Response.json({ error: "Page not found" }, { status: 404 })
  const page = pages.find((p) => p.path === path) ?? { path, title: path === "/" ? "Home" : path }

  let history = (await convex.query(api.chats.list, { projectId })) as ChatMessage[]
  // A retried message is already stored: answer it again from where it was.
  const retryAt = history.findIndex((m) => m.id === body.data.message.id)
  const replaceFrom = retryAt >= 0 ? body.data.message.id : undefined
  if (retryAt >= 0) history = history.slice(0, retryAt)

  const userMessage: ChatMessage = {
    ...(body.data.message as ChatMessage),
    metadata: { context: pageContext(draft.doc, body.data.selectedId, page, pages) },
  }
  const messages = [...history, userMessage]

  const tools = Object.fromEntries(
    Object.entries(PAGE_TOOLS).map(([name, def]) => [
      name,
      tool({
        description: def.description,
        inputSchema: def.input,
        execute: async (input: Record<string, unknown>) => {
          try {
            return await def.run(convex, { projectId, path }, input, "ai")
          } catch (error) {
            return { ok: false, error: errorMessage(error) }
          }
        },
      }),
    ]),
  )

  const result = streamText({
    model: CHAT_MODEL,
    // Fixed instructions after the (fixed) tools: the stable prefix every request shares.
    instructions: [{ role: "system", content: INSTRUCTIONS, providerOptions: EPHEMERAL }],
    messages: cacheLatest(await convertToModelMessages(withContext(messages))),
    prepareStep: ({ messages }) => ({ messages: cacheLatest(messages) }),
    tools,
    stopWhen: isStepCount(15),
    providerOptions: {
      // Route to Anthropic directly; the gateway otherwise may fall back to Bedrock.
      gateway: { only: ["anthropic"] },
      // Haiku 5.5 thinks adaptively; medium is its default, set explicitly.
      anthropic: { effort: "medium" },
    },
    onEnd: ({ totalUsage }) => {
      const read = totalUsage.inputTokenDetails.cacheReadTokens ?? 0
      const written = totalUsage.inputTokenDetails.cacheWriteTokens ?? 0
      const input = totalUsage.inputTokens ?? 0
      console.log(
        `[chat ${projectId}] ${input} in (${read} cache read, ${written} cache write, ${input ? Math.round((read / input) * 100) : 0}% cached), ${totalUsage.outputTokens ?? 0} out`,
      )
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<typeof tools, ChatMessage>({
      stream: result.stream,
      originalMessages: messages,
      // Ids made here, so the client's copy and the stored copy match.
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      onEnd: async ({ messages: all }) => {
        try {
          await convex.mutation(api.chats.append, {
            projectId,
            messages: all.slice(history.length).map(forStorage),
            replaceFrom,
          })
        } catch (error) {
          console.error(`[chat ${projectId}] couldn't save the conversation:`, errorMessage(error))
        }
      },
    }),
  })
}

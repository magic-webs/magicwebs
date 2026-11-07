import { generateText, Output } from "ai"
import type { ConvexHttpClient } from "convex/browser"
import { z } from "zod"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"
import { outline } from "@magicwebs/page-schema"

import { errorMessage } from "./tools"

/** Same model and route as the editor chat (chat.ts). */
const MODEL = "anthropic/claude-haiku-5.5"

const Draft = z.object({
  title: z.string().max(300).default(""),
  excerpt: z.string().max(2000).default(""),
  body: z.string().max(100_000).default(""),
  tags: z.array(z.string().max(60)).max(30).default([]),
})

const AssistRequest = z.object({
  projectId: z.string(),
  /**
   * ideas: suggest posts to write. write: a whole post from the title and brief.
   * revise: change the draft as the instruction says. details: excerpt, tags and search fields.
   */
  action: z.enum(["ideas", "write", "revise", "details"]),
  /** The user's brief (ideas, write) or instruction (revise). */
  prompt: z.string().max(4000).default(""),
  draft: Draft.default({ title: "", excerpt: "", body: "", tags: [] }),
})

const Ideas = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().describe("A specific, compelling post title"),
        angle: z.string().describe("One sentence: what the post covers and why the site's readers care"),
      }),
    )
    .describe("Six distinct post ideas"),
})

const Post = z.object({
  title: z.string(),
  excerpt: z.string().describe("One or two sentences for the post list and search results"),
  body: z.string().describe("The post in Markdown, starting below the title (no H1); ## and ### headings"),
  tags: z.array(z.string()).describe("Two to five short lowercase tags"),
  seoTitle: z.string().describe("Search title, under 60 characters"),
  seoDescription: z.string().describe("Search description, 120 to 155 characters"),
})

const Revised = z.object({
  title: z.string().describe("The title, unchanged unless the instruction asks to change it"),
  excerpt: z.string().describe("The excerpt, updated only if the change makes it inaccurate or the instruction asks"),
  body: z.string().describe("The whole revised body in Markdown"),
  summary: z.string().describe("One short sentence saying what you changed"),
})

const Details = z.object({
  excerpt: z.string().describe("One or two sentences for the post list and search results"),
  tags: z.array(z.string()).describe("Two to five short lowercase tags"),
  seoTitle: z.string().describe("Search title, under 60 characters"),
  seoDescription: z.string().describe("Search description, 120 to 155 characters"),
})

const INSTRUCTIONS = `You help a small business write posts for the blog on its own website. You are given what is known about the site and the post being edited.

Write for the site's customers, not for search engines: concrete, useful and specific to this business and its area, in a warm, plain voice. Use short paragraphs, ## and ### headings, lists where they help, and end with a natural call to action that fits the business. Don't invent facts about the business (prices, awards, years, team names, addresses); where a detail would help but isn't known, write around it. Don't add image links. Write in the language the user writes in, or the site's language if they haven't written anything.`

type SiteContext = { text: string }

async function siteContext(convex: ConvexHttpClient, projectId: Id<"projects">): Promise<SiteContext | null> {
  const [project, home, posts, settings] = await Promise.all([
    convex.query(api.projects.get, { projectId }).catch(() => null),
    convex.query(api.drafts.get, { projectId, path: "/" }).catch(() => null),
    convex.query(api.posts.list, { projectId }).catch(() => []),
    convex.query(api.posts.settings, { projectId }).catch(() => null),
  ])
  if (!project) return null
  const details = (project.originalDetails?.details ?? {}) as Record<string, unknown>
  const known = ["description", "industry", "areaServed", "address"]
    .map((key) => (typeof details[key] === "string" && details[key] ? `${key}: ${details[key]}` : null))
    .filter(Boolean)
  const lines = [
    "<site>",
    `Name: ${project.name}`,
    ...(project.sourceUrl ? [`Original website: ${project.sourceUrl}`] : []),
    ...known,
    ...(settings?.intro ? [`Blog intro: ${settings.intro}`] : []),
    ...(home ? [`Home page outline:\n${outline(home.doc).slice(0, 4000)}`] : []),
    ...(posts.length ? [`Posts already on the blog (don't repeat them):\n${posts.slice(0, 40).map((p) => `- ${p.title}`).join("\n")}`] : []),
    "</site>",
  ]
  return { text: lines.join("\n") }
}

function draftText(draft: z.infer<typeof Draft>): string {
  return [
    "<post>",
    `Title: ${draft.title || "(none yet)"}`,
    `Excerpt: ${draft.excerpt || "(none yet)"}`,
    `Tags: ${draft.tags.join(", ") || "(none yet)"}`,
    `Body:\n${draft.body || "(empty)"}`,
    "</post>",
  ].join("\n")
}

/**
 * AI help in the dashboard's blog editor. Nothing is saved here: the editor
 * puts the result into its form, and the user saves or publishes as usual.
 */
export async function handleBlogAssist(request: Request, convex: ConvexHttpClient): Promise<Response> {
  const body = AssistRequest.safeParse(await request.json().catch(() => null))
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 })
  const { action, prompt, draft } = body.data
  const projectId = body.data.projectId as Id<"projects">

  const site = await siteContext(convex, projectId)
  if (!site) return Response.json({ error: "Site not found" }, { status: 404 })

  const brief = prompt.trim()
  let task: string
  let schema: z.ZodType
  switch (action) {
    case "ideas":
      schema = Ideas
      task = `Suggest six blog post ideas for this site${brief ? ` around: ${brief}` : ""}. Mix practical guides, answers to questions customers ask, and local or seasonal angles. Each should be something this business can write with authority.`
      break
    case "write":
      if (!draft.title.trim() && !brief) return Response.json({ error: "Give the post a title or say what it should cover." }, { status: 400 })
      schema = Post
      task = `Write the full blog post, around 700 to 1,000 words.${draft.title ? ` Its title is "${draft.title}"; keep it unless it's unclear.` : " Give it a specific title."}${brief ? `\nWhat it should cover: ${brief}` : ""}${draft.body.trim() ? "\nThe post has a body already: use its ideas and notes, and write the finished post." : ""}`
      break
    case "revise":
      if (!draft.body.trim()) return Response.json({ error: "Write or generate the post first." }, { status: 400 })
      if (!brief) return Response.json({ error: "Say how the post should change." }, { status: 400 })
      schema = Revised
      task = `Revise the post as asked, keeping everything else as it is: ${brief}`
      break
    case "details":
      if (!draft.body.trim() && !draft.title.trim()) return Response.json({ error: "Write the post first." }, { status: 400 })
      schema = Details
      task = "Write the excerpt, tags, search title and search description for this post."
      break
  }

  try {
    const result = await generateText({
      model: MODEL,
      instructions: INSTRUCTIONS,
      prompt: `${site.text}\n\n${action === "ideas" ? "" : `${draftText(draft)}\n\n`}${task}`,
      output: Output.object({ schema }),
      maxOutputTokens: 8000,
      providerOptions: {
        gateway: { only: ["anthropic"] },
        anthropic: { effort: action === "write" || action === "revise" ? "medium" : "low" },
      },
    })
    console.log(`[blog-assist ${projectId}] ${action}: ${result.usage.inputTokens ?? 0} in, ${result.usage.outputTokens ?? 0} out`)
    return Response.json(result.output)
  } catch (error) {
    console.error(`[blog-assist ${projectId}] ${action} failed:`, errorMessage(error))
    return Response.json({ error: "The AI couldn't finish that. Try again." }, { status: 502 })
  }
}

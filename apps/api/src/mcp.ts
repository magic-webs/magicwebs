import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import type { ConvexHttpClient } from "convex/browser"
import { z } from "zod"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"
import { MAX_SITE_PAGES, PageDocSchema, REBUILD_RULES } from "@magicwebs/page-schema"

import { errorMessage, PAGE_TOOLS } from "./tools"

// MCP clients (Claude Code, Cursor, any agent) bring their own model: nothing
// here calls the platform's AI. Pages they clone that are too large to copy
// exactly are handed back to them to rebuild (get_rebuild_brief, then
// submit_rebuilt_page) instead of being rebuilt with the platform's AI.

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] }
}

function failure(error: unknown) {
  return { ...text(errorMessage(error)), isError: true }
}

const SUBMIT_INSTRUCTIONS = `When the page is ready, call submit_rebuilt_page with this project's projectId, the page's path as \`page\` and the page document as \`doc\`. It must match this JSON Schema:
${JSON.stringify(z.toJSONSchema(PageDocSchema))}`

const PAGE_ARG = z
  .string()
  .optional()
  .describe('Path of the page in the project\'s site, e.g. "/about" (see list_pages). Defaults to the home page "/".')

function buildServer(convex: ConvexHttpClient): McpServer {
  const server = new McpServer({ name: "magicwebs", version: "0.3.0" })

  server.registerTool(
    "list_projects",
    {
      description:
        "List your landing page projects with their ids, status, current step and live hostname. A project whose step says it is waiting for your agent needs get_rebuild_brief.",
      inputSchema: z.object({}),
    },
    async () => {
      const projects = await convex.query(api.projects.list, {})
      return text(
        projects.map((p) => ({
          projectId: p._id,
          name: p.name,
          status: p.status,
          step: p.step,
          hostname: p.hostname,
          source: p.sourceUrl,
        })),
      )
    },
  )

  server.registerTool(
    "discover_pages",
    {
      description: `Find the pages of the site a URL belongs to, from the page's links and the site's sitemap: the page itself first, then the pages it links to (menus first). Use it before clone_landing_page to offer the user which pages to clone; a site holds up to ${MAX_SITE_PAGES}.`,
      inputSchema: z.object({ url: z.string() }),
    },
    async ({ url }) => {
      try {
        return text(await convex.action(api.pages.discover, { url }))
      } catch (error) {
        return failure(error)
      }
    },
  )

  server.registerTool(
    "clone_landing_page",
    {
      description: `Clone a public page URL, and optionally more pages of the same site (\`pages\`, URLs from discover_pages), into a new editable site. The URL becomes the home page "/"; other pages keep their paths, and links between cloned pages point at the clone. At most ${MAX_SITE_PAGES} pages. Cloning runs in the background; poll list_pages or list_projects. Most pages are copied exactly. If a page is too large to copy, it is not rebuilt with Magicwebs' AI: its step says it is waiting for your agent, and you rebuild it yourself with get_rebuild_brief and submit_rebuilt_page.`,
      inputSchema: z.object({ url: z.string(), name: z.string().optional(), pages: z.array(z.string()).optional() }),
    },
    async ({ url, name, pages }) => {
      try {
        const projectId = await convex.mutation(api.projects.create, {
          url,
          name,
          ai: "agent",
          pages: pages?.map((page) => ({ url: page })),
        })
        return text({ projectId, status: "cloning" })
      } catch (error) {
        return failure(error)
      }
    },
  )

  server.registerTool(
    "list_pages",
    {
      description:
        "List the pages of a project's site: path, title, original URL and cloning status. Pass a page's path as `page` to the editing tools to edit it.",
      inputSchema: z.object({ projectId: z.string() }),
    },
    async ({ projectId }) => {
      try {
        return text(await convex.query(api.pages.list, { projectId: projectId as Id<"projects"> }))
      } catch (error) {
        return failure(error)
      }
    },
  )

  server.registerTool(
    "add_pages",
    {
      description: `Clone more pages of the original site (URLs, e.g. from discover_pages) into an existing project. Pages already in it are skipped; a site holds up to ${MAX_SITE_PAGES} pages.`,
      inputSchema: z.object({ projectId: z.string(), urls: z.array(z.string()) }),
    },
    async ({ projectId, urls }) => {
      try {
        return text(
          await convex.mutation(api.pages.add, {
            projectId: projectId as Id<"projects">,
            pages: urls.map((url) => ({ url })),
            ai: "agent",
          }),
        )
      } catch (error) {
        return failure(error)
      }
    },
  )

  server.registerTool(
    "remove_page",
    {
      description: 'Remove a page from a project\'s site. The home page ("/") can\'t be removed.',
      inputSchema: z.object({ projectId: z.string(), page: z.string() }),
    },
    async ({ projectId, page }) => {
      try {
        await convex.mutation(api.pages.remove, { projectId: projectId as Id<"projects">, path: page })
        return text({ ok: true })
      } catch (error) {
        return failure(error)
      }
    },
  )

  server.registerTool(
    "get_rebuild_brief",
    {
      description:
        "For a cloned page too large to copy exactly: get screenshots of the original (desktop slices top to bottom, then mobile), its captured structure, and the rules for rebuilding it as a page document with your own model. Then call submit_rebuilt_page.",
      inputSchema: z.object({ projectId: z.string(), page: PAGE_ARG }),
    },
    async ({ projectId, page }) => {
      try {
        const brief = await convex.query(api.rebuilds.brief, { projectId: projectId as Id<"projects">, path: page })
        if (!brief) return failure("This project isn't waiting for a rebuild. Check its status with list_projects.")
        const images = await Promise.all(
          brief.screenshots.map(async (url) => {
            const res = await fetch(url)
            if (!res.ok) throw new Error(`Couldn't load a screenshot (${res.status})`)
            const data = Buffer.from(await res.arrayBuffer()).toString("base64")
            return { type: "image" as const, data, mimeType: "image/jpeg" }
          }),
        )
        return {
          content: [
            { type: "text" as const, text: `Page: ${brief.path}\n${REBUILD_RULES}\n${SUBMIT_INSTRUCTIONS}` },
            ...images,
            { type: "text" as const, text: brief.text },
          ],
        }
      } catch (error) {
        return failure(error)
      }
    },
  )

  server.registerTool(
    "submit_rebuilt_page",
    {
      description:
        "Save the page document you rebuilt from get_rebuild_brief. It replaces the project's draft and marks the project ready to edit.",
      inputSchema: z.object({ projectId: z.string(), page: PAGE_ARG, doc: z.record(z.string(), z.any()) }),
    },
    async ({ projectId, page, doc }) => {
      try {
        return text(await convex.mutation(api.rebuilds.submit, { projectId: projectId as Id<"projects">, path: page, doc }))
      } catch (error) {
        return failure(error)
      }
    },
  )

  for (const [name, def] of Object.entries(PAGE_TOOLS)) {
    server.registerTool(
      name,
      { description: def.description, inputSchema: def.input.extend({ projectId: z.string(), page: PAGE_ARG }) },
      async (input: Record<string, unknown>) => {
        const { projectId, page, ...rest } = input
        try {
          const target = { projectId: projectId as Id<"projects">, path: (page as string | undefined) ?? "/" }
          return text(await def.run(convex, target, rest, "mcp"))
        } catch (error) {
          return failure(error)
        }
      },
    )
  }

  return server
}

/**
 * Stateless Streamable HTTP endpoint: every request gets a fresh server and
 * transport, so the API can scale horizontally without sticky sessions.
 * `convex` is signed in as the owner of the request's API key.
 */
export async function handleMcp(request: Request, convex: ConvexHttpClient): Promise<Response> {
  const server = buildServer(convex)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}

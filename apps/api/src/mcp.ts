import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { z } from "zod"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { convex, errorMessage, PAGE_TOOLS } from "./tools"

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] }
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "magicwebs", version: "0.1.0" })

  server.registerTool(
    "list_projects",
    { description: "List landing page projects with their ids, status and live hostname.", inputSchema: z.object({}) },
    async () => {
      const projects = await convex.query(api.projects.list, {})
      return text(
        projects.map((p) => ({ projectId: p._id, name: p.name, status: p.status, hostname: p.hostname, source: p.sourceUrl })),
      )
    },
  )

  server.registerTool(
    "clone_landing_page",
    {
      description: "Clone a public landing page URL into a new editable project. Cloning runs in the background.",
      inputSchema: z.object({ url: z.string(), name: z.string().optional() }),
    },
    async ({ url, name }) => {
      try {
        const projectId = await convex.mutation(api.projects.create, { url, name })
        return text({ projectId, status: "cloning" })
      } catch (error) {
        return { ...text(errorMessage(error)), isError: true }
      }
    },
  )

  for (const [name, def] of Object.entries(PAGE_TOOLS)) {
    server.registerTool(
      name,
      { description: def.description, inputSchema: def.input.extend({ projectId: z.string() }) },
      async (input: Record<string, unknown>) => {
        const { projectId, ...rest } = input
        try {
          return text(await def.run(projectId as Id<"projects">, rest, "mcp"))
        } catch (error) {
          return { ...text(errorMessage(error)), isError: true }
        }
      },
    )
  }

  return server
}

/**
 * Stateless Streamable HTTP endpoint: every request gets a fresh server and
 * transport, so the API can scale horizontally without sticky sessions.
 */
export async function handleMcp(request: Request): Promise<Response> {
  const server = buildServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}

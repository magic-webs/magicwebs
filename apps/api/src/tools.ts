import { ConvexHttpClient } from "convex/browser"
import { ConvexError } from "convex/values"
import { z } from "zod"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"
import { OP_DEFINITIONS, OP_NAMES, outline, type Op, type PageDoc } from "@magicwebs/page-schema"

import { env } from "./env"

// One definition of every page tool, exposed twice: to the in-app AI chat
// (AI SDK tools bound to the open project) and to external clients over MCP
// (where each call names its project).

export const convex = new ConvexHttpClient(env.convexUrl)

export type EditSource = "ai" | "mcp"

export type PageTool = {
  description: string
  input: z.ZodObject
  run: (projectId: Id<"projects">, input: Record<string, unknown>, source: EditSource) => Promise<unknown>
}

async function loadDoc(projectId: Id<"projects">): Promise<PageDoc> {
  const draft = await convex.query(api.drafts.get, { projectId })
  if (!draft) throw new Error("Project not found")
  return draft.doc
}

function editTool(name: (typeof OP_NAMES)[number]): PageTool {
  const def = OP_DEFINITIONS[name]
  return {
    description: def.description,
    input: def.input,
    run: async (projectId, input, source) => {
      const op = { ...input, op: name } as Op
      const { results } = await convex.mutation(api.drafts.applyOps, { projectId, ops: [op], source })
      return { ok: true, results }
    },
  }
}

export const PAGE_TOOLS: Record<string, PageTool> = {
  get_page_outline: {
    description:
      "List the page's sections in order with their ids and types. Call this first to find the section ids you need.",
    input: z.object({}),
    run: async (projectId) => outline(await loadDoc(projectId)),
  },
  get_section: {
    description: "Get the full JSON of one section, including all props and style.",
    input: z.object({ sectionId: z.string() }),
    run: async (projectId, { sectionId }) => {
      const section = (await loadDoc(projectId)).sections.find((s) => s.id === sectionId)
      if (!section) throw new Error(`No section with id "${sectionId}"`)
      return section
    },
  },
  get_theme_and_meta: {
    description: "Get the global theme (colors, fonts, radius, width) and SEO metadata.",
    input: z.object({}),
    run: async (projectId) => {
      const doc = await loadDoc(projectId)
      return { theme: doc.theme, meta: doc.meta }
    },
  },
  apply_operations: {
    description:
      "Apply several edit operations atomically in one step (all succeed or none do). Each item is an object with an `op` field naming one of the edit tools plus that tool's arguments.",
    input: z.object({ ops: z.array(z.record(z.string(), z.any())) }),
    run: async (projectId, { ops }, source) => {
      const { results } = await convex.mutation(api.drafts.applyOps, {
        projectId,
        ops: ops as unknown[],
        source,
      })
      return { ok: true, results }
    },
  },
  ...Object.fromEntries(OP_NAMES.map((name) => [name, editTool(name)])),
  publish_page: {
    description: "Publish the current draft so it goes live. Only do this when the user asks to publish.",
    input: z.object({ note: z.string().optional().describe("Short description of what changed") }),
    run: async (projectId, { note }) => convex.mutation(api.versions.publish, { projectId, note: note as string | undefined }),
  },
  list_versions: {
    description: "List published versions, newest first.",
    input: z.object({}),
    run: async (projectId) => convex.query(api.versions.list, { projectId }),
  },
  rollback_to_version: {
    description: "Make an earlier published version live again and load it into the draft.",
    input: z.object({ versionId: z.string() }),
    run: async (projectId, { versionId }) => {
      await convex.mutation(api.versions.rollback, { projectId, versionId: versionId as Id<"versions"> })
      return { ok: true }
    },
  },
}

/** Turn thrown errors into a message the model can read and recover from. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) return String(error.data)
  if (error instanceof Error) return error.message
  return String(error)
}

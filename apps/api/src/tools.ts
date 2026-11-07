import type { ConvexHttpClient } from "convex/browser"
import { ConvexError } from "convex/values"
import { z } from "zod"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"
import { OP_DEFINITIONS, OP_NAMES, outline, type Op, type PageDoc } from "@magicwebs/page-schema"

// One definition of every page tool, exposed twice: to the in-app AI chat
// (AI SDK tools bound to the open project and page) and to external clients
// over MCP (where each call names its project and, optionally, its page). Each
// run gets a Convex client signed in as the user it acts for.

export type EditSource = "ai" | "mcp"

export type PageTool = {
  description: string
  input: z.ZodObject
  run: (
    convex: ConvexHttpClient,
    target: PageTarget,
    input: Record<string, unknown>,
    source: EditSource,
  ) => Promise<unknown>
}

/** The page a tool acts on: a project and the path of one of its pages ("/" is the home page). */
export type PageTarget = { projectId: Id<"projects">; path: string }

async function loadDoc(convex: ConvexHttpClient, { projectId, path }: PageTarget): Promise<PageDoc> {
  const draft = await convex.query(api.drafts.get, { projectId, path })
  if (!draft) throw new Error(path === "/" ? "Project not found" : `This site has no page ${path}`)
  return draft.doc
}

function editTool(name: (typeof OP_NAMES)[number]): PageTool {
  const def = OP_DEFINITIONS[name]
  return {
    description: def.description,
    input: def.input,
    run: async (convex, { projectId, path }, input, source) => {
      const op = { ...input, op: name } as Op
      const { results } = await convex.mutation(api.drafts.applyOps, { projectId, path, ops: [op], source })
      return { ok: true, results }
    },
  }
}

export const PAGE_TOOLS: Record<string, PageTool> = {
  get_page_outline: {
    description:
      "List the page's sections in order with their ids and types. Call this first to find the section ids you need.",
    input: z.object({}),
    run: async (convex, target) => outline(await loadDoc(convex, target)),
  },
  get_section: {
    description: "Get the full JSON of one section, including all props and style.",
    input: z.object({ sectionId: z.string() }),
    run: async (convex, target, { sectionId }) => {
      const section = (await loadDoc(convex, target)).sections.find((s) => s.id === sectionId)
      if (!section) throw new Error(`No section with id "${sectionId}"`)
      return section
    },
  },
  get_theme_and_meta: {
    description: "Get the global theme (colors, fonts, radius, width) and SEO metadata.",
    input: z.object({}),
    run: async (convex, target) => {
      const doc = await loadDoc(convex, target)
      return { theme: doc.theme, meta: doc.meta }
    },
  },
  search_page_css: {
    description:
      "Find rules in the page stylesheet of an exact clone (html sections) whose selector or declarations contain the query, e.g. a class name from get_section or a color. Use before edit_page_css.",
    input: z.object({ query: z.string() }),
    run: async (convex, target, { query }) => {
      const css = (await loadDoc(convex, target)).styles?.css ?? ""
      const needle = String(query).toLowerCase()
      // Top-level rules, keeping @media blocks whole so edits can copy them exactly.
      const rules: string[] = []
      let depth = 0
      let start = 0
      for (let i = 0; i < css.length; i++) {
        if (css[i] === "{") depth++
        else if (css[i] === "}" && --depth === 0) {
          rules.push(css.slice(start, i + 1).trim())
          start = i + 1
        }
      }
      const matches = rules.filter((r) => r.toLowerCase().includes(needle))
      return { total: matches.length, rules: matches.slice(0, 40).map((r) => (r.length > 1500 ? r.slice(0, 1500) + "…" : r)) }
    },
  },
  get_page_js: {
    description:
      "Get the page's custom JavaScript (empty when it has none). Read it before changing it with edit_page_js so `find` matches exactly.",
    input: z.object({}),
    run: async (convex, target) => ({ script: (await loadDoc(convex, target)).script ?? "" }),
  },
  apply_operations: {
    description:
      "Apply several edit operations atomically in one step (all succeed or none do). Each item is an object with an `op` field naming one of the edit tools plus that tool's arguments.",
    input: z.object({ ops: z.array(z.record(z.string(), z.any())) }),
    run: async (convex, { projectId, path }, { ops }, source) => {
      const { results } = await convex.mutation(api.drafts.applyOps, {
        projectId,
        path,
        ops: ops as unknown[],
        source,
      })
      return { ok: true, results }
    },
  },
  ...Object.fromEntries(OP_NAMES.map((name) => [name, editTool(name)])),
  publish_page: {
    description:
      "Publish the current drafts of every page of the site so they go live. Only do this when the user asks to publish.",
    input: z.object({ note: z.string().optional().describe("Short description of what changed") }),
    run: async (convex, { projectId }, { note }) => convex.mutation(api.versions.publish, { projectId, note: note as string | undefined }),
  },
  get_chat_widget: {
    description:
      "Get the site's Magic Agent chat widget: whether it's on, its position, color, teaser and the pages that hide it. Every page shows it by default once the site's Magic Agent workspace is ready.",
    input: z.object({}),
    run: async (convex, { projectId }) => convex.query(api.widget.get, { projectId }),
  },
  set_chat_widget: {
    description:
      "Change the site's Magic Agent chat widget. Changes go live at once, without publishing. `enabled` turns it on or off for the whole site; `showOnThisPage` shows or hides it on the current page only.",
    input: z.object({
      enabled: z.boolean().optional(),
      position: z.enum(["left", "right"]).optional(),
      color: z.string().optional().describe("Launcher color as hex, rgb() or hsl(); empty string to follow the page's primary color"),
      teaser: z.string().optional().describe("One-line bubble beside the launcher, e.g. 'Questions? Chat with us'; empty string removes it"),
      showOnThisPage: z.boolean().optional(),
    }),
    run: async (convex, { projectId, path }, input) => {
      const { showOnThisPage, ...rest } = input as {
        enabled?: boolean
        position?: "left" | "right"
        color?: string
        teaser?: string
        showOnThisPage?: boolean
      }
      await convex.mutation(api.widget.update, {
        projectId,
        ...rest,
        page: showOnThisPage === undefined ? undefined : { path, visible: showOnThisPage },
      })
      return convex.query(api.widget.get, { projectId })
    },
  },
  get_forms: {
    description:
      "List every form on the site's pages (form sections, and forms copied inside html sections) with its key, page, fields, whether it collects leads and how many it has. Each submission becomes a lead in the dashboard and in the site's Magic Agent workspace.",
    input: z.object({}),
    run: async (convex, { projectId }) => convex.query(api.leads.forms, { projectId }),
  },
  set_form_collecting: {
    description: "Stop a form collecting leads, or start it again, by its key from get_forms. Takes effect on the live site at once.",
    input: z.object({ form: z.string(), collecting: z.boolean() }),
    run: async (convex, { projectId }, { form, collecting }) => {
      await convex.mutation(api.leads.setCollecting, { projectId, form: form as string, collecting: collecting as boolean })
      return { ok: true }
    },
  },
  list_leads: {
    description: "List the site's most recent leads (form submissions), newest first. Optionally only one form's, by its key.",
    input: z.object({ form: z.string().optional(), limit: z.number().optional().describe("Default 50, at most 200") }),
    run: async (convex, { projectId }, { form, limit }) =>
      convex.query(api.leads.list, {
        projectId,
        form: form as string | undefined,
        limit: Math.min((limit as number | undefined) ?? 50, 200),
      }),
  },
  get_analytics: {
    description:
      "Get the published site's visitor analytics for the last `days` days (default 30, today included, UTC): visitors, page views, bounce rate, average time on page, leads and conversion, each with the period before for comparison, plus a row per day, top pages, referrers, UTM sources and campaigns, countries, devices, browsers, OS and who is on the site now. Visitors are counted once per day without cookies. Numbers lag up to 10 minutes; live visitors are real time.",
    input: z.object({ days: z.number().optional() }),
    run: async (convex, { projectId }, { days }) =>
      convex.query(api.analytics.summary, { projectId, days: (days as number | undefined) ?? 30 }),
  },
  list_versions: {
    description: "List published versions, newest first.",
    input: z.object({}),
    run: async (convex, { projectId }) => convex.query(api.versions.list, { projectId }),
  },
  rollback_to_version: {
    description: "Make an earlier published version of the whole site live again and load it into the drafts.",
    input: z.object({ versionId: z.string() }),
    run: async (convex, { projectId }, { versionId }) => {
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

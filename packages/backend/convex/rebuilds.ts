import { ConvexError, v } from "convex/values"
import { z } from "zod"

import { applyTemplate, getTemplate, HOME_PATH, newSectionId, PageDocSchema } from "@magicwebs/page-schema"

import { query, mutation } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"
import { getDraft, requireProject, setPageState, storeDoc } from "./lib"

// Pages created by an agent over MCP that are too large to copy exactly are
// rebuilt by that agent with its own model, never with the platform's AI: the
// crawler leaves a brief (jobs.handOff), the agent reads it and submits the
// page document it built.

/** A project's pending brief: for `path` when given, else the first page waiting for one. */
async function findBrief(ctx: QueryCtx, projectId: Id<"projects">, path: string | undefined) {
  const briefs = await ctx.db
    .query("rebuildBriefs")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect()
  return briefs.find((b) => !path || (b.path ?? HOME_PATH) === path) ?? null
}

/** The pending rebuild brief of a project's page, with links to its screenshots. */
export const brief = query({
  args: { projectId: v.id("projects"), path: v.optional(v.string()) },
  handler: async (ctx, { projectId, path }) => {
    await requireProject(ctx, projectId)
    const brief = await findBrief(ctx, projectId, path)
    if (!brief) return null
    const screenshots = []
    for (const file of brief.screenshots) {
      const url = await ctx.storage.getUrl(file)
      if (url) screenshots.push(url)
    }
    return { path: brief.path ?? HOME_PATH, url: brief.url, template: brief.template, text: brief.text, screenshots }
  },
})

/** Save the page an agent rebuilt from a brief and mark that page ready. */
export const submit = mutation({
  args: { projectId: v.id("projects"), doc: v.any(), path: v.optional(v.string()) },
  handler: async (ctx, { projectId, doc, path }) => {
    await requireProject(ctx, projectId)
    const brief = await findBrief(ctx, projectId, path)
    if (!brief) throw new ConvexError(path ? `Page ${path} isn't waiting for a rebuild` : "This project isn't waiting for a rebuild")
    const pagePath = brief.path ?? HOME_PATH

    const parsed = PageDocSchema.safeParse(doc)
    if (!parsed.success) throw new ConvexError(`Invalid page: ${z.prettifyError(parsed.error)}`)
    const template = getTemplate(brief.template)
    // A revamp gets its template's theme and section styling whatever the agent chose.
    const page = template ? applyTemplate(parsed.data, template) : parsed.data
    // Agents often reuse or omit ids; every section needs a unique one.
    const seen = new Set<string>()
    for (const section of page.sections) {
      if (!section.id || seen.has(section.id)) section.id = newSectionId()
      seen.add(section.id)
    }

    const draft = await getDraft(ctx, projectId, pagePath)
    const revision = draft.revision + 1
    const now = Date.now()
    await ctx.db.patch(draft._id, { doc: await storeDoc(ctx, page), revision, updatedAt: now })
    await ctx.db.insert("edits", {
      projectId,
      path: pagePath,
      revision,
      source: "mcp",
      ops: [],
      results: [template ? `Revamped ${brief.url} in the ${template.name} template with your agent` : `Rebuilt ${brief.url} with your agent`],
      createdAt: now,
    })
    for (const file of brief.screenshots) await ctx.storage.delete(file)
    await ctx.db.delete(brief._id)
    const job = await ctx.db.get(brief.jobId)
    if (job) await ctx.db.patch(job._id, { status: "done" })
    await setPageState(ctx, projectId, pagePath, { status: "ready" })
    return { path: pagePath, revision, sections: page.sections.length }
  },
})

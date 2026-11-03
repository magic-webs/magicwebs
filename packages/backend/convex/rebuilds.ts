import { ConvexError, v } from "convex/values"
import { z } from "zod"

import { newSectionId, PageDocSchema } from "@magicwebs/page-schema"

import { query, mutation } from "./_generated/server"
import { getDraft, requireProject, storeDoc } from "./lib"

// Pages created by an agent over MCP that are too large to copy exactly are
// rebuilt by that agent with its own model, never with the platform's AI: the
// crawler leaves a brief (jobs.handOff), the agent reads it and submits the
// page document it built.

/** The pending rebuild brief of a project, with links to its screenshots. */
export const brief = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProject(ctx, projectId)
    const brief = await ctx.db
      .query("rebuildBriefs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first()
    if (!brief) return null
    const screenshots = []
    for (const file of brief.screenshots) {
      const url = await ctx.storage.getUrl(file)
      if (url) screenshots.push(url)
    }
    return { url: brief.url, text: brief.text, screenshots }
  },
})

/** Save the page an agent rebuilt from a brief and mark the project ready. */
export const submit = mutation({
  args: { projectId: v.id("projects"), doc: v.any() },
  handler: async (ctx, { projectId, doc }) => {
    await requireProject(ctx, projectId)
    const brief = await ctx.db
      .query("rebuildBriefs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first()
    if (!brief) throw new ConvexError("This project isn't waiting for a rebuild")

    const parsed = PageDocSchema.safeParse(doc)
    if (!parsed.success) throw new ConvexError(`Invalid page: ${z.prettifyError(parsed.error)}`)
    const page = parsed.data
    // Agents often reuse or omit ids; every section needs a unique one.
    const seen = new Set<string>()
    for (const section of page.sections) {
      if (!section.id || seen.has(section.id)) section.id = newSectionId()
      seen.add(section.id)
    }

    const draft = await getDraft(ctx, projectId)
    const revision = draft.revision + 1
    const now = Date.now()
    await ctx.db.patch(draft._id, { doc: await storeDoc(ctx, page), revision, updatedAt: now })
    await ctx.db.insert("edits", {
      projectId,
      revision,
      source: "mcp",
      ops: [],
      results: [`Rebuilt ${brief.url} with your agent`],
      createdAt: now,
    })
    for (const file of brief.screenshots) await ctx.storage.delete(file)
    await ctx.db.delete(brief._id)
    const job = await ctx.db.get(brief.jobId)
    if (job) await ctx.db.patch(job._id, { status: "done" })
    await ctx.db.patch(projectId, { status: "ready", step: undefined, error: undefined })
    return { revision, sections: page.sections.length }
  },
})

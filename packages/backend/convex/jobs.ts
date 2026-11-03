import { ConvexError, v } from "convex/values"
import { z } from "zod"

import { PageDocSchema } from "@magicwebs/page-schema"

import type { Id } from "./_generated/dataModel"
import { mutation, query, type MutationCtx } from "./_generated/server"
import { assertWorker, getDraft, ownedProject, storeDoc } from "./lib"
import { aiUsage } from "./models"

// Crawl jobs are pulled by the Playwright workers on the VPS. Every mutation
// here requires the shared WORKER_SECRET.

const STALE_AFTER_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 3

export const latestForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    if (!(await ownedProject(ctx, projectId))) return null
    return ctx.db
      .query("jobs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .first()
  },
})

/** Claim the oldest queued job, or a running job whose worker went silent. */
export const claim = mutation({
  args: { secret: v.string(), workerId: v.string() },
  handler: async (ctx, { secret, workerId }) => {
    assertWorker(secret)
    const now = Date.now()

    let job = await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .first()
    if (!job) {
      job = await ctx.db
        .query("jobs")
        .withIndex("by_status", (q) => q.eq("status", "running"))
        .filter((q) => q.lt(q.field("claimedAt"), now - STALE_AFTER_MS))
        .first()
    }
    if (!job) return null

    if (job.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(job._id, { status: "failed", error: "Gave up after repeated worker failures" })
      await ctx.db.patch(job.projectId, { status: "failed", error: "Cloning failed repeatedly", step: undefined })
      return null
    }

    await ctx.db.patch(job._id, { status: "running", workerId, claimedAt: now, attempts: job.attempts + 1 })
    await ctx.db.patch(job.projectId, { step: "Opening page" })
    return {
      jobId: job._id,
      projectId: job.projectId,
      url: job.url,
      model: job.model,
      effort: job.effort,
      ai: job.ai ?? "platform",
    }
  },
})

export const progress = mutation({
  args: { secret: v.string(), jobId: v.id("jobs"), step: v.string() },
  handler: async (ctx, { secret, jobId, step }) => {
    assertWorker(secret)
    const job = await ctx.db.get(jobId)
    if (!job || job.status !== "running") return
    await ctx.db.patch(jobId, { claimedAt: Date.now() })
    await ctx.db.patch(job.projectId, { step })
  },
})

export const complete = mutation({
  args: { secret: v.string(), jobId: v.id("jobs"), doc: v.any(), usage: v.optional(aiUsage) },
  handler: async (ctx, { secret, jobId, doc, usage }) => {
    assertWorker(secret)
    const job = await ctx.db.get(jobId)
    if (!job) throw new ConvexError("Job not found")
    const parsed = PageDocSchema.safeParse(doc)
    if (!parsed.success) {
      throw new ConvexError(`Cloned page is invalid: ${z.prettifyError(parsed.error)}`)
    }

    const draft = await getDraft(ctx, job.projectId)
    const now = Date.now()
    await ctx.db.patch(draft._id, { doc: await storeDoc(ctx, parsed.data), revision: draft.revision + 1, updatedAt: now })
    await ctx.db.insert("edits", {
      projectId: job.projectId,
      revision: draft.revision + 1,
      source: "clone",
      ops: [],
      results: [`Cloned ${job.url}`],
      createdAt: now,
    })
    await clearBriefs(ctx, job.projectId)
    await ctx.db.patch(jobId, { status: "done", usage })
    await ctx.db.patch(job.projectId, { status: "ready", step: undefined, error: undefined, usage })
  },
})

export const fail = mutation({
  args: { secret: v.string(), jobId: v.id("jobs"), error: v.string() },
  handler: async (ctx, { secret, jobId, error }) => {
    assertWorker(secret)
    const job = await ctx.db.get(jobId)
    if (!job) return
    await ctx.db.patch(jobId, { status: "failed", error })
    await ctx.db.patch(job.projectId, { status: "failed", step: undefined, error })
  },
})

/** Where a worker uploads the screenshots of a rebuild brief. */
export const briefUploadUrl = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertWorker(secret)
    return ctx.storage.generateUploadUrl()
  },
})

/**
 * Hand an agent-mode job whose page is too large to copy back to the agent
 * that created it, which rebuilds it with its own model (rebuilds.submit)
 * instead of the platform's AI.
 */
export const handOff = mutation({
  args: {
    secret: v.string(),
    jobId: v.id("jobs"),
    url: v.string(),
    screenshots: v.array(v.id("_storage")),
    text: v.string(),
  },
  handler: async (ctx, { secret, jobId, url, screenshots, text }) => {
    assertWorker(secret)
    const job = await ctx.db.get(jobId)
    if (!job) throw new ConvexError("Job not found")
    await clearBriefs(ctx, job.projectId)
    await ctx.db.insert("rebuildBriefs", { projectId: job.projectId, jobId, url, screenshots, text, createdAt: Date.now() })
    await ctx.db.patch(jobId, { status: "awaiting_agent" })
    await ctx.db.patch(job.projectId, { step: "Too large to copy exactly. Waiting for your agent to rebuild it" })
  },
})

async function clearBriefs(ctx: MutationCtx, projectId: Id<"projects">) {
  const briefs = await ctx.db
    .query("rebuildBriefs")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect()
  for (const brief of briefs) {
    for (const file of brief.screenshots) await ctx.storage.delete(file)
    await ctx.db.delete(brief._id)
  }
}

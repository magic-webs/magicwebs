import { ConvexClient, ConvexHttpClient } from "convex/browser"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { mirrorAssets } from "./assets"
import { capture, type Capture } from "./capture"
import { env } from "./env"
import { cloneExact, PageTooLargeError } from "./exact"
import { extractFromHtml } from "./extract"
import { getTemplate } from "@magicwebs/page-schema"

import { describeCapture, reconstruct } from "./generate"

const convex = new ConvexHttpClient(env.convexUrl)
const secret = env.workerSecret

async function runOnce(): Promise<boolean> {
  const job = await convex.mutation(api.jobs.claim, { secret, workerId: env.workerId, revamps: true })
  if (!job) return false

  const step = (label: string) => convex.mutation(api.jobs.progress, { secret, jobId: job.jobId, step: label })
  console.log(`[${job.jobId}] rebuilding ${job.url} (${job.model ?? "default"}, effort ${job.effort ?? "default"})`)
  try {
    let doc
    let usage
    const template = getTemplate(job.template)
    if (template) {
      // A revamp: rebuild the page's content in the chosen design template.
      await step("Capturing the original page")
      const shot = await capture(job.url)
      const facts = extractFromHtml(shot.html, shot.finalUrl)
      if (job.ai === "agent") {
        console.log(`[${job.jobId}] handing the ${template.id} revamp to the agent`)
        await handOff(job.jobId, shot, describeCapture(shot, facts))
        return true
      }
      await step(`Redesigning in the ${template.name} template`)
      const rebuilt = await reconstruct(shot, facts, { model: job.model, effort: job.effort, template })
      usage = rebuilt.usage
      console.log(`[${job.jobId}] revamp: ${usage.inputTokens} in / ${usage.outputTokens} out tokens, $${usage.costUsd?.toFixed(4) ?? "?"}`)
      doc = rebuilt.doc
    } else {
      try {
        const exact = await cloneExact(job.url, step)
        doc = exact.doc
        console.log(`[${job.jobId}] exact copy:`, JSON.stringify(exact.stats))
      } catch (error) {
        // Pages too large to store as markup are rebuilt as typed sections instead.
        if (!(error instanceof PageTooLargeError)) throw error
        const shot = await capture(job.url)
        const facts = extractFromHtml(shot.html, shot.finalUrl)
        if (job.ai === "agent") {
          // Created by an agent over MCP: it rebuilds the page with its own model.
          console.warn(`[${job.jobId}] ${error.message}; handing the rebuild to the agent`)
          await handOff(job.jobId, shot, describeCapture(shot, facts))
          return true
        }
        console.warn(`[${job.jobId}] ${error.message}; rebuilding with AI instead`)
        await step("Page too large to copy exactly, rebuilding with AI")
        await step("Rebuilding sections with AI")
        const rebuilt = await reconstruct(shot, facts, { model: job.model, effort: job.effort })
        usage = rebuilt.usage
        console.log(`[${job.jobId}] ${usage.inputTokens} in / ${usage.outputTokens} out tokens, $${usage.costUsd?.toFixed(4) ?? "?"}`)
        doc = rebuilt.doc
      }
    }
    await step("Copying images and fonts")
    doc = await mirrorAssets(doc, job.projectId)
    await convex.mutation(api.jobs.complete, { secret, jobId: job.jobId, doc, usage })
    console.log(`[${job.jobId}] done: ${doc.sections.length} sections`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[${job.jobId}] failed:`, error)
    await convex.mutation(api.jobs.fail, { secret, jobId: job.jobId, error: message.slice(0, 500) })
  }
  return true
}

/** Upload the screenshots and leave the agent a brief to rebuild the page from. */
async function handOff(jobId: Id<"jobs">, shot: Capture, text: string) {
  const screenshots: Id<"_storage">[] = []
  for (const image of [...shot.desktopSlices, shot.mobile]) {
    const uploadUrl = await convex.mutation(api.jobs.briefUploadUrl, { secret })
    const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: new Blob([image as Uint8Array<ArrayBuffer>]) })
    if (!res.ok) throw new Error(`Screenshot upload failed: ${res.status}`)
    screenshots.push(((await res.json()) as { storageId: Id<"_storage"> }).storageId)
  }
  await convex.mutation(api.jobs.handOff, { secret, jobId, url: shot.finalUrl, screenshots, text })
}

// Idle workers sleep until the subscription says a job is queued, or until the
// slow timer fires to pick up jobs whose worker went silent.
let wake: (() => void) | null = null
let signalled = true
function nudge() {
  signalled = true
  wake?.()
}
function idle(ms: number) {
  if (signalled) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      wake = null
      resolve()
    }
    wake = done
  })
}

const live = new ConvexClient(env.convexUrl)
live.onUpdate(
  api.jobs.hasQueued,
  { secret },
  (queued) => {
    if (queued) nudge()
  },
  (error) => console.error("Job subscription error:", error),
)

let stopping = false
const stop = () => {
  stopping = true
  wake?.()
}
process.on("SIGTERM", stop)
process.on("SIGINT", stop)

console.log(`Crawler ${env.workerId} waiting for jobs`)
while (!stopping) {
  signalled = false
  let worked = false
  try {
    worked = await runOnce()
  } catch (error) {
    console.error("Job loop error:", error)
  }
  if (!worked) await idle(env.staleCheckMs)
}
await live.close()
process.exit(0)

import { ConvexHttpClient } from "convex/browser"

import { api } from "@magicwebs/backend/convex/_generated/api"

import { mirrorAssets } from "./assets"
import { capture } from "./capture"
import { env } from "./env"
import { extractFromHtml } from "./extract"
import { reconstruct } from "./generate"

const convex = new ConvexHttpClient(env.convexUrl)
const secret = env.workerSecret

async function runOnce(): Promise<boolean> {
  const job = await convex.mutation(api.jobs.claim, { secret, workerId: env.workerId })
  if (!job) return false

  const step = (label: string) => convex.mutation(api.jobs.progress, { secret, jobId: job.jobId, step: label })
  console.log(`[${job.jobId}] rebuilding ${job.url} (${job.model ?? "default"}, effort ${job.effort ?? "default"})`)
  try {
    const shot = await capture(job.url)
    await step("Analyzing layout and styles")
    const facts = extractFromHtml(shot.html, shot.finalUrl)
    await step("Rebuilding sections with AI")
    const rebuilt = await reconstruct(shot, facts, { model: job.model, effort: job.effort })
    const usage = rebuilt.usage
    console.log(`[${job.jobId}] ${usage.inputTokens} in / ${usage.outputTokens} out tokens, $${usage.costUsd?.toFixed(4) ?? "?"}`)
    let doc = rebuilt.doc
    await step("Copying images")
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

let stopping = false
process.on("SIGTERM", () => (stopping = true))
process.on("SIGINT", () => (stopping = true))

console.log(`Crawler ${env.workerId} polling for jobs`)
while (!stopping) {
  let worked = false
  try {
    worked = await runOnce()
  } catch (error) {
    console.error("Job loop error:", error)
  }
  if (!worked) await Bun.sleep(env.pollIntervalMs)
}
process.exit(0)

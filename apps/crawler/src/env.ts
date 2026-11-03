function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

export const env = {
  convexUrl: required("CONVEX_URL"),
  workerSecret: required("WORKER_SECRET"),
  workerId: process.env.WORKER_ID || `crawler-${crypto.randomUUID().slice(0, 8)}`,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 3000),
  /** Vercel AI Gateway model id. Authenticated with AI_GATEWAY_API_KEY. */
  model: process.env.AI_MODEL ?? "anthropic/claude-haiku-5.5",
  r2: process.env.R2_BUCKET
    ? {
        bucket: required("R2_BUCKET"),
        endpoint: required("R2_ENDPOINT"),
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
        /** Public base URL the bucket is served from, e.g. https://assets.magicwebs.ai */
        publicUrl: required("R2_PUBLIC_URL").replace(/\/$/, ""),
      }
    : null,
}

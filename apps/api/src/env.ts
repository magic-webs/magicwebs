function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  convexUrl: required("CONVEX_URL"),
  /** Origins allowed to call the API from a browser (the platform UI). */
  webOrigins: (process.env.WEB_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()),
  /** Cloudflare R2, where files attached in the AI chat are stored. Uploads are off without it. */
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

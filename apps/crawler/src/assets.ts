import { S3Client } from "bun"

import type { PageDoc } from "@magicwebs/page-schema"

import { env } from "./env"
import { isPublicUrl } from "./safety"

// Copy every image a cloned page references into R2 so published pages don't
// depend on (or hotlink) the original site.

const MAX_ASSETS = 80
const MAX_BYTES = 8 * 1024 * 1024
const IMAGE_KEYS = new Set(["src", "backgroundImage", "favicon", "ogImage"])

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
}

function collectUrls(node: unknown, urls: Set<string>) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectUrls(n, urls))
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (IMAGE_KEYS.has(key) && typeof value === "string" && /^https?:/.test(value)) urls.add(value)
      else collectUrls(value, urls)
    }
  }
}

function rewrite(node: unknown, map: Map<string, string>): unknown {
  if (Array.isArray(node)) return node.map((n) => rewrite(n, map))
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        IMAGE_KEYS.has(key) && typeof value === "string" ? (map.get(value) ?? value) : rewrite(value, map),
      ]),
    )
  }
  return node
}

async function download(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!(await isPublicUrl(url))) return null
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) })
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim()
    if (!response.ok || !EXTENSIONS[type]) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes.byteLength <= MAX_BYTES ? { bytes, type } : null
  } catch {
    return null
  }
}

export async function mirrorAssets(doc: PageDoc, projectId: string): Promise<PageDoc> {
  const r2 = env.r2
  if (!r2) {
    console.warn("R2 is not configured; cloned pages will reference images on the original site")
    return doc
  }
  const client = new S3Client({
    bucket: r2.bucket,
    endpoint: r2.endpoint,
    accessKeyId: r2.accessKeyId,
    secretAccessKey: r2.secretAccessKey,
  })

  const urls = new Set<string>()
  collectUrls(doc, urls)
  const map = new Map<string, string>()

  const queue = [...urls].slice(0, MAX_ASSETS)
  const workers = Array.from({ length: 6 }, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      const file = await download(url)
      if (!file) continue
      const hash = new Bun.CryptoHasher("sha256").update(file.bytes).digest("hex").slice(0, 24)
      const key = `projects/${projectId}/assets/${hash}.${EXTENSIONS[file.type]}`
      await client.write(key, file.bytes, { type: file.type })
      map.set(url, `${r2.publicUrl}/${key}`)
    }
  })
  await Promise.all(workers)

  return rewrite(doc, map) as PageDoc
}

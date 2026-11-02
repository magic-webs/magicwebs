import { S3Client } from "bun"

import type { PageDoc } from "@magicwebs/page-schema"

import { env } from "./env"
import { isPublicUrl } from "./safety"

// Copy every image and font a cloned page references into R2 so published
// pages don't depend on (or hotlink) the original site. Fonts matter most:
// browsers only load cross-origin fonts the original server allows, and most
// sites don't allow ours.

const MAX_ASSETS = 400
const MAX_BYTES = 8 * 1024 * 1024
const IMAGE_KEYS = new Set(["src", "backgroundImage", "favicon", "ogImage"])
/** Fonts served with permissive CORS from a stable CDN don't need copying. */
const LEAVE_ALONE = /^https:\/\/(fonts\.gstatic\.com|use\.typekit\.net|p\.typekit\.net)\//

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "application/font-woff": "woff",
  "application/font-woff2": "woff2",
  "application/x-font-woff": "woff",
  "application/x-font-ttf": "ttf",
  "application/x-font-otf": "otf",
  "application/vnd.ms-fontobject": "eot",
}
const FONT_TYPES: Record<string, string> = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject" }

type Asset = { bytes: Uint8Array; type: string }

// Typed sections: image URLs live under known keys -----------------------------

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

// Exact sections: URLs inside markup and CSS -----------------------------------
// Markup attribute values are HTML-escaped, so URLs are matched in their
// escaped form (to replace them in place) and unescaped to download.

const unescapeAttr = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")

function urlsInMarkup(html: string, found: Map<string, string>) {
  for (const m of html.matchAll(/\s(?:src|poster)="((?:https?:|data:image\/svg\+xml;base64,)[^"]+)"/g)) found.set(m[1], unescapeAttr(m[1]))
  for (const m of html.matchAll(/\ssrcset="([^"]+)"/g)) {
    for (const candidate of m[1].split(/,\s+/)) {
      const url = candidate.trim().split(/\s+/)[0]
      if (/^https?:/.test(url)) found.set(url, unescapeAttr(url))
    }
  }
  for (const m of html.matchAll(/url\((?:&quot;|&#39;)?(https?:[^)]*?)(?:&quot;|&#39;)?\)/g)) found.set(m[1], unescapeAttr(m[1]))
}

function urlsInCss(css: string, found: Map<string, string>) {
  for (const m of css.matchAll(/url\(\s*["']?(https?:[^"')\s]+)["']?\s*\)/g)) found.set(m[1], m[1])
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function replaceAll(text: string, map: Map<string, string>): string {
  if (!map.size || !text) return text
  const pattern = new RegExp([...map.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join("|"), "g")
  return text.replace(pattern, (m) => map.get(m) ?? m)
}

// Downloads --------------------------------------------------------------------

function typeFor(url: string, served: string): string | null {
  if (EXTENSIONS[served]) return served
  const ext = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? ""
  // Many servers send fonts as octet-stream.
  return FONT_TYPES[ext] ?? null
}

async function download(url: string): Promise<Asset | null> {
  if (url.startsWith("data:image/svg+xml;base64,")) {
    const bytes = Uint8Array.from(atob(url.slice(26)), (c) => c.charCodeAt(0))
    return bytes.byteLength > 1024 ? { bytes, type: "image/svg+xml" } : null
  }
  if (LEAVE_ALONE.test(url) || !(await isPublicUrl(url))) return null
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) })
    const type = typeFor(url, (response.headers.get("content-type") ?? "").split(";")[0].trim())
    if (!response.ok || !type) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes.byteLength <= MAX_BYTES ? { bytes, type } : null
  } catch {
    return null
  }
}

export async function mirrorAssets(doc: PageDoc, projectId: string): Promise<PageDoc> {
  const r2 = env.r2
  if (!r2) {
    console.warn("R2 is not configured; cloned pages will reference images and fonts on the original site")
    return doc
  }
  const client = new S3Client({
    bucket: r2.bucket,
    endpoint: r2.endpoint,
    accessKeyId: r2.accessKeyId,
    secretAccessKey: r2.secretAccessKey,
  })

  // Matched text → URL to download.
  const found = new Map<string, string>()
  const typed = new Set<string>()
  collectUrls({ ...doc, styles: undefined, sections: doc.sections.filter((s) => s.type !== "html") }, typed)
  typed.forEach((u) => found.set(u, u))
  if (doc.meta.favicon) found.set(doc.meta.favicon, doc.meta.favicon)
  if (doc.meta.ogImage) found.set(doc.meta.ogImage, doc.meta.ogImage)
  for (const section of doc.sections) {
    if (section.type !== "html") continue
    urlsInMarkup(section.props.html, found)
    if (section.props.css) urlsInCss(section.props.css, found)
  }
  if (doc.styles) {
    urlsInCss(doc.styles.css, found)
    if (doc.styles.defs) urlsInMarkup(doc.styles.defs, found)
  }

  // One download per distinct URL; fonts first, since they can't be hotlinked.
  const byUrl = new Map<string, string[]>()
  for (const [text, url] of found) byUrl.set(url, [...(byUrl.get(url) ?? []), text])
  const queue = [...byUrl.keys()]
    .sort((a, b) => Number(/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(b)) - Number(/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(a)))
    .slice(0, MAX_ASSETS)
  const map = new Map<string, string>()
  const workers = Array.from({ length: 8 }, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      const file = await download(url)
      if (!file) continue
      const hash = new Bun.CryptoHasher("sha256").update(file.bytes).digest("hex").slice(0, 24)
      const ext = EXTENSIONS[file.type] ?? Object.entries(FONT_TYPES).find(([, t]) => t === file.type)?.[0] ?? "bin"
      const key = `projects/${projectId}/assets/${hash}.${ext}`
      await client.write(key, file.bytes, { type: file.type })
      for (const text of byUrl.get(url) ?? []) map.set(text, `${r2.publicUrl}/${key}`)
    }
  })
  await Promise.all(workers)

  const next = rewrite({ ...doc, styles: undefined, sections: [] }, map) as PageDoc
  next.sections = doc.sections.map((section) =>
    section.type === "html"
      ? {
          ...section,
          props: {
            ...section.props,
            html: replaceAll(section.props.html, map),
            css: section.props.css && replaceAll(section.props.css, map),
          },
        }
      : (rewrite(section, map) as typeof section),
  )
  if (doc.styles) {
    next.styles = { ...doc.styles, css: replaceAll(doc.styles.css, map), defs: doc.styles.defs && replaceAll(doc.styles.defs, map) }
  }
  return next
}

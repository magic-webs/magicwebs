import { S3Client } from "bun"
import type { ConvexHttpClient } from "convex/browser"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { env } from "./env"

// Files attached in the AI chat: images, videos, audio, PDFs and fonts. Each is
// stored in R2 under its project and gets a public https URL, which the chat
// passes to the model so it can look at the file and put it on the page.

/** What may be uploaded, and the extension it is stored with. */
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
}

/** Browsers often send fonts with no type or a generic one; go by the extension instead. */
const BY_EXTENSION: Record<string, string> = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" }

const MB = 1024 * 1024
const maxBytes = (type: string) => (type.startsWith("video/") || type.startsWith("audio/") ? 50 * MB : 10 * MB)

let client: S3Client | null = null

/** Store one uploaded file. The body is the raw file; `projectId` and `name` come in the query string. */
export async function handleUpload(request: Request, convex: ConvexHttpClient): Promise<Response> {
  const r2 = env.r2
  if (!r2) return Response.json({ error: "File uploads aren't set up on this server" }, { status: 503 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get("projectId") ?? ""
  const name = (url.searchParams.get("name") ?? "file").slice(0, 200)
  const project = await convex.query(api.projects.get, { projectId: projectId as Id<"projects"> }).catch(() => null)
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 })

  const extension = name.split(".").pop()?.toLowerCase() ?? ""
  const declared = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase()
  const type = TYPES[declared] ? declared : BY_EXTENSION[extension]
  if (!type) return Response.json({ error: "Upload an image, video, audio file, PDF or font" }, { status: 415 })

  const limit = maxBytes(type)
  if (Number(request.headers.get("Content-Length") ?? 0) > limit) return tooLarge(limit)
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength === 0) return Response.json({ error: "The file is empty" }, { status: 400 })
  if (bytes.byteLength > limit) return tooLarge(limit)

  client ??= new S3Client({
    bucket: r2.bucket,
    endpoint: r2.endpoint,
    accessKeyId: r2.accessKeyId,
    secretAccessKey: r2.secretAccessKey,
  })
  const key = `projects/${projectId}/uploads/${crypto.randomUUID()}.${TYPES[type]}`
  await client.write(key, bytes, { type })
  return Response.json({ url: `${r2.publicUrl}/${key}`, mediaType: type, filename: name, size: bytes.byteLength })
}

function tooLarge(limit: number) {
  return Response.json({ error: `Files of this type can be up to ${limit / MB} MB` }, { status: 413 })
}

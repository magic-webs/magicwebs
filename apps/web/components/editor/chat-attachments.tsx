"use client"

import type { FileUIPart } from "ai"
import { FileText, Music, TriangleAlert, Type, Video, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Spinner } from "@/components/ui/spinner"

// Files attached to an AI chat message. Each is uploaded to the API (stored in
// R2) as soon as it's picked, dropped or pasted, and sent with the message as a
// file part holding its public URL, so the AI can look at it and use it on the page.

export const ACCEPT = "image/*,video/mp4,video/webm,video/quicktime,audio/*,application/pdf,.woff,.woff2,.ttf,.otf"
const MAX_FILES = 10

type Pending = {
  id: string
  file: File
  /** Local preview for images and videos while uploading. */
  preview: string | null
  status: "uploading" | "done" | "error"
  part?: FileUIPart
  error?: string
}

export function useAttachments({ apiUrl, token, projectId }: { apiUrl: string; token: string | null; projectId: string }) {
  const [items, setItems] = useState<Pending[]>([])
  const live = useRef(items)
  useEffect(() => {
    live.current = items
  }, [items])

  useEffect(() => () => live.current.forEach((item) => item.preview && URL.revokeObjectURL(item.preview)), [])

  const update = (id: string, patch: Partial<Pending>) =>
    setItems((all) => all.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  const add = useCallback(
    (files: Iterable<File>) => {
      const room = MAX_FILES - live.current.length
      const picked = [...files].slice(0, Math.max(0, room))
      for (const file of picked) {
        const id = crypto.randomUUID()
        const visual = file.type.startsWith("image/") || file.type.startsWith("video/")
        setItems((all) => [...all, { id, file, preview: visual ? URL.createObjectURL(file) : null, status: "uploading" }])
        const query = new URLSearchParams({ projectId, name: file.name })
        fetch(`${apiUrl}/assets?${query}`, {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: file,
        })
          .then(async (res) => {
            const data = (await res.json().catch(() => ({}))) as {
              url?: string
              mediaType?: string
              filename?: string
              error?: string
            }
            if (!res.ok || !data.url || !data.mediaType) throw new Error(data.error ?? "Upload failed")
            update(id, {
              status: "done",
              part: { type: "file", url: data.url, mediaType: data.mediaType, filename: data.filename ?? file.name },
            })
          })
          .catch((error: unknown) =>
            update(id, { status: "error", error: error instanceof Error ? error.message : "Upload failed" }),
          )
      }
    },
    [apiUrl, token, projectId],
  )

  const remove = useCallback((id: string) => {
    setItems((all) => {
      const item = all.find((i) => i.id === id)
      if (item?.preview) URL.revokeObjectURL(item.preview)
      return all.filter((i) => i.id !== id)
    })
  }, [])

  /** The uploaded files as message parts, and an empty tray for the next message. */
  const take = useCallback((): FileUIPart[] => {
    const parts = live.current.flatMap((item) => (item.part ? [item.part] : []))
    live.current.forEach((item) => item.preview && URL.revokeObjectURL(item.preview))
    setItems([])
    return parts
  }, [])

  return {
    items,
    add,
    remove,
    take,
    uploading: items.some((item) => item.status === "uploading"),
    ready: items.some((item) => item.status === "done"),
    full: items.length >= MAX_FILES,
  }
}

function KindIcon({ mediaType }: { mediaType: string }) {
  if (mediaType.startsWith("video/")) return <Video />
  if (mediaType.startsWith("audio/")) return <Music />
  if (mediaType.startsWith("font/") || /\.(woff2?|ttf|otf)$/i.test(mediaType)) return <Type />
  return <FileText />
}

function sizeLabel(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** The files waiting to be sent with the next message. */
export function AttachmentTray({ items, onRemove }: { items: Pending[]; onRemove: (id: string) => void }) {
  if (items.length === 0) return null
  return (
    <AttachmentGroup>
      {items.map((item) => {
        const type = item.file.type
        return (
          <Attachment key={item.id} size="sm" state={item.status === "uploading" ? "uploading" : item.status === "error" ? "error" : "done"}>
            <AttachmentMedia variant={item.preview ? "image" : "icon"}>
              {item.status === "uploading" && !item.preview ? (
                <Spinner />
              ) : item.status === "error" ? (
                <TriangleAlert />
              ) : item.preview && type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.preview} alt="" />
              ) : item.preview ? (
                <video src={item.preview} muted playsInline className="aspect-square w-full object-cover" />
              ) : (
                <KindIcon mediaType={type || item.file.name} />
              )}
            </AttachmentMedia>
            <AttachmentContent className="max-w-32">
              <AttachmentTitle>{item.file.name}</AttachmentTitle>
              <AttachmentDescription>
                {item.status === "uploading" ? "Uploading…" : item.status === "error" ? item.error : sizeLabel(item.file.size)}
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction onClick={() => onRemove(item.id)} aria-label={`Remove ${item.file.name}`}>
                <X />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        )
      })}
    </AttachmentGroup>
  )
}

/** A file sent in the conversation. */
export function MessageFile({ part }: { part: FileUIPart }) {
  const name = part.filename ?? part.url.split("/").pop() ?? "file"
  if (part.mediaType.startsWith("image/")) {
    return (
      <a href={part.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={part.url} alt={name} className="max-h-48 w-full object-cover" />
      </a>
    )
  }
  if (part.mediaType.startsWith("video/")) {
    return <video src={part.url} controls playsInline className="max-h-48 w-full rounded-lg border bg-black" />
  }
  if (part.mediaType.startsWith("audio/")) {
    return <audio src={part.url} controls className="w-full" />
  }
  return (
    <a
      href={part.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-xs hover:bg-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
    >
      <KindIcon mediaType={part.mediaType} />
      <span className="truncate">{name}</span>
    </a>
  )
}

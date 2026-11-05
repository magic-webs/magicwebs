"use client"

import { useChat } from "@ai-sdk/react"
import { useAuthToken } from "@convex-dev/auth/react"
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowUp,
  AudioLines,
  Check,
  MessageSquarePlus,
  Mic,
  Paperclip,
  RotateCcw,
  Square,
  SquareDashedMousePointer,
  TriangleAlert,
  Upload,
  Wrench,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { ACCEPT, AttachmentTray, MessageFile, useAttachments } from "./chat-attachments"
import { useVoiceMode, type VoicePhase } from "./use-voice-mode"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"

const SUGGESTIONS = [
  "Rewrite the hero headline to be punchier",
  "Switch to a dark theme",
  "Add an FAQ section before the footer",
  "Use Playfair Display for headings",
]

const SECTION_SUGGESTIONS = ["Rewrite this section's copy", "Make this section stand out more", "Hide this section"]

/** What each tool call reads as in the conversation, while it runs and once done. */
const TOOL_LABELS: Record<string, [running: string, done: string]> = {
  get_page_outline: ["Reading the page", "Read the page"],
  get_section: ["Reading a section", "Read a section"],
  get_theme_and_meta: ["Reading the theme", "Read the theme"],
  search_page_css: ["Searching the styles", "Searched the styles"],
  apply_operations: ["Making changes", "Made changes"],
  publish_page: ["Publishing", "Published"],
  list_versions: ["Checking versions", "Checked versions"],
  rollback_to_version: ["Rolling back", "Rolled back"],
}

function toolLabel(name: string, done: boolean) {
  const known = TOOL_LABELS[name]
  if (known) return known[done ? 1 : 0]
  return done ? "Edited the page" : "Editing the page"
}

/** The edit results a tool returned ("Set props.heading on s_hero"), if any. */
function toolSummary(output: unknown): string | null {
  const results = (output as { results?: unknown } | undefined)?.results
  if (!Array.isArray(results) || results.length === 0) return null
  const text = results.map(String).join("; ")
  return text.length > 120 ? text.slice(0, 120) + "…" : text
}

type Selected = { id: string; type: string } | null

type ChatPanelProps = {
  projectId: Id<"projects">
  /** The page open in the editor; the AI edits this page. */
  path: string
  selected: Selected
  onClearSelection: () => void
}

/** The editor's AI chat. The conversation is stored per project, so it is still here after a reload. */
export function ChatPanel(props: ChatPanelProps) {
  const stored = useQuery(api.chats.list, { projectId: props.projectId })
  if (stored === undefined) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  }
  return <Conversation key={props.projectId} {...props} initialMessages={stored as UIMessage[]} />
}

function Conversation({
  projectId,
  path,
  selected,
  onClearSelection,
  initialMessages,
}: ChatPanelProps & { initialMessages: UIMessage[] }) {
  // The chat runs on the platform's AI, so the API requires the user's session token.
  // useChat always sends with the latest transport, so a refreshed token
  // takes effect without resetting the conversation.
  const token = useAuthToken()
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_URL}/chat`,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        // The server holds the conversation; send only the newest message.
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            projectId,
            path,
            message: messages.at(-1),
            selectedId: body?.selectedId ?? null,
            voice: body?.voice === true,
          },
        }),
      }),
    [projectId, path, token],
  )
  const { messages, setMessages, sendMessage, regenerate, status, stop, error, clearError } = useChat({
    id: projectId,
    messages: initialMessages,
    transport,
  })
  const clear = useMutation(api.chats.clear)
  const [input, setInput] = useState("")
  const [dragging, setDragging] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const busy = status === "submitted" || status === "streaming"
  const attachments = useAttachments({ apiUrl: API_URL, token: token ?? null, projectId })
  const voice = useVoiceMode({ busy, onUtterance: (text) => send(text, true) })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages, status])

  // In voice mode, read each finished reply aloud.
  const lastStatus = useRef(status)
  const { on: voiceOn, speak } = voice
  useEffect(() => {
    const was = lastStatus.current
    lastStatus.current = status
    if (!voiceOn || (was !== "submitted" && was !== "streaming")) return
    if (status === "error") return speak("Sorry, something went wrong with that reply.")
    if (status !== "ready") return
    const reply = messages.at(-1)
    if (reply?.role !== "assistant") return
    const text = reply.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ")
    speak(text.trim() || "Done.")
  }, [status, messages, voiceOn, speak])

  function send(text: string, spoken = false) {
    const clean = text.trim()
    if (busy || attachments.uploading || (!clean && !attachments.ready)) return
    const files = attachments.take()
    const options = { body: { selectedId: selected?.id, voice: spoken } }
    if (clean) sendMessage({ text: clean, files }, options)
    else sendMessage({ files }, options)
    if (!spoken) setInput("")
  }

  async function newChat() {
    if (busy) return
    setMessages([])
    clearError()
    await clear({ projectId })
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setDragging(false)
        attachments.add(e.dataTransfer.files)
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-primary/50 bg-background/90 text-sm">
          <span className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="size-5" />
            Drop images, videos or files to attach them
          </span>
        </div>
      )}
      {messages.length > 0 && (
        <div className="flex items-center justify-end border-b px-3 py-1.5">
          <Button variant="ghost" size="sm" onClick={newChat} disabled={busy}>
            <MessageSquarePlus />
            New chat
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground">
              Describe a change and the AI edits the page. Click a section in the preview to talk about it directly.
            </p>
            <div className="flex flex-wrap gap-2">
              {(selected ? SECTION_SUGGESTIONS : SUGGESTIONS).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border px-3 py-1 text-left text-xs hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "ml-6 flex max-w-[calc(100%-1.5rem)] flex-col gap-2 self-end rounded-xl bg-muted px-3 py-2"
                : "flex flex-col gap-2"
            }
          >
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                // Older messages carried the selection inline; hide it.
                const text = part.text.replace(/\n\n\(Selected section: .*\)$/, "")
                return (
                  <p key={i} className="whitespace-pre-wrap">
                    {text}
                  </p>
                )
              }
              if (part.type === "file") return <MessageFile key={i} part={part} />
              if (isToolUIPart(part)) {
                const done = part.state === "output-available"
                const failed =
                  part.state === "output-error" ||
                  (done && (part.output as { ok?: boolean } | undefined)?.ok === false)
                const summary = done && !failed ? toolSummary(part.output) : null
                return (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    {failed ? (
                      <TriangleAlert className="mt-px size-3.5 shrink-0 text-destructive" />
                    ) : done ? (
                      <Check className="mt-px size-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <Wrench className="mt-px size-3.5 shrink-0 animate-pulse" />
                    )}
                    <span className="min-w-0">
                      {failed ? `${toolLabel(getToolName(part), false)} failed` : toolLabel(getToolName(part), done)}
                      {summary && <span className="block truncate text-muted-foreground/80">{summary}</span>}
                    </span>
                  </div>
                )
              }
              return null
            })}
          </div>
        ))}

        {status === "submitted" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner /> Thinking…
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">Something went wrong with that reply.</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => regenerate({ body: { selectedId: selected?.id } })}
            >
              <RotateCcw />
              Retry
            </Button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex flex-col gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        {selected && (
          <div className="flex items-center gap-1.5 self-start rounded-md border bg-muted/50 py-0.5 pr-0.5 pl-2 text-xs">
            <SquareDashedMousePointer className="size-3.5 text-muted-foreground" />
            <span>
              Selected: <span className="font-medium">{selected.type}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onClearSelection}
              aria-label="Clear the selected section"
            >
              <X />
            </Button>
          </div>
        )}
        {voice.error && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" />
            <span className="flex-1">{voice.error}</span>
            <Button type="button" variant="ghost" size="icon-xs" onClick={voice.dismissError} aria-label="Dismiss">
              <X />
            </Button>
          </div>
        )}
        {voice.on && (
          <VoiceBar phase={voice.phase} interim={voice.interim} onSkip={voice.skipSpeech} onStop={voice.toggle} />
        )}
        <AttachmentTray items={attachments.items} onRemove={attachments.remove} />
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) attachments.add(e.target.files)
            e.target.value = ""
          }}
        />
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              if (e.clipboardData.files.length === 0) return
              e.preventDefault()
              attachments.add(e.clipboardData.files)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder={selected ? "Change the selected section…" : "Ask for a change…"}
            className="max-h-40 min-h-24 resize-none pr-12 pb-10"
          />
          <div className="absolute bottom-2 left-2 flex items-center gap-0.5">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => fileInput.current?.click()}
              disabled={attachments.full}
              aria-label="Attach images, videos or files"
              title="Attach images, videos or files"
            >
              <Paperclip />
            </Button>
            {voice.supported && (
              <Button
                type="button"
                size="icon-sm"
                variant={voice.on ? "secondary" : "ghost"}
                onClick={voice.toggle}
                aria-pressed={voice.on}
                aria-label={voice.on ? "Turn off voice mode" : "Talk to the AI (voice mode)"}
                title={voice.on ? "Turn off voice mode" : "Voice mode"}
              >
                {voice.on ? <AudioLines className="text-primary" /> : <Mic />}
              </Button>
            )}
          </div>
          {busy ? (
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="absolute right-2 bottom-2"
              onClick={stop}
              aria-label="Stop"
            >
              <Square />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              className="absolute right-2 bottom-2"
              disabled={attachments.uploading || (!input.trim() && !attachments.ready)}
              aria-label="Send"
            >
              <ArrowUp />
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Enter to send, Shift+Enter for a new line. Drop or paste files to attach them.
        </p>
      </form>
    </div>
  )
}

const PHASE_LABELS: Record<VoicePhase, string> = {
  off: "",
  listening: "Listening…",
  waiting: "Working on it…",
  speaking: "Speaking…",
}

/** What voice mode is doing, with what's being heard as the user speaks. */
function VoiceBar({
  phase,
  interim,
  onSkip,
  onStop,
}: {
  phase: VoicePhase
  interim: string
  onSkip: () => void
  onStop: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 py-1 pr-1 pl-2.5 text-xs" aria-live="polite">
      <span className="relative flex size-2.5 shrink-0">
        {phase === "listening" && <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />}
        <span
          className={cn(
            "relative size-2.5 rounded-full",
            phase === "listening" ? "bg-primary" : phase === "speaking" ? "bg-emerald-500" : "bg-muted-foreground/50",
          )}
        />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {interim ? <span className="italic">{interim}</span> : <span className="text-muted-foreground">{PHASE_LABELS[phase]}</span>}
      </span>
      {phase === "speaking" && (
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onSkip}>
          Skip
        </Button>
      )}
      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onStop}>
        <Square className="size-3" />
        End voice
      </Button>
    </div>
  )
}

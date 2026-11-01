"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai"
import { ArrowUp, Check, Square, TriangleAlert, Wrench } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"

const SUGGESTIONS = [
  "Rewrite the hero headline to be punchier",
  "Switch to a dark theme",
  "Add an FAQ section before the footer",
  "Use Playfair Display for headings",
]

function toolLabel(name: string) {
  return name.replace(/_/g, " ")
}

export function ChatPanel({ projectId, selectedId }: { projectId: Id<"projects">; selectedId: string | null }) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: `${API_URL}/chat`, body: { projectId } }),
    [projectId],
  )
  const { messages, sendMessage, status, stop, error } = useChat({ id: projectId, transport })
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages])

  function send(text: string) {
    if (!text.trim() || busy) return
    // Tell the model which section the user has selected, so "this section" works.
    const context = selectedId ? `\n\n(Selected section: ${selectedId})` : ""
    sendMessage({ text: text.trim() + context })
    setInput("")
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 text-sm">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground">
              Describe a change and the AI edits the page. Click a section in the preview to talk about it directly.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
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
            className={message.role === "user" ? "ml-6 self-end rounded-xl bg-muted px-3 py-2" : "flex flex-col gap-2"}
          >
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                const text = message.role === "user" ? part.text.replace(/\n\n\(Selected section: .*\)$/, "") : part.text
                return (
                  <p key={i} className="whitespace-pre-wrap">
                    {text}
                  </p>
                )
              }
              if (isToolUIPart(part)) {
                const done = part.state === "output-available"
                const failed =
                  part.state === "output-error" ||
                  (done && (part.output as { ok?: boolean } | undefined)?.ok === false)
                return (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {failed ? (
                      <TriangleAlert className="size-3.5 text-destructive" />
                    ) : done ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Wrench className="size-3.5 animate-pulse" />
                    )}
                    {toolLabel(getToolName(part))}
                  </div>
                )
              }
              return null
            })}
          </div>
        ))}

        {status === "submitted" && <Spinner className="text-muted-foreground" />}
        {error && <p className="text-xs text-destructive">The assistant hit an error: {error.message}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder={selectedId ? "Change the selected section…" : "Ask for a change…"}
            className="max-h-40 min-h-20 resize-none pr-12"
          />
          {busy ? (
            <Button type="button" size="icon-sm" variant="secondary" className="absolute right-2 bottom-2" onClick={stop} aria-label="Stop">
              <Square />
            </Button>
          ) : (
            <Button type="submit" size="icon-sm" className="absolute right-2 bottom-2" disabled={!input.trim()} aria-label="Send">
              <ArrowUp />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

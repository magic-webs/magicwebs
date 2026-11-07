"use client"

import { useAuthToken } from "@convex-dev/auth/react"
import { Lightbulb, Sparkles, Undo2, Wand2 } from "lucide-react"
import { useState } from "react"

import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { API_URL } from "@/components/dashboard/lib"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

/** The editor fields the AI reads and fills; tags are comma separated, as in the form. */
export type AiFields = {
  title: string
  excerpt: string
  body: string
  tags: string
  seoTitle: string
  seoDescription: string
}

type Action = "ideas" | "write" | "revise" | "details"
type Idea = { title: string; angle: string }

const REWRITES = [
  "Make it shorter and tighter",
  "Fix grammar and spelling",
  "Make the tone friendlier",
  "Add an FAQ section at the end",
  "Add a stronger call to action",
  "Make it more detailed with examples",
]

const splitTags = (tags: string) => tags.split(",").map((t) => t.trim()).filter(Boolean)

/**
 * Write with AI: post ideas, a whole post from a title or brief, rewrites and
 * search fields. Results go into the form; nothing is saved until the user saves.
 */
export function BlogAi({
  projectId,
  fields,
  onApply,
  canUndo,
  onUndo,
}: {
  projectId: Id<"projects">
  fields: AiFields
  onApply: (patch: Partial<AiFields>) => void
  canUndo: boolean
  onUndo: () => void
}) {
  const token = useAuthToken()
  const [prompt, setPrompt] = useState("")
  const [busy, setBusy] = useState<Action | null>(null)
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hasBody = fields.body.trim().length > 0

  async function ask<T>(action: Action, input: { prompt?: string; fields?: AiFields } = {}): Promise<T | null> {
    const f = input.fields ?? fields
    setBusy(action)
    setError(null)
    setNote(null)
    try {
      const res = await fetch(`${API_URL}/blog/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({
          projectId,
          action,
          prompt: input.prompt ?? prompt,
          draft: { title: f.title, excerpt: f.excerpt, body: f.body, tags: splitTags(f.tags) },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "The AI couldn't finish that. Try again.")
      return data as T
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setBusy(null)
    }
  }

  async function suggest() {
    const result = await ask<{ ideas: Idea[] }>("ideas")
    if (result) setIdeas(result.ideas)
  }

  async function write(f: AiFields = fields, brief = prompt) {
    const post = await ask<{ title: string; excerpt: string; body: string; tags: string[]; seoTitle: string; seoDescription: string }>(
      "write",
      { prompt: brief, fields: f },
    )
    if (!post) return
    // The body is the AI's; other fields keep what the user already wrote.
    onApply({
      title: f.title.trim() || post.title,
      body: post.body,
      excerpt: f.excerpt.trim() || post.excerpt,
      tags: f.tags.trim() || post.tags.join(", "),
      seoTitle: f.seoTitle.trim() || post.seoTitle,
      seoDescription: f.seoDescription.trim() || post.seoDescription,
    })
    setIdeas([])
    setPrompt("")
    setNote("Draft written. Read it through, then save or publish.")
  }

  async function revise(instruction: string) {
    const result = await ask<{ title: string; excerpt: string; body: string; summary: string }>("revise", { prompt: instruction })
    if (!result) return
    onApply({ title: result.title, excerpt: result.excerpt, body: result.body })
    setPrompt("")
    setNote(result.summary)
  }

  async function details() {
    const result = await ask<{ excerpt: string; tags: string[]; seoTitle: string; seoDescription: string }>("details")
    if (!result) return
    const next: Partial<AiFields> = {
      excerpt: result.excerpt,
      tags: result.tags.join(", "),
      seoTitle: result.seoTitle,
      seoDescription: result.seoDescription,
    }
    // Fill the empty ones; if all are filled, the user is asking for fresh ones.
    const empty = (Object.keys(next) as (keyof AiFields)[]).filter((k) => !fields[k].trim())
    onApply(empty.length ? Object.fromEntries(empty.map((k) => [k, next[k]])) : next)
    setNote(empty.length ? "Filled in the excerpt, tags and search fields." : "Refreshed the excerpt, tags and search fields.")
  }

  function pick(idea: Idea) {
    const f = { ...fields, title: idea.title }
    onApply({ title: idea.title })
    void write(f, idea.angle)
  }

  const working = busy !== null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" />
          Write with AI
        </CardTitle>
        <CardDescription>
          {hasBody
            ? "Tell the AI how to change the post, or pick a quick edit. You can undo any change."
            : "Pick an idea, or give a title or a few notes and let the AI write the first draft."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={working}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim()) {
              e.preventDefault()
              void (hasBody ? revise(prompt) : write())
            }
          }}
          placeholder={
            hasBody
              ? "How should it change? e.g. add a section on pricing, make it more persuasive"
              : "What should the post cover? e.g. 5 tips for first-time customers, our process explained"
          }
        />
        <div className="flex flex-wrap gap-2">
          {hasBody ? (
            <Button size="sm" disabled={working || !prompt.trim()} onClick={() => revise(prompt)}>
              {busy === "revise" ? <Spinner /> : <Wand2 />}
              Apply change
            </Button>
          ) : (
            <Button size="sm" disabled={working || (!prompt.trim() && !fields.title.trim())} onClick={() => write()}>
              {busy === "write" ? <Spinner /> : <Sparkles />}
              Write the post
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={working} onClick={suggest}>
            {busy === "ideas" ? <Spinner /> : <Lightbulb />}
            Suggest ideas
          </Button>
          <Button size="sm" variant="outline" disabled={working || (!hasBody && !fields.title.trim())} onClick={details}>
            {busy === "details" && <Spinner />}
            Fill excerpt, tags & SEO
          </Button>
          {hasBody && (
            <Button size="sm" variant="ghost" disabled={working} onClick={() => write(fields, prompt)}>
              {busy === "write" && <Spinner />}
              Rewrite from scratch
            </Button>
          )}
          {canUndo && (
            <Button size="sm" variant="ghost" disabled={working} onClick={onUndo}>
              <Undo2 />
              Undo
            </Button>
          )}
        </div>

        {hasBody && (
          <div className="flex flex-wrap gap-1.5">
            {REWRITES.map((r) => (
              <button
                key={r}
                type="button"
                disabled={working}
                onClick={() => revise(r)}
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {working && (
          <p className="text-xs text-muted-foreground">
            {busy === "write" ? "Writing the post… this takes about 20 seconds." : busy === "revise" ? "Rewriting…" : "Thinking…"}
          </p>
        )}
        {note && !working && <p className="text-xs text-muted-foreground">{note}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {ideas.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Pick one and the AI writes it</p>
            {ideas.map((idea) => (
              <button
                key={idea.title}
                type="button"
                disabled={working}
                onClick={() => pick(idea)}
                className="flex flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 disabled:opacity-50"
              >
                <span className="text-sm font-medium">{idea.title}</span>
                <span className="text-xs text-muted-foreground">{idea.angle}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

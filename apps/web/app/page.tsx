"use client"

import { useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { ArrowRight, Globe, Sparkles } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"

import { ProjectStatus } from "@/components/editor/project-status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

type Model = "haiku" | "sonnet" | "opus"
type Effort = "low" | "medium" | "high" | "xhigh" | "max"

const MODELS: { value: Model; label: string }[] = [
  { value: "haiku", label: "Haiku 5.5 · fastest" },
  { value: "sonnet", label: "Sonnet 5.5 · balanced" },
  { value: "opus", label: "Opus 5.5 · most capable" },
]

const EFFORTS: { value: Effort; label: string }[] = [
  { value: "low", label: "Low effort" },
  { value: "medium", label: "Medium effort" },
  { value: "high", label: "High effort" },
  { value: "xhigh", label: "Extra high effort" },
  { value: "max", label: "Max effort" },
]

const tokenFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })

function formatCost(usd: number) {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

export default function Dashboard() {
  const router = useRouter()
  const projects = useQuery(api.projects.list)
  const create = useMutation(api.projects.create)
  const [url, setUrl] = useState("")
  const [model, setModel] = useState<Model>("haiku")
  const [effort, setEffort] = useState<Effort>("medium")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!url.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const projectId = await create({ url: url.trim(), model, effort })
      router.push(`/projects/${projectId}`)
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "Something went wrong. Try again.")
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-12 px-4 py-12 sm:px-6">
      <header className="flex items-center gap-2 font-semibold">
        <Sparkles className="size-5" />
        Magicwebs
      </header>

      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Start from any website</h1>
        <p className="max-w-xl text-muted-foreground">
          Paste the URL of any public web page. We rebuild it as an editable page you can change with AI and publish
          on your own domain.
        </p>
        <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-2 sm:flex-row">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            inputMode="url"
            className="h-10 flex-1"
            aria-label="Page URL"
          />
          <Button type="submit" size="lg" className="h-10" disabled={submitting || !url.trim()}>
            {submitting ? <Spinner /> : <ArrowRight />}
            Build page
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Select items={MODELS} value={model} onValueChange={(value) => value && setModel(value)}>
            <SelectTrigger aria-label="AI model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select items={EFFORTS} value={effort} onValueChange={(value) => value && setEffort(value)}>
            <SelectTrigger aria-label="Effort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EFFORTS.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Your projects</h2>
        {projects === undefined ? (
          <Spinner />
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet. Paste a URL to get started.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <li key={project._id}>
                <Link
                  href={`/projects/${project._id}`}
                  className="flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate font-medium">{project.name}</span>
                    <ProjectStatus status={project.status} published={!!project.publishedVersionId} />
                  </div>
                  <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Globe className="size-3.5 shrink-0" />
                    {project.hostname}
                  </span>
                  {project.usage && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {tokenFormat.format(project.usage.inputTokens)} in · {tokenFormat.format(project.usage.outputTokens)}{" "}
                      out tokens
                      {project.usage.costUsd !== undefined && ` · ${formatCost(project.usage.costUsd)}`}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

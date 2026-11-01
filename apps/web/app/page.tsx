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
import { Spinner } from "@/components/ui/spinner"

export default function Dashboard() {
  const router = useRouter()
  const projects = useQuery(api.projects.list)
  const create = useMutation(api.projects.create)
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!url.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const projectId = await create({ url: url.trim() })
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
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Clone a landing page</h1>
        <p className="max-w-xl text-muted-foreground">
          Paste the URL of any public landing page. We rebuild it as an editable page you can change with AI and
          publish on your own domain.
        </p>
        <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-2 sm:flex-row">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            inputMode="url"
            className="h-10 flex-1"
            aria-label="Landing page URL"
          />
          <Button type="submit" size="lg" className="h-10" disabled={submitting || !url.trim()}>
            {submitting ? <Spinner /> : <ArrowRight />}
            Clone page
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Your projects</h2>
        {projects === undefined ? (
          <Spinner />
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet. Clone a page to get started.</p>
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
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

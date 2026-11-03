"use client"

import { useMutation } from "convex/react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"

import { ArrowRightIcon, PlusIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"

import { EFFORTS, errorText, MODELS, useProjectDefaults, type Effort, type Model } from "./lib"

const MODEL_ITEMS = MODELS.map((m) => ({ value: m.value, label: `${m.label} · ${m.hint}` }))

export function NewProjectForm({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter()
  const create = useMutation(api.projects.create)
  const [defaults] = useProjectDefaults()
  const [url, setUrl] = useState("")
  const [name, setName] = useState("")
  const [model, setModel] = useState<Model | null>(null)
  const [effort, setEffort] = useState<Effort | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!url.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const projectId = await create({
        url: url.trim(),
        name: name.trim() || undefined,
        model: model ?? defaults.model,
        effort: effort ?? defaults.effort,
      })
      router.push(`/projects/${projectId}`)
    } catch (err) {
      setError(errorText(err))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          inputMode="url"
          className="h-10 flex-1"
          aria-label="Page URL"
          autoFocus={autoFocus}
        />
        <Button type="submit" size="lg" className="h-10" disabled={submitting || !url.trim()}>
          {submitting ? <Spinner /> : <ArrowRightIcon />}
          Build page
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name (optional)"
          className="h-8 w-full sm:w-56"
          aria-label="Project name"
        />
        <Select items={MODEL_ITEMS} value={model ?? defaults.model} onValueChange={(v) => v && setModel(v)}>
          <SelectTrigger size="sm" aria-label="AI model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODEL_ITEMS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={EFFORTS} value={effort ?? defaults.effort} onValueChange={(v) => v && setEffort(v)}>
          <SelectTrigger size="sm" aria-label="Effort">
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
      <p className="text-xs text-muted-foreground">
        Pages up to 4 MB are copied exactly. Bigger pages are rebuilt by the model you pick.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}

export function NewProjectDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon />
        New project
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Paste the URL of any public page. It&apos;s rebuilt as an editable page you can publish on your own domain.
          </DialogDescription>
        </DialogHeader>
        <NewProjectForm autoFocus />
      </DialogContent>
    </Dialog>
  )
}

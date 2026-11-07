"use client"

import { useAction, useMutation } from "convex/react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import {
  getTemplate,
  MAX_SITE_PAGES,
  type TemplateId,
} from "@magicwebs/page-schema"

import { ArrowLeftIcon, ArrowRightIcon, PlusIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import {
  EFFORTS,
  errorText,
  MODELS,
  useProjectDefaults,
  type Effort,
  type Model,
} from "./lib"
import { PagePicker, type DiscoveredPage } from "./page-picker"
import { TemplatePicker } from "./template-picker"

const MODEL_ITEMS = MODELS.map((m) => ({
  value: m.value,
  label: `${m.label} · ${m.hint}`,
}))

type Mode = "copy" | "revamp"

const MODES: { value: Mode; label: string; hint: string }[] = [
  {
    value: "copy",
    label: "Keep my design",
    hint: "Looks just like your current site",
  },
  {
    value: "revamp",
    label: "Give it a new look",
    hint: "Your content in a fresh style",
  },
]

function ModeSwitch({
  value,
  onChange,
}: {
  value: Mode
  onChange: (mode: Mode) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="What to make"
      className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
    >
      {MODES.map((mode) => (
        <button
          key={mode.value}
          type="button"
          role="radio"
          aria-checked={value === mode.value}
          onClick={() => onChange(mode.value)}
          className={cn(
            "flex flex-col rounded-md px-3 py-1.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            value === mode.value
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="text-sm font-medium">{mode.label}</span>
          <span className="text-xs text-muted-foreground">{mode.hint}</span>
        </button>
      ))}
    </div>
  )
}

export function NewProjectForm({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter()
  const create = useMutation(api.projects.create)
  const discover = useAction(api.pages.discover)
  const [defaults] = useProjectDefaults()
  const [url, setUrl] = useState("")
  const [name, setName] = useState("")
  const [model, setModel] = useState<Model | null>(null)
  const [effort, setEffort] = useState<Effort | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Step two: the site's pages, with the ones to clone ticked (the home page always is).
  const [site, setSite] = useState<{
    url: string
    pages: DiscoveredPage[]
  } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [discoveryFailed, setDiscoveryFailed] = useState(false)
  const [mode, setMode] = useState<Mode>("copy")
  const [template, setTemplate] = useState<TemplateId | null>(null)
  const revamping = mode === "revamp"
  const verb = revamping ? "Redesign" : "Copy"

  async function build(pages: DiscoveredPage[], homeUrl: string) {
    if (revamping && !template) {
      setError("Choose a style first")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const projectId = await create({
        url: homeUrl,
        name: name.trim() || undefined,
        model: model ?? defaults.model,
        effort: effort ?? defaults.effort,
        template: revamping ? (template ?? undefined) : undefined,
        pages: pages.map((p) => ({ url: p.url, title: p.title })),
      })
      router.push(`/projects/${projectId}`)
    } catch (err) {
      setError(errorText(err))
      setSubmitting(false)
    }
  }

  async function onFindPages(event: React.FormEvent) {
    event.preventDefault()
    if (!url.trim()) return
    if (revamping && !template) {
      setError("Choose a style first")
      return
    }
    setSubmitting(true)
    setError(null)
    setDiscoveryFailed(false)
    try {
      const found = await discover({ url: url.trim() })
      setSite(found)
      setSelected(new Set())
    } catch (err) {
      setError(errorText(err))
      setDiscoveryFailed(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (site) {
    const home = site.pages[0]!
    const others = site.pages.slice(1).filter((p) => selected.has(p.path))
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Choose which pages of{" "}
          <span className="font-medium">{new URL(site.url).hostname}</span> to{" "}
          {revamping
            ? `redesign in the ${getTemplate(template ?? undefined)?.name} style`
            : "copy"}
          . Your home page is always included.
        </p>
        <PagePicker
          pages={site.pages}
          selected={selected}
          onChange={setSelected}
          locked={new Map([[home.path, "Home"]])}
          max={MAX_SITE_PAGES}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSite(null)}
            disabled={submitting}
          >
            <ArrowLeftIcon />
            Back
          </Button>
          <Button
            type="button"
            onClick={() => build(others, site.url)}
            disabled={submitting}
          >
            {submitting ? <Spinner /> : <ArrowRightIcon />}
            {verb}{" "}
            {others.length + 1 === 1 ? "1 page" : `${others.length + 1} pages`}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={onFindPages} className="flex flex-col gap-3">
      <ModeSwitch
        value={mode}
        onChange={(next) => {
          setMode(next)
          setError(null)
        }}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="yourbusiness.com"
          inputMode="url"
          className="h-10 flex-1"
          aria-label="Website address"
          autoFocus={autoFocus}
        />
        <Button
          type="submit"
          size="lg"
          className="h-10"
          disabled={submitting || !url.trim()}
        >
          {submitting ? <Spinner /> : <ArrowRightIcon />}
          {submitting ? "Looking…" : "Continue"}
        </Button>
      </div>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name your project (optional)"
        className="h-8 w-full sm:w-64"
        aria-label="Project name"
      />
      {revamping && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Choose a style</p>
          <TemplatePicker
            value={template}
            onChange={(next) => {
              setTemplate(next)
              setError(null)
            }}
          />
        </div>
      )}
      <details className="group text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground select-none hover:text-foreground">
          AI settings
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <Select
            items={MODEL_ITEMS}
            value={model ?? defaults.model}
            onValueChange={(v) => v && setModel(v)}
          >
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
          <Select
            items={EFFORTS}
            value={effort ?? defaults.effort}
            onValueChange={(v) => v && setEffort(v)}
          >
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
      </details>
      <p className="text-xs text-muted-foreground">
        {revamping
          ? "We keep your words, photos and links. You can change the style any time."
          : "You can edit every page once it's ready."}
      </p>
      {error && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          {error}
          {discoveryFailed && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => build([], url.trim())}
              disabled={submitting}
            >
              Use just this page
            </Button>
          )}
        </div>
      )}
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
            Enter your website&apos;s address and we&apos;ll turn it into a site
            you can edit and publish on your own domain.
          </DialogDescription>
        </DialogHeader>
        <NewProjectForm autoFocus />
      </DialogContent>
    </Dialog>
  )
}

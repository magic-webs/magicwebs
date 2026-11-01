"use client"

import { useMutation, useQuery } from "convex/react"
import { ArrowLeft, ExternalLink, Monitor, RotateCw, Smartphone, Tablet } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import { ChatPanel } from "./chat-panel"
import { DomainsDialog } from "./domains-dialog"
import { Inspector } from "./inspector"
import { PreviewFrame, type Device } from "./preview-frame"
import { ProjectStatus } from "./project-status"
import { SectionsPanel } from "./sections-panel"
import { ThemePanel } from "./theme-panel"
import { useApplyOps } from "./use-apply-ops"
import { VersionsDialog } from "./versions-dialog"

const DEVICES: { id: Device; icon: typeof Monitor; label: string }[] = [
  { id: "desktop", icon: Monitor, label: "Desktop" },
  { id: "tablet", icon: Tablet, label: "Tablet" },
  { id: "mobile", icon: Smartphone, label: "Mobile" },
]

export function Editor({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, { projectId })
  const draft = useQuery(api.drafts.get, { projectId })
  const publish = useMutation(api.versions.publish)
  const reclone = useMutation(api.projects.reclone)
  const { apply, error, clearError } = useApplyOps(projectId)

  const [device, setDevice] = useState<Device>("desktop")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  if (project === undefined || draft === undefined) {
    return (
      <div className="grid h-svh place-items-center">
        <Spinner />
      </div>
    )
  }
  if (project === null || draft === null) {
    return (
      <div className="grid h-svh place-items-center text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          Project not found.
          <Link href="/" className="underline">
            Back to projects
          </Link>
        </div>
      </div>
    )
  }

  const doc = draft.doc
  const selected = doc.sections.find((s) => s.id === selectedId) ?? null
  const isEmpty = doc.sections.length === 0

  async function onPublish() {
    setPublishing(true)
    try {
      await publish({ projectId })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
        <Button size="icon-sm" variant="ghost" render={<Link href="/" />} aria-label="Back to projects">
          <ArrowLeft />
        </Button>
        <span className="truncate text-sm font-medium">{project.name}</span>
        <ProjectStatus status={project.status} published={!!project.publishedVersionId} />

        <div className="mx-auto hidden items-center gap-1 rounded-lg border p-0.5 md:flex">
          {DEVICES.map(({ id, icon: Icon, label }) => (
            <Button
              key={id}
              size="icon-xs"
              variant={device === id ? "secondary" : "ghost"}
              onClick={() => setDevice(id)}
              aria-label={label}
              aria-pressed={device === id}
            >
              <Icon />
            </Button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <DomainsDialog projectId={projectId} />
          <VersionsDialog projectId={projectId} publishedVersionId={project.publishedVersionId} />
          {project.publishedVersionId && (
            <Button
              size="sm"
              variant="ghost"
              render={<a href={`https://${project.hostname}`} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink />
              <span className="hidden lg:inline">View live</span>
            </Button>
          )}
          <Button size="sm" onClick={onPublish} disabled={publishing || isEmpty || project.status === "cloning"}>
            {publishing && <Spinner />}
            Publish
          </Button>
        </div>
      </header>

      {error && (
        <button
          type="button"
          onClick={clearError}
          className="border-b bg-destructive/10 px-4 py-2 text-left text-sm text-destructive"
        >
          {error}
        </button>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col border-r xl:w-96">
          <Tabs defaultValue="ai" className="flex min-h-0 flex-1 flex-col gap-0">
            <TabsList className="m-2 w-auto">
              <TabsTrigger value="ai">AI</TabsTrigger>
              <TabsTrigger value="sections">Sections</TabsTrigger>
              <TabsTrigger value="theme">Theme</TabsTrigger>
            </TabsList>
            <TabsContent value="ai" className="min-h-0 flex-1">
              <ChatPanel projectId={projectId} selectedId={selectedId} />
            </TabsContent>
            <TabsContent value="sections" className="min-h-0 flex-1">
              <SectionsPanel doc={doc} selectedId={selectedId} onSelect={setSelectedId} apply={apply} />
            </TabsContent>
            <TabsContent value="theme" className="min-h-0 flex-1">
              <ThemePanel doc={doc} apply={apply} />
            </TabsContent>
          </Tabs>
        </aside>

        <main className="relative min-w-0 flex-1">
          {project.status !== "ready" && isEmpty ? (
            <div className="grid h-full place-items-center p-6 text-center">
              {project.status === "cloning" ? (
                <div className="flex flex-col items-center gap-3">
                  <Spinner className="size-6" />
                  <p className="font-medium">Cloning {new URL(project.sourceUrl).hostname}</p>
                  <p className="text-sm text-muted-foreground">{project.step ?? "Working"}…</p>
                </div>
              ) : (
                <div className="flex max-w-sm flex-col items-center gap-3">
                  <p className="font-medium">Cloning failed</p>
                  <p className="text-sm text-muted-foreground">{project.error}</p>
                  <Button variant="outline" onClick={() => reclone({ projectId })}>
                    <RotateCw />
                    Try again
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <PreviewFrame doc={doc} device={device} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </main>

        <aside className={cn("w-80 shrink-0 border-l", !selected && "hidden")}>
          {selected && <Inspector section={selected} apply={apply} onClose={() => setSelectedId(null)} />}
        </aside>
      </div>
    </div>
  )
}

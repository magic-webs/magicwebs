"use client"

import { useMutation } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import { getTemplate, type TemplateId } from "@magicwebs/page-schema"

import {
  AlertTriangleIcon,
  CopyIcon,
  DeleteIcon,
  EditIcon,
  ExternalLinkIcon,
  GlobeIcon,
  MoreIcon,
  RefreshIcon,
  RenameIcon,
  SparkleIcon,
} from "@/components/icons"
import { ProjectStatus } from "@/components/editor/project-status"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { errorText, formatCost, modelLabel, type Project } from "./lib"
import { TemplatePicker } from "./template-picker"

export function ProjectActions({ project, className }: { project: Project; className?: string }) {
  const rename = useMutation(api.projects.rename)
  const reclone = useMutation(api.projects.reclone)
  const remove = useMutation(api.projects.remove)
  const revamp = useMutation(api.projects.revamp)
  const [dialog, setDialog] = useState<"rename" | "reclone" | "revamp" | "delete" | null>(null)
  // A retired template resolves to the one that replaced it.
  const current = getTemplate(project.template)
  const [template, setTemplate] = useState<TemplateId | null>(current?.id ?? null)
  const [name, setName] = useState(project.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const liveUrl = `https://${project.hostname}`

  function open(next: typeof dialog) {
    setError(null)
    setName(project.name)
    setDialog(next)
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setDialog(null)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button size="icon-sm" variant="ghost" className={className} aria-label={`Actions for ${project.name}`} />}
        >
          <MoreIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem render={<Link href={`/projects/${project._id}`} />}>
            <EditIcon />
            Open editor
          </DropdownMenuItem>
          {project.publishedVersionId && (
            <>
              <DropdownMenuItem render={<a href={liveUrl} target="_blank" rel="noreferrer" />}>
                <ExternalLinkIcon />
                View live
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(liveUrl)}>
                <CopyIcon />
                Copy live URL
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => open("rename")}>
            <RenameIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => open("reclone")} disabled={project.status === "cloning"}>
            <RefreshIcon />
            {current ? "Revamp again" : "Clone again"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => open("revamp")} disabled={project.status === "cloning"}>
            <SparkleIcon />
            {current ? "Change template…" : "Revamp…"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => open("delete")}>
            <DeleteIcon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "rename"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <form
            id={`rename-${project._id}`}
            onSubmit={(e) => {
              e.preventDefault()
              run(() => rename({ projectId: project._id, name }))
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" autoFocus />
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" form={`rename-${project._id}`} disabled={busy || !name.trim()}>
              {busy && <Spinner />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dialog === "reclone"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {current ? "Revamp" : "Clone"} {project.name} again?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {current
                ? `Every page of ${project.sourceUrl} is redesigned again in the ${current.name} template`
                : `The page at ${project.sourceUrl} is copied again`}{" "}
              and replaces the current draft. Published versions stay as they are, and you can load any of them back
              from the editor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => run(() => reclone({ projectId: project._id }))}>
              {busy && <Spinner />}
              {current ? "Revamp again" : "Clone again"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialog === "revamp"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Revamp {project.name}</DialogTitle>
            <DialogDescription>
              Every page is redesigned from the original site&apos;s content in the template you pick, using{" "}
              {modelLabel(project.model)}. It replaces the current drafts; published versions stay in the history.
            </DialogDescription>
          </DialogHeader>
          <TemplatePicker value={template} onChange={setTemplate} disabled={busy} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            {current && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => run(() => revamp({ projectId: project._id, template: null }))}
              >
                Copy exactly instead
              </Button>
            )}
            <Button
              disabled={busy || !template}
              onClick={() => template && run(() => revamp({ projectId: project._id, template }))}
            >
              {busy ? <Spinner /> : <SparkleIcon />}
              Revamp in {getTemplate(template ?? undefined)?.name ?? "template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the draft, every version and its domains, and takes {project.hostname} offline. It can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => run(() => remove({ projectId: project._id }))}
            >
              {busy && <Spinner />}
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function ProjectCard({ project }: { project: Project }) {
  const updated = project.publishedAt ?? project.createdAt

  return (
    <div className="group relative flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold uppercase">
          {project.name.slice(0, 1)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            href={`/projects/${project._id}`}
            className="truncate font-medium after:absolute after:inset-0 after:rounded-xl"
          >
            {project.name}
          </Link>
          <span className="truncate text-xs text-muted-foreground">
            {project.sourceUrl.replace(/^https?:\/\//, "")}
            {project.template && ` · ${getTemplate(project.template)?.name} revamp`}
          </span>
        </div>
        <ProjectStatus status={project.status} published={!!project.publishedVersionId} />
        <ProjectActions project={project} className="relative z-10 -mr-1 -mt-1" />
      </div>

      {project.status === "cloning" && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          {project.step ?? "Working…"}
        </p>
      )}
      {project.status === "failed" && project.error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangleIcon solid className="mt-px size-3.5 shrink-0" />
          <span className="line-clamp-2">{project.error}</span>
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className={cn("flex min-w-0 items-center gap-1.5", project.publishedVersionId && "text-foreground")}>
          <GlobeIcon className="size-3.5 shrink-0" />
          <span className="truncate">{project.hostname}</span>
        </span>
        <span className="ml-auto tabular-nums">
          {modelLabel(project.model)}
          {project.usage?.costUsd !== undefined && ` · ${formatCost(project.usage.costUsd)}`}
          {" · "}
          {formatDistanceToNow(updated, { addSuffix: true })}
        </span>
      </div>
    </div>
  )
}

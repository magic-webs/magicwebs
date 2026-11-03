"use client"

import { useAction, useMutation } from "convex/react"
import { Check, ChevronDown, FileText, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"
import { MAX_SITE_PAGES, pagePath } from "@magicwebs/page-schema"

import { errorText } from "@/components/dashboard/lib"
import { PagePicker, type DiscoveredPage } from "@/components/dashboard/page-picker"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export type SitePage = {
  path: string
  title: string
  sourceUrl: string
  status: "cloning" | "ready" | "failed"
  step?: string
  error?: string
}

function StatusDot({ status }: { status: SitePage["status"] }) {
  if (status === "cloning") return <Spinner className="size-3 text-muted-foreground" />
  return <span className={cn("size-2 rounded-full", status === "failed" ? "bg-destructive" : "bg-emerald-500")} />
}

/** The editor's page menu: switch between the site's pages, add pages from the original site, remove one. */
export function PageSwitcher({
  projectId,
  sourceUrl,
  pages,
  path,
  onChange,
}: {
  projectId: Id<"projects">
  sourceUrl: string
  pages: SitePage[]
  path: string
  onChange: (path: string) => void
}) {
  const removePage = useMutation(api.pages.remove)
  const discover = useAction(api.pages.discover)
  const [adding, setAdding] = useState(false)
  // The original site's pages, found when "Add pages" is first opened.
  const [found, setFound] = useState<DiscoveredPage[] | null>(null)
  const [finding, setFinding] = useState(false)
  const [findError, setFindError] = useState<string | null>(null)

  async function findPages() {
    setFinding(true)
    setFindError(null)
    try {
      setFound((await discover({ url: sourceUrl })).pages)
    } catch (err) {
      setFindError(errorText(err))
    } finally {
      setFinding(false)
    }
  }

  function openAdd() {
    setAdding(true)
    if (!found && !finding) void findPages()
  }
  const current = pages.find((p) => p.path === path)

  async function onRemove() {
    if (!current || current.path === "/") return
    if (!window.confirm(`Remove the page "${current.title}" (${current.path}) from this site?`)) return
    onChange("/")
    await removePage({ projectId, path: current.path })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="max-w-56" />}>
          <FileText />
          <span className="truncate">{current?.title ?? "Home"}</span>
          {pages.length > 1 && <span className="text-muted-foreground">{pages.length}</span>}
          <ChevronDown className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              Pages · {pages.length} of {MAX_SITE_PAGES}
            </DropdownMenuLabel>
            {pages.map((page) => (
              <DropdownMenuItem key={page.path} onClick={() => onChange(page.path)}>
                <StatusDot status={page.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{page.title}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{page.path}</span>
                </span>
                {page.path === path && <Check />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={openAdd} disabled={pages.length >= MAX_SITE_PAGES}>
              <Plus />
              Add pages from the original site
            </DropdownMenuItem>
            {current && current.path !== "/" && (
              <DropdownMenuItem variant="destructive" onClick={onRemove}>
                <Trash2 />
                Remove this page
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddPagesDialog
        open={adding}
        onOpenChange={setAdding}
        projectId={projectId}
        sourceUrl={sourceUrl}
        pages={pages}
        found={found}
        finding={finding}
        findError={findError}
        onRetry={findPages}
        onAdded={(first) => first && onChange(first)}
      />
    </>
  )
}

function AddPagesDialog({
  open,
  onOpenChange,
  projectId,
  sourceUrl,
  pages,
  found,
  finding,
  findError,
  onRetry,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: Id<"projects">
  sourceUrl: string
  pages: SitePage[]
  found: DiscoveredPage[] | null
  finding: boolean
  findError: string | null
  onRetry: () => void
  onAdded: (firstPath: string | undefined) => void
}) {
  const addPages = useMutation(api.pages.add)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pages already in the site, matched by their original address.
  const locked = new Map<string, string>()
  for (const page of pages) {
    try {
      locked.set(pagePath(page.sourceUrl), page.path === "/" ? "Home" : "In site")
    } catch {
      // A page without a valid source can't be matched.
    }
  }

  async function onAdd() {
    if (!found) return
    const chosen = found.filter((p) => selected.has(p.path) && !locked.has(p.path))
    if (!chosen.length) return
    setBusy(true)
    setError(null)
    try {
      const { added } = await addPages({ projectId, pages: chosen.map((p) => ({ url: p.url, title: p.title })) })
      onOpenChange(false)
      setSelected(new Set())
      onAdded(added[0])
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const count = found ? found.filter((p) => selected.has(p.path) && !locked.has(p.path)).length : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add pages</DialogTitle>
          <DialogDescription>
            Pick more pages of {new URL(sourceUrl).hostname} to clone into this site. They keep their paths, and links
            between cloned pages point at your copy.
          </DialogDescription>
        </DialogHeader>
        {found ? (
          <PagePicker pages={found} selected={selected} onChange={setSelected} locked={locked} max={MAX_SITE_PAGES} />
        ) : (
          <div className="grid h-32 place-items-center text-sm text-muted-foreground">
            {finding ? (
              <span className="flex items-center gap-2">
                <Spinner /> Finding pages…
              </span>
            ) : (
              <Button variant="outline" onClick={onRetry}>
                Find pages
              </Button>
            )}
          </div>
        )}
        {(error ?? findError) && <p className="text-sm text-destructive">{error ?? findError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onAdd} disabled={busy || count === 0}>
            {busy ? <Spinner /> : <Plus />}
            Clone {count === 1 ? "1 page" : `${count} pages`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

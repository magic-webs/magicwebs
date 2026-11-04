"use client"

import { useConvex } from "convex/react"
import { Download } from "lucide-react"
import { useEffect, useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"
import { buildNextProject, type ExportPage } from "@magicwebs/site-export"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/**
 * Download the site as a Next.js project. Built in the browser from the
 * current drafts of every ready page, so it includes unpublished edits.
 */
export function ExportButton({ projectId, name, slug }: { projectId: Id<"projects">; name: string; slug: string }) {
  const convex = useConvex()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  async function onExport() {
    setBusy(true)
    setNotice(null)
    try {
      const [{ zipSync, strToU8 }, pages] = await Promise.all([import("fflate"), convex.query(api.pages.list, { projectId })])
      const exported: ExportPage[] = []
      for (const page of pages.filter((p) => p.status === "ready")) {
        const draft = await convex.query(api.drafts.get, { projectId, path: page.path })
        if (draft && draft.doc.sections.length) {
          exported.push({ path: page.path, title: page.title, sourceUrl: page.sourceUrl, doc: draft.doc })
        }
      }
      if (!exported.length) throw new Error("No pages are ready to export yet")

      const files = buildNextProject({ name, pages: exported })
      const zip = zipSync(
        Object.fromEntries(Object.entries(files).map(([path, text]) => [`${slug}/${path}`, strToU8(text)])),
        { level: 6 },
      )
      const url = URL.createObjectURL(new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }))
      Object.assign(document.createElement("a"), { href: url, download: `${slug}-nextjs.zip` }).click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      const skipped = pages.length - exported.length
      if (skipped) setNotice({ text: `${skipped} unfinished ${skipped === 1 ? "page" : "pages"} left out` })
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Export failed", error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {notice && (
        <span role="status" className={cn("hidden text-xs sm:inline", notice.error ? "text-destructive" : "text-muted-foreground")}>
          {notice.text}
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={onExport} disabled={busy} title="Download this site as a Next.js project">
        {busy ? <Spinner /> : <Download />}
        <span className="hidden lg:inline">Export</span>
      </Button>
    </>
  )
}

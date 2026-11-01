"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import type { PageDoc } from "@magicwebs/page-schema"
import { fontHref, pageCss, PageRenderer } from "@magicwebs/renderer"

export type Device = "desktop" | "tablet" | "mobile"

const WIDTHS: Record<Device, string> = { desktop: "100%", tablet: "820px", mobile: "390px" }

const EDITOR_CSS = `
html,body{margin:0}
[data-section-id]{cursor:pointer}
[data-section-id]:hover{outline:2px dashed #6366f1;outline-offset:-2px}
`

/**
 * Renders the draft inside an iframe so the page's CSS is isolated from the
 * editor and its media queries respond to the chosen device width. React
 * renders straight into the frame through a portal, so every Convex update
 * shows up without reloading anything.
 */
export function PreviewFrame({
  doc,
  device,
  selectedId,
  onSelect,
}: {
  doc: PageDoc
  device: Device
  selectedId: string | null
  onSelect: (sectionId: string | null) => void
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [body, setBody] = useState<HTMLElement | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const setup = () => {
      const frameDoc = frame.contentDocument
      if (!frameDoc) return
      frameDoc.addEventListener("click", (event) => {
        const target = event.target as Element
        if (target.closest("a,button,summary")) event.preventDefault()
        const section = target.closest("[data-section-id]")
        onSelectRef.current(section?.getAttribute("data-section-id") ?? null)
      })
      setBody(frameDoc.body)
    }
    // Wait for the srcDoc load: the initial about:blank document also reports
    // readyState "complete" but is replaced moments later.
    frame.addEventListener("load", setup, { once: true })
    return () => frame.removeEventListener("load", setup)
  }, [])

  const fonts = fontHref(doc.theme)
  const selectedCss = selectedId
    ? `[data-section-id="${CSS.escape(selectedId)}"]{outline:2px solid #6366f1!important;outline-offset:-2px}`
    : ""

  useEffect(() => {
    if (!body || !selectedId) return
    body.ownerDocument
      .querySelector(`[data-section-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [body, selectedId])

  return (
    <div className="flex h-full justify-center overflow-hidden bg-muted/40 p-3">
      <iframe
        ref={frameRef}
        title="Page preview"
        srcDoc="<!doctype html><html><head></head><body></body></html>"
        className="h-full rounded-lg border bg-white shadow-sm transition-[width] duration-300"
        style={{ width: WIDTHS[device], maxWidth: "100%" }}
      />
      {body &&
        createPortal(
          <>
            {fonts && <link rel="stylesheet" href={fonts} />}
            <style>{pageCss(doc.theme) + EDITOR_CSS + selectedCss}</style>
            <PageRenderer doc={doc} />
          </>,
          body,
        )}
    </div>
  )
}

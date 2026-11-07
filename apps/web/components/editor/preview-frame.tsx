"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import type { PageDoc } from "@magicwebs/page-schema"
import { documentCss, fontHref, PageRenderer, rootAttributes, syncMediaClasses, type BlogCard } from "@magicwebs/renderer"

export type Device = "desktop" | "tablet" | "mobile"

const WIDTHS: Record<Device, string> = { desktop: "100%", tablet: "820px", mobile: "390px" }

// Html sections are `display: contents`, so they have no box of their own;
// their visible children carry the outline instead.
const EDITOR_CSS = `
[data-section-id]{cursor:pointer}
[data-section-id]:not(.mw-html):hover,.mw-html[data-section-id]:hover>:not([data-mw-off]){outline:2px dashed #6366f1;outline-offset:-2px}
`

function boxOf(el: Element | null): Element | null {
  if (!el?.classList.contains("mw-html")) return el
  return [...el.children].find((c) => !c.hasAttribute("data-mw-off") && c.getBoundingClientRect().height > 0) ?? null
}

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
  posts = [],
}: {
  doc: PageDoc
  device: Device
  selectedId: string | null
  onSelect: (sectionId: string | null) => void
  /** The site's live blog posts, for a "Latest posts" section. */
  posts?: BlogCard[]
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
    ? `[data-section-id="${CSS.escape(selectedId)}"]:not(.mw-html),.mw-html[data-section-id="${CSS.escape(selectedId)}"]>:not([data-mw-off]){outline:2px solid #6366f1!important;outline-offset:-2px}`
    : ""

  // Exact clones expect the original classes and data attributes on <html>
  // and <body>, and switch some classes by width (the runtime does that on
  // published pages).
  const styles = doc.styles
  useEffect(() => {
    if (!body) return
    const root = body.ownerDocument.documentElement
    const apply = (el: HTMLElement, className: string | undefined, attributes: Record<string, string>) => {
      el.className = className ?? ""
      for (const a of [...el.attributes]) if (a.name.startsWith("data-")) el.removeAttribute(a.name)
      for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value)
    }
    apply(root, styles?.htmlClass, rootAttributes(doc, "html"))
    apply(body, styles?.bodyClass, rootAttributes(doc, "body"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, styles?.htmlClass, styles?.bodyClass, JSON.stringify(styles?.htmlAttributes), JSON.stringify(styles?.bodyAttributes)])

  useEffect(() => {
    if (!body) return
    const frameWindow = body.ownerDocument.defaultView
    const sync = () => syncMediaClasses(body.ownerDocument)
    sync()
    frameWindow?.addEventListener("resize", sync)
    return () => frameWindow?.removeEventListener("resize", sync)
  }, [body, doc, device])

  useEffect(() => {
    if (!body || !selectedId) return
    boxOf(body.ownerDocument.querySelector(`[data-section-id="${CSS.escape(selectedId)}"]`))?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    })
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
            <style>{documentCss(doc) + EDITOR_CSS + selectedCss}</style>
            <PageRenderer doc={doc} posts={{ posts, preview: true }} />
          </>,
          body,
        )}
    </div>
  )
}

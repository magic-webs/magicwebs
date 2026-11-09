"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import {
  applyTemplate,
  DESIGN_TEMPLATES,
  type DesignTemplate,
  type PageDoc,
  type TemplateId,
} from "@magicwebs/page-schema"
import { documentCss, fontHref, PageRenderer } from "@magicwebs/renderer"

import { cn } from "@/lib/utils"

/** Width the sample page is laid out at before it is scaled down into the card. */
const PREVIEW_WIDTH = 1280
const PREVIEW_HEIGHT = 800

/** A stand-in product shot from this app (srcdoc frames resolve "/" against the app's origin). */
const PHOTO = "/template-preview.jpg"

const SAMPLE: PageDoc = {
  schemaVersion: 1,
  meta: { title: "Preview", description: "" },
  theme: DESIGN_TEMPLATES[0]!.theme,
  sections: [
    {
      id: "nav",
      type: "navbar",
      props: {
        brand: "Northwind",
        links: [
          { label: "Product", href: "#" },
          { label: "Pricing", href: "#" },
          { label: "About", href: "#" },
        ],
        cta: { label: "Get started", href: "#" },
      },
    },
    {
      id: "hero",
      type: "hero",
      props: {
        layout: "centered",
        eyebrow: "New for 2026",
        heading: "Build **better** sites",
        subheading:
          "Everything your business needs to grow online, in one place.",
        primaryCta: { label: "Get started", href: "#" },
        secondaryCta: { label: "Learn more", href: "#" },
        image: { src: PHOTO, alt: "" },
      },
    },
    {
      id: "features",
      type: "features",
      props: {
        heading: "Why teams choose us",
        columns: 3,
        variant: "cards",
        items: [
          { icon: "zap", title: "Fast", body: "Live in minutes, not weeks." },
          {
            icon: "shield-check",
            title: "Secure",
            body: "Protected from day one.",
          },
          {
            icon: "users",
            title: "Supported",
            body: "Real people, ready to help.",
          },
        ],
      },
    },
  ],
}

/** A complete HTML page of the sample in a template, for an iframe. */
function previewHtml(template: DesignTemplate): string {
  const doc = applyTemplate(SAMPLE, template)
  const hero = doc.sections[1]
  if (hero?.type === "hero") hero.props.layout = template.layout.hero
  // Show the opening of each section only, with no entrance animations.
  for (const section of doc.sections) {
    section.animation = "none"
    if (section.style?.paddingY)
      section.style.paddingY = Math.min(section.style.paddingY, 72)
  }
  const fonts = fontHref(doc.theme)
  return `<!doctype html><html><head><meta charset="utf-8">${fonts ? `<link rel="stylesheet" href="${fonts}">` : ""}<style>${documentCss(doc)}html,body{margin:0;overflow:hidden}</style></head><body>${renderToStaticMarkup(<PageRenderer doc={doc} />)}</body></html>`
}

function TemplatePreview({ template }: { template: DesignTemplate }) {
  const html = useMemo(() => previewHtml(template), [template])
  const [scale, setScale] = useState(0.2)
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const observer = new ResizeObserver(
      ([entry]) => entry && setScale(entry.contentRect.width / PREVIEW_WIDTH)
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={frame}
      aria-hidden="true"
      className="relative aspect-16/10 w-full shrink-0 overflow-hidden bg-muted"
    >
      <iframe
        title=""
        srcDoc={html}
        sandbox=""
        loading="lazy"
        tabIndex={-1}
        className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
        style={{
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  )
}

export function TemplatePicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: TemplateId | null
  onChange: (template: TemplateId) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Style"
      className={cn("grid max-h-[55vh] auto-rows-max grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2", className)}
    >
      {DESIGN_TEMPLATES.map((template) => {
        const selected = value === template.id
        return (
          <button
            key={template.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(template.id)}
            className={cn(
              "group flex flex-col overflow-hidden rounded-lg border text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
              selected
                ? "border-primary ring-2 ring-primary/30"
                : "hover:border-foreground/30"
            )}
          >
            <TemplatePreview template={template} />
            <span className="flex flex-col gap-0.5 border-t px-3 py-2">
              <span className="text-sm font-medium">{template.name}</span>
              <span className="text-xs text-muted-foreground">
                {template.description}
              </span>
              <span className="text-xs text-muted-foreground/80">
                Great for {template.bestFor}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

"use client"

import type { CSSProperties } from "react"

import { DESIGN_TEMPLATES, type DesignTemplate, type TemplateId } from "@magicwebs/page-schema"
import { fontHref } from "@magicwebs/renderer"

import { cn } from "@/lib/utils"

/** Every template font in one stylesheet, so the previews show the real type. */
const FONTS_HREF = fontHref({
  ...DESIGN_TEMPLATES[0]!.theme,
  fonts: {
    heading: "",
    body: "",
    googleFonts: [...new Set(DESIGN_TEMPLATES.flatMap((t) => t.theme.fonts.googleFonts))],
  },
})

/** A thumbnail of a page in the template: nav, hero heading, buttons and two cards. */
function TemplatePreview({ template }: { template: DesignTemplate }) {
  const { colors, fonts, radius } = template.theme
  const id = template.id
  const heading: CSSProperties = {
    fontFamily: `"${fonts.heading}", system-ui, sans-serif`,
    fontWeight: id === "editorial" ? 500 : 800,
    fontStyle: "normal",
    letterSpacing: "-0.03em",
    lineHeight: 1.05,
  }
  const outline = id === "playful" ? `1.5px solid ${colors.border}` : undefined
  const shadow = id === "playful" ? `2px 2px 0 ${colors.border}` : id === "midnight" ? `0 4px 14px -4px ${colors.primary}` : undefined
  const btnRadius = id === "playful" ? 999 : Math.min(radius, 8)
  const card: CSSProperties = {
    flex: 1,
    height: 26,
    borderRadius: Math.min(radius, 8),
    background: id === "editorial" ? "transparent" : id === "midnight" ? "rgba(255,255,255,.05)" : colors.background,
    border: id === "editorial" ? undefined : outline ?? `1px solid ${colors.border}`,
    borderTop: id === "editorial" ? `1px solid ${colors.foreground}` : undefined,
    boxShadow: id === "playful" ? `3px 3px 0 ${colors.border}` : undefined,
  }
  return (
    <div
      aria-hidden="true"
      className="flex aspect-[16/10] flex-col overflow-hidden"
      style={{
        background:
          id === "midnight"
            ? `radial-gradient(80% 70% at 50% 0%, ${colors.primary}55, transparent 70%), ${colors.background}`
            : colors.background,
        color: colors.foreground,
        fontFamily: `"${fonts.body}", system-ui, sans-serif`,
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: id === "playful" ? outline : `1px solid ${colors.border}` }}
      >
        <span style={{ ...heading, fontSize: 9 }}>Brand</span>
        <span className="flex gap-1.5" style={{ fontSize: 6, color: colors.mutedForeground }}>
          <span>Product</span>
          <span>Pricing</span>
          <span>About</span>
        </span>
      </div>
      <div
        className={cn("flex flex-1 gap-2 px-3 py-2", template.layout.hero === "centered" ? "flex-col items-center text-center" : "items-center")}
      >
        <div className={cn("flex flex-col gap-1", template.layout.hero === "centered" ? "items-center" : "flex-1")}>
          <span style={{ ...heading, fontSize: 13 }}>
            Build{" "}
            <span
              style={{
                color: id === "playful" ? undefined : colors.highlight,
                fontStyle: id === "editorial" ? "italic" : undefined,
                background: id === "playful" ? `linear-gradient(transparent 60%, ${colors.highlight}66 0)` : undefined,
              }}
            >
              better
            </span>{" "}
            sites
          </span>
          <span className="flex gap-1">
            <span
              style={{
                fontSize: 6,
                padding: "2px 6px",
                borderRadius: btnRadius,
                background: colors.primary,
                color: colors.primaryForeground,
                border: outline,
                boxShadow: shadow,
                textTransform: id === "editorial" ? "uppercase" : undefined,
                letterSpacing: id === "editorial" ? ".1em" : undefined,
              }}
            >
              Get started
            </span>
            <span style={{ fontSize: 6, padding: "2px 6px", borderRadius: btnRadius, border: outline ?? `1px solid ${colors.border}` }}>
              Learn more
            </span>
          </span>
        </div>
        {template.layout.hero !== "centered" && (
          <div
            className="h-full flex-1"
            style={{
              borderRadius: Math.min(radius, 8),
              background: `linear-gradient(135deg, ${colors.muted}, ${colors.accent}55)`,
              border: outline,
              boxShadow: id === "playful" ? `3px 3px 0 ${colors.border}` : undefined,
            }}
          />
        )}
      </div>
      <div className="flex gap-1.5 px-3 pb-2.5">
        <div style={card} />
        <div style={card} />
        <div style={card} />
      </div>
    </div>
  )
}

export function TemplatePicker({
  value,
  onChange,
  disabled,
}: {
  value: TemplateId | null
  onChange: (template: TemplateId) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="Design template" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {FONTS_HREF && <link rel="stylesheet" href={FONTS_HREF} precedence="default" />}
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
              selected ? "border-primary ring-2 ring-primary/30" : "hover:border-foreground/30",
            )}
          >
            <TemplatePreview template={template} />
            <span className="flex flex-col gap-0.5 border-t px-3 py-2">
              <span className="text-sm font-medium">{template.name}</span>
              <span className="text-xs text-muted-foreground">{template.description}</span>
              <span className="text-xs text-muted-foreground/80">Best for: {template.bestFor}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

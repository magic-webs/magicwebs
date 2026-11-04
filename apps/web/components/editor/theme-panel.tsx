"use client"

import { DESIGN_TEMPLATES, type Op, type PageDoc } from "@magicwebs/page-schema"

import { cn } from "@/lib/utils"

import { ValueField } from "./fields"

/** Switch the page's design template. Only typed sections change, so exact copies don't offer it. */
function TemplateSwitcher({ doc, apply }: { doc: PageDoc; apply: (...ops: Op[]) => Promise<void> }) {
  if (doc.styles || !doc.sections.some((s) => s.type !== "html" && s.type !== "custom")) return null
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Template</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {DESIGN_TEMPLATES.map((t) => {
          const active = doc.theme.template === t.id
          const c = t.theme.colors
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              title={t.description}
              onClick={() => !active && void apply({ op: "apply_template", template: t.id })}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted",
              )}
            >
              <span className="flex shrink-0 -space-x-1" aria-hidden="true">
                {[c.background, c.primary, c.accent].map((color, i) => (
                  <span key={i} className="size-3 rounded-full border border-black/10" style={{ background: color }} />
                ))}
              </span>
              {t.name}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Restyles this page&apos;s colors, fonts and section backgrounds. Content stays as it is.
      </p>
    </div>
  )
}

/** Set (or, with null, remove) a dot-path value inside a copy of `root`. */
function setIn<T>(root: T, keys: string[], value: unknown): T {
  const copy = structuredClone(root) as Record<string, unknown>
  let node = copy
  keys.slice(0, -1).forEach((k) => (node = node[k] as Record<string, unknown>))
  const last = keys[keys.length - 1]
  if (value === null && Array.isArray(node)) node.splice(Number(last), 1)
  else node[last] = value
  return copy as T
}

export function ThemePanel({ doc, apply }: { doc: PageDoc; apply: (...ops: Op[]) => Promise<void> }) {
  const commitTheme = (path: string, value: unknown) => {
    const theme = setIn(doc.theme, path.split(".").slice(1), value)
    void apply({ op: "update_theme", ...theme })
  }
  const commitMeta = (path: string, value: unknown) => {
    const key = path.split(".")[1]
    void apply({ op: "update_meta", [key]: value ?? "" })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-4">
      <TemplateSwitcher doc={doc} apply={apply} />
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Theme</h3>
        <ValueField name="colors" path="theme.colors" value={doc.theme.colors} commit={commitTheme} enums={{}} />
        <ValueField name="fonts" path="theme.fonts" value={doc.theme.fonts} commit={commitTheme} enums={{}} />
        <ValueField name="radius" path="theme.radius" value={doc.theme.radius} commit={commitTheme} enums={{}} />
        <ValueField name="maxWidth" path="theme.maxWidth" value={doc.theme.maxWidth} commit={commitTheme} enums={{}} />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">SEO</h3>
        {(["title", "description", "favicon", "ogImage", "lang"] as const).map((key) => (
          <ValueField key={key} name={key} path={`meta.${key}`} value={doc.meta[key] ?? ""} commit={commitMeta} enums={{}} />
        ))}
      </div>
    </div>
  )
}

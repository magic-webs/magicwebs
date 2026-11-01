"use client"

import type { Op, PageDoc } from "@magicwebs/page-schema"

import { ValueField } from "./fields"

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

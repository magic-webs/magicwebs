"use client"

import { Plus, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

// A generic form over a section's JSON. Each leaf commits a single
// `set_field` edit, so it lines up exactly with what the AI tools do.

export type Commit = (path: string, value: unknown) => void

const LONG_TEXT = new Set(["body", "subheading", "quote", "answer", "description", "tagline", "text"])

function humanize(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())
}

/** Keeps local state while the user types; syncs from the server when not focused. */
function useDraftValue<T>(value: T) {
  const [local, setLocal] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setLocal(value)
  }, [value])
  return {
    local,
    setLocal,
    onFocus: () => (focused.current = true),
    onBlurDone: () => (focused.current = false),
  }
}

function TextField({ label, path, value, commit, long }: { label: string; path: string; value: string; commit: Commit; long: boolean }) {
  const { local, setLocal, onFocus, onBlurDone } = useDraftValue(value)
  const save = () => {
    onBlurDone()
    if (local !== value) commit(path, local)
  }
  const isImage = /(^|\.)(src|backgroundImage)$/.test(path)
  const isColor = /^#[0-9a-f]{3,8}$/i.test(local)
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {long ? (
        <Textarea value={local} onFocus={onFocus} onChange={(e) => setLocal(e.target.value)} onBlur={save} className="min-h-16" />
      ) : (
        <div className="flex items-center gap-2">
          {isColor && <span className="size-5 shrink-0 rounded border" style={{ background: local }} />}
          <Input
            value={local}
            onFocus={onFocus}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        </div>
      )}
      {isImage && local && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={local} alt="" className="mt-1 max-h-24 w-fit rounded border object-contain" />
      )}
    </label>
  )
}

function NumberField({ label, path, value, commit }: { label: string; path: string; value: number; commit: Commit }) {
  const { local, setLocal, onFocus, onBlurDone } = useDraftValue(String(value))
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        value={local}
        onFocus={onFocus}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          onBlurDone()
          const n = Number(local)
          if (local !== "" && !Number.isNaN(n) && n !== value) commit(path, n)
        }}
      />
    </label>
  )
}

export function EnumField({
  label,
  path,
  value,
  options,
  commit,
}: {
  label: string
  path: string
  value: string | undefined
  options: readonly string[]
  commit: Commit
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => commit(path, e.target.value || null)}
        className="h-8 rounded-lg border bg-transparent px-2 text-sm"
      >
        {value === undefined && <option value="">Default</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

function emptyLike(sample: unknown): unknown {
  if (typeof sample === "string") return ""
  if (typeof sample === "number") return 0
  if (typeof sample === "boolean") return false
  if (Array.isArray(sample)) return []
  if (sample && typeof sample === "object") {
    return Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, emptyLike(v)]))
  }
  return ""
}

export function ValueField({
  name,
  path,
  value,
  commit,
  enums,
}: {
  name: string
  path: string
  value: unknown
  commit: Commit
  enums: Record<string, readonly string[]>
}) {
  const label = /^\d+$/.test(name) ? `Item ${Number(name) + 1}` : humanize(name)

  if (enums[name] && (typeof value === "string" || value === undefined)) {
    return <EnumField label={label} path={path} value={value as string | undefined} options={enums[name]} commit={commit} />
  }
  if (typeof value === "string") {
    return <TextField label={label} path={path} value={value} commit={commit} long={LONG_TEXT.has(name) || value.length > 80} />
  }
  if (typeof value === "number") return <NumberField label={label} path={path} value={value} commit={commit} />
  if (typeof value === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value} onChange={(e) => commit(path, e.target.checked)} />
        {label}
      </label>
    )
  }
  if (Array.isArray(value)) {
    return (
      <fieldset className="flex flex-col gap-2 rounded-lg border p-2">
        <legend className="px-1 text-xs font-medium">{label}</legend>
        {value.map((item, i) => (
          <div key={i} className="relative flex flex-col gap-2 rounded-md bg-muted/40 p-2 pr-8">
            <Button
              size="icon-xs"
              variant="ghost"
              className="absolute top-1 right-1"
              aria-label="Remove item"
              onClick={() => commit(`${path}.${i}`, null)}
            >
              <X />
            </Button>
            <ValueField name={String(i)} path={`${path}.${i}`} value={item} commit={commit} enums={enums} />
          </div>
        ))}
        <Button
          size="xs"
          variant="ghost"
          className="w-fit"
          onClick={() => commit(`${path}.${value.length}`, value.length ? emptyLike(value[value.length - 1]) : "")}
        >
          <Plus />
          Add
        </Button>
      </fieldset>
    )
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
    const isItem = /^\d+$/.test(name)
    const inner = entries.map(([k, v]) => (
      <ValueField key={k} name={k} path={`${path}.${k}`} value={v} commit={commit} enums={enums} />
    ))
    if (isItem) return <div className="flex flex-col gap-2">{inner}</div>
    return (
      <fieldset className="flex flex-col gap-2 rounded-lg border p-2">
        <legend className="px-1 text-xs font-medium">{label}</legend>
        {inner}
      </fieldset>
    )
  }
  return null
}

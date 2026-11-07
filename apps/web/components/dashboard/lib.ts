"use client"

import { ConvexError } from "convex/values"
import { useCallback, useSyncExternalStore } from "react"

import type { Doc } from "@magicwebs/backend/convex/_generated/dataModel"

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"
export const MCP_URL = `${API_URL.replace(/\/$/, "")}/mcp`

export type Model = "haiku" | "sonnet" | "opus"
export type Effort = "low" | "medium" | "high" | "xhigh" | "max"

export const MODELS: { value: Model; label: string; hint: string }[] = [
  { value: "haiku", label: "Haiku 5.5", hint: "fastest" },
  { value: "sonnet", label: "Sonnet 5.5", hint: "balanced" },
  { value: "opus", label: "Opus 5.5", hint: "most capable" },
]

export const EFFORTS: { value: Effort; label: string }[] = [
  { value: "low", label: "Low effort" },
  { value: "medium", label: "Medium effort" },
  { value: "high", label: "High effort" },
  { value: "xhigh", label: "Extra high effort" },
  { value: "max", label: "Max effort" },
]

export const modelLabel = (model?: Model) => MODELS.find((m) => m.value === model)?.label ?? "Default"

export const SOURCE_LABELS: Record<Doc<"edits">["source"], string> = {
  editor: "Visual editor",
  ai: "AI chat",
  mcp: "MCP",
  clone: "Clone",
  rollback: "Rollback",
  blog: "Blog",
}

const tokenFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
export const formatTokens = (n: number) => tokenFormat.format(n)

export function formatCost(usd: number) {
  if (usd === 0) return "$0"
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

export function errorText(err: unknown, fallback = "Something went wrong. Try again.") {
  return err instanceof ConvexError ? String(err.data) : fallback
}

export type Project = Doc<"projects"> & { hostname: string }

export function projectState(p: Project): "live" | "draft" | "cloning" | "failed" {
  if (p.status === "cloning") return "cloning"
  if (p.status === "failed") return "failed"
  return p.publishedVersionId ? "live" : "draft"
}

// Defaults for new projects, kept per browser.

const DEFAULTS_KEY = "magicwebs:new-project-defaults"
const FALLBACK: { model: Model; effort: Effort } = { model: "haiku", effort: "medium" }
const listeners = new Set<() => void>()
let cached: string | null | undefined

function readDefaults(): string | null {
  if (cached === undefined) {
    try {
      cached = localStorage.getItem(DEFAULTS_KEY)
    } catch {
      cached = null
    }
  }
  return cached
}

export function useProjectDefaults() {
  const raw = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    readDefaults,
    () => null,
  )
  let value = FALLBACK
  try {
    if (raw) value = { ...FALLBACK, ...JSON.parse(raw) }
  } catch {
    // Ignore a corrupt entry and use the fallback.
  }
  const set = useCallback((next: Partial<typeof FALLBACK>) => {
    const merged = JSON.stringify({ ...value, ...next })
    cached = merged
    try {
      localStorage.setItem(DEFAULTS_KEY, merged)
    } catch {
      // Storage can be unavailable; the choice still applies for this session.
    }
    listeners.forEach((l) => l())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw])
  return [value, set] as const
}

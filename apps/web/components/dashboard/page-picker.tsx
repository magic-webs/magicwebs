"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export type DiscoveredPage = { url: string; path: string; title: string }

/**
 * A checklist of a site's discovered pages. `locked` pages are shown checked
 * and can't be unticked (the home page, or pages already in the site); at
 * most `max` pages can be ticked in total, locked ones included.
 */
export function PagePicker({
  pages,
  selected,
  onChange,
  locked,
  max,
}: {
  pages: DiscoveredPage[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
  locked: Map<string, string>
  max: number
}) {
  const count = pages.filter((p) => locked.has(p.path) || selected.has(p.path)).length
  const full = count >= max
  const toggle = (path: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(path)
    else next.delete(path)
    onChange(next)
  }
  const selectUpToMax = () => {
    const next = new Set(selected)
    let total = count
    for (const page of pages) {
      if (total >= max) break
      if (locked.has(page.path) || next.has(page.path)) continue
      next.add(page.path)
      total++
    }
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {count} of {max} pages selected
          {pages.length > 1 && ` · ${pages.length} found`}
        </span>
        <div className="flex gap-1">
          <Button type="button" size="xs" variant="ghost" onClick={selectUpToMax} disabled={full}>
            Select {pages.length - locked.size > max - locked.size ? `first ${max}` : "all"}
          </Button>
          <Button type="button" size="xs" variant="ghost" onClick={() => onChange(new Set())} disabled={selected.size === 0}>
            Clear
          </Button>
        </div>
      </div>
      <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
        {pages.map((page) => {
          const lockReason = locked.get(page.path)
          const checked = !!lockReason || selected.has(page.path)
          const disabled = !!lockReason || (!checked && full)
          return (
            <li key={page.path}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-3 py-2",
                  disabled ? "cursor-default" : "hover:bg-muted/50",
                  disabled && !checked && "opacity-50",
                )}
              >
                <Checkbox checked={checked} disabled={disabled} onCheckedChange={(on) => toggle(page.path, on)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{page.title}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{page.path}</span>
                </span>
                {lockReason && (
                  <Badge variant="secondary" className="shrink-0">
                    {lockReason}
                  </Badge>
                )}
              </label>
            </li>
          )
        })}
      </ul>
      {full && pages.length > count && (
        <p className="text-xs text-muted-foreground">A site holds up to {max} pages. Untick one to pick another.</p>
      )}
    </div>
  )
}

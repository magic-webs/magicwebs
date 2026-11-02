"use client"

import { formatDistanceToNow } from "date-fns"
import { Bot, Copy, History, MousePointerClick, Plug, Rocket } from "lucide-react"
import Link from "next/link"

import type { ActivityItem } from "@magicwebs/backend/convex/dashboard"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { SOURCE_LABELS } from "./lib"

const SOURCE_ICONS = {
  editor: MousePointerClick,
  ai: Bot,
  mcp: Plug,
  clone: Copy,
  rollback: History,
}

const SOURCE_TINTS = {
  editor: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  ai: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  mcp: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  clone: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  rollback: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
}

export function ActivityFeed({ items, compact }: { items: ActivityItem[]; compact?: boolean }) {
  return (
    <ol className="flex flex-col">
      {items.map((item) => {
        const Icon = item.kind === "publish" ? Rocket : SOURCE_ICONS[item.source]
        const tint =
          item.kind === "publish" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : SOURCE_TINTS[item.source]
        return (
          <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
            <span className="absolute top-8 bottom-0 left-4 w-px bg-border [li:last-child_&]:hidden" />
            <span className={cn("relative grid size-8 shrink-0 place-items-center rounded-full", tint)}>
              <Icon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
              <p className="text-sm">
                <Link href={`/projects/${item.projectId}`} className="font-medium hover:underline">
                  {item.projectName}
                </Link>{" "}
                <span className="text-muted-foreground">
                  {item.kind === "publish"
                    ? `published version ${item.number}`
                    : item.source === "clone"
                      ? "was cloned"
                      : `edited from ${SOURCE_LABELS[item.source].toLowerCase()}`}
                </span>
              </p>
              {!compact && (
                <p className="truncate text-xs text-muted-foreground">
                  {item.kind === "publish" ? (item.note ?? "Published by hand") : item.summary}
                  {item.kind === "edit" && item.count > 1 && ` · ${item.count} changes`}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 pt-1">
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {formatDistanceToNow(item.createdAt, { addSuffix: true })}
              </span>
              {!compact && (
                <Badge variant="outline" className="hidden sm:inline-flex">
                  {item.kind === "publish" ? "Publish" : SOURCE_LABELS[item.source]}
                </Badge>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

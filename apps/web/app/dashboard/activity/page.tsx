"use client"

import { useQuery } from "convex/react"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"

import { ActivityFeed } from "@/components/dashboard/activity-feed"
import { PageHeader } from "@/components/dashboard/shell"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Filter = "all" | "publish" | "editor" | "ai" | "mcp" | "clone" | "rollback"

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "publish", label: "Publishes" },
  { value: "editor", label: "Visual editor" },
  { value: "ai", label: "AI chat" },
  { value: "mcp", label: "MCP" },
  { value: "clone", label: "Clones" },
  { value: "rollback", label: "Rollbacks" },
]

export default function ActivityPage() {
  const activity = useQuery(api.dashboard.activity)
  const [filter, setFilter] = useState<Filter>("all")

  const visible = (activity ?? []).filter(
    (item) =>
      filter === "all" || (filter === "publish" ? item.kind === "publish" : item.kind === "edit" && item.source === filter),
  )

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every edit and publish across your projects, whether it came from the editor, the AI chat or an MCP client."
      />
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="max-w-full overflow-x-auto">
          {FILTERS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Card>
        <CardContent>
          {activity === undefined ? (
            <div className="flex flex-col gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <ActivityFeed items={visible} />
          )}
        </CardContent>
      </Card>
    </>
  )
}

"use client"

import { useQuery } from "convex/react"
import { useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { PageHeader } from "@/components/dashboard/shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type Summary = NonNullable<ReturnType<typeof useSummary>>
type Totals = Summary["totals"]
type Metric = "visitors" | "pageviews" | "leads"

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
]

function useSummary(projectId: Id<"projects"> | null, days: number) {
  return useQuery(api.analytics.summary, projectId ? { projectId, days } : "skip")
}

const number = new Intl.NumberFormat()
const compact = new Intl.NumberFormat(undefined, { notation: "compact" })
const percent = (value: number | null) => (value === null ? "–" : `${Math.round(value * 100)}%`)

function duration(ms: number | null) {
  if (ms === null) return "–"
  const seconds = Math.round(ms / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

/** "↑ 12% vs previous 30 days", in muted ink: the arrow carries the direction, not a color. */
function Change({ now, before, days }: { now: number | null; before: number | null; days: number }) {
  if (now === null || before === null || before === 0) return <span>No earlier data</span>
  const change = (now - before) / before
  if (Math.abs(change) < 0.005) return <span>Same as previous {days} days</span>
  return (
    <span>
      {change > 0 ? "↑" : "↓"} {Math.abs(Math.round(change * 100))}% vs previous {days} days
    </span>
  )
}

let regionNames: Intl.DisplayNames | null = null
function countryName(code: string) {
  try {
    regionNames ??= new Intl.DisplayNames(undefined, { type: "region" })
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

export default function AnalyticsPage() {
  const projects = useQuery(api.projects.list)
  const [chosen, setChosen] = useState<Id<"projects"> | null>(null)
  const [days, setDays] = useState(30)
  const [metric, setMetric] = useState<Metric>("visitors")
  const projectId = chosen ?? projects?.[0]?._id ?? null
  const project = projects?.find((p) => p._id === projectId)
  const summary = useSummary(projectId, days)

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Who visits your published sites, where they come from and what they do. No cookies: each visitor is counted once a day."
        action={
          projects && projects.length > 1 ? (
            <NativeSelect value={projectId ?? ""} onChange={(e) => setChosen(e.target.value as Id<"projects">)} aria-label="Site">
              {projects.map((p) => (
                <NativeSelectOption key={p._id} value={p._id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : undefined
        }
      />

      {projects !== undefined && !project ? (
        <p className="text-sm text-muted-foreground">Create and publish a site to see its visitors here.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <TabsList>
                {RANGES.map((range) => (
                  <TabsTrigger key={range.days} value={String(range.days)}>
                    {range.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {summary && (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className={cn("size-2 rounded-full", summary.live.visitors ? "bg-foreground" : "bg-muted-foreground/40")} aria-hidden="true" />
                {summary.live.visitors === 1 ? "1 visitor" : `${number.format(summary.live.visitors)} visitors`} online now
              </span>
            )}
          </div>

          {!summary ? (
            <Skeleton className="h-96" />
          ) : (
            <>
              <StatTiles summary={summary} days={days} metric={metric} onMetric={setMetric} />
              <TrendCard summary={summary} metric={metric} />
              <div className="grid gap-6 lg:grid-cols-2">
                <BarList
                  title="Top pages"
                  rows={summary.pages.map((p) => ({ key: p.key, count: p.views, note: `${number.format(p.visitors)} visitors` }))}
                  unit="views"
                />
                <BarList title="Referrers" rows={summary.referrers} unit="views" empty="No visits from other sites yet." />
                <BarList
                  title="Campaigns (UTM)"
                  rows={summary.sources.map((s) => ({ ...s, key: `source: ${s.key}` })).concat(summary.campaigns.map((c) => ({ ...c, key: `campaign: ${c.key}` })))}
                  unit="views"
                  empty="Add ?utm_source= and ?utm_campaign= to the links you share to see them here."
                />
                <BarList title="Countries" rows={summary.countries.map((c) => ({ ...c, key: countryName(c.key) }))} unit="views" />
                <BarList title="Devices" rows={summary.devices.map((d) => ({ ...d, key: d.key[0]!.toUpperCase() + d.key.slice(1) }))} unit="views" />
                <BarList title="Browsers" rows={summary.browsers} unit="views" />
                <BarList title="Operating systems" rows={summary.os} unit="views" />
                <BarList title="On the site now" rows={summary.live.pages} unit="visitors" empty="Nobody right now." />
              </div>
              <p className="text-xs text-muted-foreground">
                Days are UTC. Numbers update every 10 minutes; visitors online now update live. Visitors are counted once per
                day, so a range adds up each day&apos;s visitors.
              </p>
            </>
          )}
        </>
      )}
    </>
  )
}

function StatTiles({
  summary,
  days,
  metric,
  onMetric,
}: {
  summary: Summary
  days: number
  metric: Metric
  onMetric: (metric: Metric) => void
}) {
  const t: Totals = summary.totals
  const p: Totals = summary.previous
  const tiles: { label: string; value: string; now: number | null; before: number | null; metric?: Metric }[] = [
    { label: "Visitors", value: number.format(t.visitors), now: t.visitors, before: p.visitors, metric: "visitors" },
    { label: "Page views", value: number.format(t.pageviews), now: t.pageviews, before: p.pageviews, metric: "pageviews" },
    { label: "Bounce rate", value: percent(t.bounceRate), now: t.bounceRate, before: p.bounceRate },
    { label: "Avg. time on page", value: duration(t.avgTimeMs), now: t.avgTimeMs, before: p.avgTimeMs },
    { label: "Leads", value: number.format(t.leads), now: t.leads, before: p.leads, metric: "leads" },
    { label: "Conversion", value: percent(t.conversionRate), now: t.conversionRate, before: p.conversionRate },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => {
        const selectable = tile.metric !== undefined
        const selected = tile.metric === metric
        return (
          <Card
            key={tile.label}
            size="sm"
            className={cn(selectable && "cursor-pointer transition-colors hover:bg-muted/40", selected && "ring-2 ring-foreground/70")}
            onClick={selectable ? () => onMetric(tile.metric!) : undefined}
            role={selectable ? "button" : undefined}
            aria-pressed={selectable ? selected : undefined}
            tabIndex={selectable ? 0 : undefined}
            onKeyDown={
              selectable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onMetric(tile.metric!)
                    }
                  }
                : undefined
            }
          >
            <CardHeader>
              <CardDescription>{tile.label}</CardDescription>
              <div className="text-2xl font-semibold tracking-tight tabular-nums">{tile.value}</div>
              <div className="text-xs text-muted-foreground">
                <Change now={tile.now} before={tile.before} days={days} />
              </div>
            </CardHeader>
          </Card>
        )
      })}
    </div>
  )
}

const METRIC_LABEL: Record<Metric, string> = { visitors: "Visitors", pageviews: "Page views", leads: "Leads" }

function TrendCard({ summary, metric }: { summary: Summary; metric: Metric }) {
  const config = { [metric]: { label: METRIC_LABEL[metric], color: "var(--chart-2)" } } satisfies ChartConfig
  const empty = summary.series.every((d) => d[metric] === 0)
  const dateLabel = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{METRIC_LABEL[metric]} per day</CardTitle>
        <CardDescription>Pick visitors, page views or leads above to chart it.</CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nothing yet in this range. Visits are counted once the site is published.
          </p>
        ) : (
          <ChartContainer config={config} className="h-64 w-full">
            <AreaChart data={summary.series} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={dateLabel} />
              <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} tickFormatter={(v: number) => compact.format(v)} />
              <ChartTooltip cursor content={<ChartTooltipContent labelFormatter={(value) => dateLabel(String(value))} />} />
              <Area
                dataKey={metric}
                type="monotone"
                stroke={`var(--color-${metric})`}
                strokeWidth={2}
                fill={`var(--color-${metric})`}
                fillOpacity={0.12}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

/** A ranked list with each row's share drawn as a quiet bar behind its label. */
function BarList({
  title,
  rows,
  unit,
  empty = "No data yet.",
}: {
  title: string
  rows: { key: string; count: number; note?: string }[]
  unit: string
  empty?: string
}) {
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{empty}</p>
        ) : (
          rows.map((row) => (
            <div key={row.key} className="relative flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm" title={row.note}>
              <div className="absolute inset-y-0 left-0 rounded-md bg-muted" style={{ width: `${(row.count / max) * 100}%` }} aria-hidden="true" />
              <span className="relative truncate">{row.key}</span>
              <span className="relative shrink-0 tabular-nums text-muted-foreground">{number.format(row.count)}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

"use client"

import { useQuery } from "convex/react"
import Link from "next/link"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { api } from "@magicwebs/backend/convex/_generated/api"

import { formatCost, formatTokens, MODELS, modelLabel } from "@/components/dashboard/lib"
import { PageHeader } from "@/components/dashboard/shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const chartConfig = {
  inputTokens: { label: "Input", color: "var(--chart-2)" },
  outputTokens: { label: "Output", color: "var(--chart-4)" },
} satisfies ChartConfig

export default function UsagePage() {
  const projects = useQuery(api.projects.list)
  const withUsage = (projects ?? []).filter((p) => p.usage)

  const totals = withUsage.reduce(
    (t, p) => ({
      input: t.input + p.usage!.inputTokens,
      output: t.output + p.usage!.outputTokens,
      cached: t.cached + p.usage!.cacheReadTokens,
      cost: t.cost + (p.usage!.costUsd ?? 0),
    }),
    { input: 0, output: 0, cached: 0, cost: 0 },
  )

  const byModel = MODELS.map((m) => {
    const rows = withUsage.filter((p) => (p.model ?? "haiku") === m.value)
    return {
      ...m,
      projects: rows.length,
      cost: rows.reduce((sum, p) => sum + (p.usage!.costUsd ?? 0), 0),
      tokens: rows.reduce((sum, p) => sum + p.usage!.inputTokens + p.usage!.outputTokens, 0),
    }
  })

  const chartData = [...withUsage]
    .sort((a, b) => b.usage!.inputTokens + b.usage!.outputTokens - (a.usage!.inputTokens + a.usage!.outputTokens))
    .slice(0, 12)
    .map((p) => ({ name: p.name, inputTokens: p.usage!.inputTokens, outputTokens: p.usage!.outputTokens }))

  const stats = [
    { label: "AI cost", value: formatCost(totals.cost) },
    { label: "Input tokens", value: formatTokens(totals.input) },
    { label: "Output tokens", value: formatTokens(totals.output) },
    { label: "Cache reads", value: formatTokens(totals.cached) },
  ]

  return (
    <>
      <PageHeader
        title="Usage"
        description="Tokens and cost of AI rebuilds. Each project counts its latest successful rebuild, including retries. Exact copies don't use the model."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value }) => (
          <Card key={label} size="sm">
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              {projects === undefined ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tokens by project</CardTitle>
            <CardDescription>The 12 projects with the most tokens.</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No AI rebuilds yet.</p>
            ) : (
              <ChartContainer config={chartConfig} className="h-72 w-full">
                <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
                  />
                  <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatTokens(v)} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="inputTokens" stackId="t" fill="var(--color-inputTokens)" />
                  <Bar dataKey="outputTokens" stackId="t" fill="var(--color-outputTokens)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By model</CardTitle>
            <CardDescription>Which models your rebuilds ran on.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {byModel.map((m) => {
              const share = totals.cost > 0 ? (m.cost / totals.cost) * 100 : 0
              return (
                <div key={m.value} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{m.label}</span>
                    <span className="text-muted-foreground tabular-nums">{formatCost(m.cost)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {m.projects} project{m.projects === 1 ? "" : "s"} · {formatTokens(m.tokens)} tokens
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Input</TableHead>
              <TableHead className="text-right">Output</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Cache reads</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withUsage.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No usage yet.
                </TableCell>
              </TableRow>
            ) : (
              withUsage.map((p) => (
                <TableRow key={p._id}>
                  <TableCell>
                    <Link href={`/projects/${p._id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {modelLabel(p.model)}
                    {p.effort && ` · ${p.effort}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatTokens(p.usage!.inputTokens)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTokens(p.usage!.outputTokens)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatTokens(p.usage!.cacheReadTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.usage!.costUsd === undefined ? "—" : formatCost(p.usage!.costUsd)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {withUsage.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatTokens(totals.input)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatTokens(totals.output)}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatTokens(totals.cached)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCost(totals.cost)}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </>
  )
}

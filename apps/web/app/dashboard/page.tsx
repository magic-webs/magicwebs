"use client"

import { useQuery } from "convex/react"
import Link from "next/link"

import { api } from "@magicwebs/backend/convex/_generated/api"

import {
  ArrowRightIcon,
  FolderIcon,
  GlobeIcon,
  ServerIcon,
  WalletIcon,
} from "@/components/icons"
import { Spinner } from "@/components/ui/spinner"
import { ActivityFeed } from "@/components/dashboard/activity-feed"
import { formatCost } from "@/components/dashboard/lib"
import { NewProjectForm } from "@/components/dashboard/new-project"
import { ProjectCard } from "@/components/dashboard/project-card"
import { PageHeader } from "@/components/dashboard/shell"
import { Games } from "@/components/onboarding/games"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function OverviewPage() {
  const projects = useQuery(api.projects.list)
  const activity = useQuery(api.dashboard.activity)
  const domains = useQuery(api.dashboard.domains)

  const live = projects?.filter((p) => p.publishedVersionId).length
  const building = projects?.filter((p) => p.status === "cloning")
  const cloning = building?.length
  const cost = projects?.reduce((sum, p) => sum + (p.usage?.costUsd ?? 0), 0)
  const customDomains = domains?.filter((d) => d.kind === "custom")

  const stats = [
    { label: "Projects", value: projects?.length, icon: FolderIcon, hint: cloning ? `${cloning} cloning now` : "All ready" },
    { label: "Live sites", value: live, icon: GlobeIcon, hint: "Served from the edge" },
    {
      label: "Custom domains",
      value: customDomains?.length,
      icon: ServerIcon,
      hint: customDomains
        ? `${customDomains.filter((d) => d.status === "active").length} active`
        : undefined,
    },
    { label: "AI cost", value: cost === undefined ? undefined : formatCost(cost), icon: WalletIcon, hint: "Latest rebuild per project" },
  ]

  return (
    <>
      <PageHeader title="Overview" description="Bring in your website, then edit and publish it." />

      <Card>
        <CardHeader>
          <CardTitle>Start from any website</CardTitle>
          <CardDescription>
            Enter your website&apos;s address. Keep its design or give it a fresh new look, then edit and publish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewProjectForm />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, hint }) => (
          <Card key={label} size="sm">
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardAction>
                <Icon solid className="size-4 text-muted-foreground" />
              </CardAction>
              {value === undefined ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
              )}
            </CardHeader>
            {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="flex flex-col gap-3 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Recent projects</h2>
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/dashboard/projects" />}>
              All projects
              <ArrowRightIcon />
            </Button>
          </div>
          {projects === undefined ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No projects yet. Paste a URL above to get started.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {projects.slice(0, 4).map((project) => (
                <li key={project._id}>
                  <ProjectCard project={project} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3 lg:col-span-2">
          {building && building.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Play while you wait</CardTitle>
                <CardDescription>
                  {building.length === 1 ? `${building[0]!.name} is` : `${building.length} sites are`} being built. This
                  takes a few minutes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* The games are drawn in the light start-page look, so they keep it in dark mode too. */}
                <div className="flex flex-col gap-3 rounded-xl bg-mw-bg p-3 text-mw-fg scheme-light">
                  <Games sources={building.flatMap((p) => [p.name, p.sourceUrl.replace(/^https?:\/\/(www\.)?/, "")])} />
                </div>
              </CardContent>
            </Card>
          )}
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Activity</h2>
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/dashboard/activity" />}>
              View all
              <ArrowRightIcon />
            </Button>
          </div>
          <Card>
            <CardContent>
              {activity === undefined ? (
                <Spinner className="mx-auto size-4 text-muted-foreground" />
              ) : activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Edits and publishes show up here.</p>
              ) : (
                <ActivityFeed items={activity.slice(0, 7)} compact />
              )}
            </CardContent>
          </Card>

          <Card size="sm" className="bg-muted/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ServerIcon className="size-4" />
                Edit from your coding agent
              </CardTitle>
              <CardDescription>
                Connect Claude Code, Cursor or any MCP client to clone, edit and publish pages.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/dashboard/mcp" />}>
                Set up MCP
                <ArrowRightIcon />
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  )
}

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
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function OverviewPage() {
  const projects = useQuery(api.projects.list)
  const activity = useQuery(api.dashboard.activity)
  const domains = useQuery(api.dashboard.domains)

  const live = projects?.filter((p) => p.publishedVersionId).length
  const cloning = projects?.filter((p) => p.status === "cloning").length
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
      <PageHeader title="Overview" description="Start from any public page, then edit and publish it." />

      <Card>
        <CardHeader>
          <CardTitle>Start from any website</CardTitle>
          <CardDescription>
            Paste a URL. We copy the page with its CSS, fonts and animations into an editable project.
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

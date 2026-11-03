"use client"

import { useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"
import { useMemo, useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"

import { GridIcon, ListIcon, SearchIcon } from "@/components/icons"
import { formatCost, modelLabel, projectState, type Project } from "@/components/dashboard/lib"
import { ProjectActions, ProjectCard } from "@/components/dashboard/project-card"
import { PageHeader } from "@/components/dashboard/shell"
import { ProjectStatus } from "@/components/editor/project-status"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Filter = "all" | ReturnType<typeof projectState>
type Sort = "newest" | "published" | "name"

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "draft", label: "Drafts" },
  { value: "cloning", label: "Cloning" },
  { value: "failed", label: "Failed" },
]

const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "published", label: "Recently published" },
  { value: "name", label: "Name" },
]

const SORTERS: Record<Sort, (a: Project, b: Project) => number> = {
  newest: (a, b) => b.createdAt - a.createdAt,
  published: (a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0),
  name: (a, b) => a.name.localeCompare(b.name),
}

export default function ProjectsPage() {
  const projects = useQuery(api.projects.list)
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("newest")
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, live: 0, draft: 0, cloning: 0, failed: 0 }
    for (const p of projects ?? []) {
      c.all++
      c[projectState(p)]++
    }
    return c
  }, [projects])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (projects ?? [])
      .filter((p) => filter === "all" || projectState(p) === filter)
      .filter((p) => !q || [p.name, p.hostname, p.sourceUrl].some((s) => s.toLowerCase().includes(q)))
      .sort(SORTERS[sort])
  }, [projects, filter, search, sort])

  return (
    <>
      <PageHeader
        title="Projects"
        description="Every page you've cloned. Open one to edit it, or manage it from here."
      />

      <div className="flex flex-col gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>
                {label}
                <span className="ml-1 text-xs text-muted-foreground tabular-nums">{counts[value]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or domain"
              className="pl-8"
              aria-label="Search projects"
            />
          </div>
          <Select items={SORTS} value={sort} onValueChange={(v) => v && setSort(v)}>
            <SelectTrigger aria-label="Sort projects">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup
            value={[view]}
            onValueChange={(v) => v[0] && setView(v[0] as "grid" | "list")}
            variant="outline"
            className="ml-auto"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view">
              <GridIcon solid={view === "grid"} />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <ListIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {projects === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {projects.length === 0 ? "No projects yet. Create one to get started." : "No projects match."}
        </p>
      ) : view === "grid" ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <li key={project._id}>
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Domain</TableHead>
                <TableHead className="hidden lg:table-cell">Model</TableHead>
                <TableHead className="hidden sm:table-cell">Updated</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((project) => (
                <TableRow key={project._id}>
                  <TableCell className="max-w-56">
                    <Link href={`/projects/${project._id}`} className="block truncate font-medium hover:underline">
                      {project.name}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">{project.sourceUrl}</span>
                  </TableCell>
                  <TableCell>
                    <ProjectStatus status={project.status} published={!!project.publishedVersionId} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{project.hostname}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {modelLabel(project.model)}
                    {project.usage?.costUsd !== undefined && ` · ${formatCost(project.usage.costUsd)}`}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {formatDistanceToNow(project.publishedAt ?? project.createdAt, { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <ProjectActions project={project} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

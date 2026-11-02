"use client"

import { useQuery } from "convex/react"
import {
  Activity,
  BarChart3,
  FolderKanban,
  Globe,
  LayoutDashboard,
  Plug,
  Settings,
  Sparkles,
  ArrowUpRight,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { api } from "@magicwebs/backend/convex/_generated/api"

import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"

import { NewProjectDialog } from "./new-project"

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban, badge: "projects" as const },
  { href: "/dashboard/domains", label: "Domains", icon: Globe },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/usage", label: "Usage", icon: BarChart3 },
]

const CONFIGURE = [
  { href: "/dashboard/mcp", label: "MCP & API", icon: Plug },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
]

const ALL = [...NAV, ...CONFIGURE]

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href)
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const projects = useQuery(api.projects.list)
  const cloning = projects?.filter((p) => p.status === "cloning").length ?? 0
  const current = ALL.find((item) => isActive(pathname, item.href))

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<Link href="/" />} tooltip="Magicwebs home">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles className="size-4" />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="font-semibold">Magicwebs</span>
                  <span className="text-xs text-muted-foreground">Workspace</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map(({ href, label, icon: Icon, badge }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton isActive={isActive(pathname, href)} tooltip={label} render={<Link href={href} />}>
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                    {badge === "projects" && projects && projects.length > 0 && (
                      <SidebarMenuBadge>{cloning > 0 ? `${cloning} cloning` : projects.length}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Configure</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {CONFIGURE.map(({ href, label, icon: Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton isActive={isActive(pathname, href)} tooltip={label} render={<Link href={href} />}>
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Back to the site" render={<Link href="/" />}>
                <ArrowUpRight />
                <span>Back to the site</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <span className="text-sm font-medium">{current?.label ?? "Dashboard"}</span>
          <div className="ml-auto">
            <NewProjectDialog />
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 p-4 sm:p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

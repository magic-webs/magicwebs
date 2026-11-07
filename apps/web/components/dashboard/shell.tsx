"use client"

import { useQuery } from "convex/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { api } from "@magicwebs/backend/convex/_generated/api"

import {
  ClockIcon,
  FolderIcon,
  GlobeIcon,
  HomeIcon,
  ListIcon,
  PieChartIcon,
  ServerIcon,
  SettingsIcon,
  WalletIcon,
} from "@/components/icons"
import { BrandMark } from "@/components/brand-mark"
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
import { ProfileMenu } from "./profile-menu"

const NAV = [
  { href: "/dashboard", label: "Overview", icon: HomeIcon },
  { href: "/dashboard/projects", label: "Projects", icon: FolderIcon, badge: "projects" as const },
  { href: "/dashboard/analytics", label: "Analytics", icon: PieChartIcon },
  { href: "/dashboard/leads", label: "Leads", icon: ListIcon },
  { href: "/dashboard/domains", label: "Domains", icon: GlobeIcon },
  { href: "/dashboard/activity", label: "Activity", icon: ClockIcon },
  { href: "/dashboard/usage", label: "Usage", icon: WalletIcon },
]

const CONFIGURE = [
  { href: "/dashboard/mcp", label: "MCP & API", icon: ServerIcon },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
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
                <BrandMark className="size-8 shrink-0 text-foreground" />
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
                      <Icon solid={isActive(pathname, href)} />
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
                      <Icon solid={isActive(pathname, href)} />
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
              <ProfileMenu variant="sidebar" />
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
          <div className="ml-auto flex items-center gap-2">
            <NewProjectDialog />
            <ProfileMenu variant="header" />
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

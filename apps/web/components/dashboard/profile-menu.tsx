"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useQuery } from "convex/react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { api } from "@magicwebs/backend/convex/_generated/api"

import {
  ArrowLeftIcon,
  ChevronUpIcon,
  KeyIcon,
  LaptopIcon,
  LogOutIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
} from "@/components/icons"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar"

const THEMES = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: LaptopIcon },
]

type Viewer = { name?: string; email?: string; image?: string }

function displayName(viewer: Viewer | null | undefined) {
  return viewer?.name || viewer?.email?.split("@")[0] || "Account"
}

function initials(viewer: Viewer | null | undefined) {
  const words = displayName(viewer).split(/[\s._-]+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : displayName(viewer).slice(0, 2)).toUpperCase()
}

function UserAvatar({ viewer, className }: { viewer: Viewer | null | undefined; className?: string }) {
  return (
    <Avatar className={className}>
      {viewer?.image && <AvatarImage src={viewer.image} alt="" />}
      <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">{initials(viewer)}</AvatarFallback>
    </Avatar>
  )
}

function Identity({ viewer }: { viewer: Viewer | null | undefined }) {
  return (
    <span className="flex min-w-0 flex-col text-left leading-tight">
      <span className="truncate text-sm font-medium">{displayName(viewer)}</span>
      {viewer?.email && <span className="truncate text-xs text-muted-foreground">{viewer.email}</span>}
    </span>
  )
}

/**
 * The signed-in user's menu: account links, theme and sign out. "header" is the
 * avatar at the top right; "sidebar" is the row at the foot of the sidebar.
 */
export function ProfileMenu({ variant }: { variant: "header" | "sidebar" }) {
  const viewer = useQuery(api.users.viewer)
  const { signOut } = useAuthActions()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { isMobile } = useSidebar()

  const trigger =
    variant === "header" ? (
      <Button variant="ghost" size="icon" className="rounded-full" aria-label="Open profile menu" />
    ) : (
      <SidebarMenuButton size="lg" tooltip={displayName(viewer)} className="data-popup-open:bg-sidebar-accent" />
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>
        <UserAvatar viewer={viewer} className={variant === "sidebar" ? "rounded-lg after:rounded-lg" : undefined} />
        {variant === "sidebar" && (
          <>
            <Identity viewer={viewer} />
            <ChevronUpIcon className="ml-auto size-4 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-60"
        align="end"
        side={variant === "sidebar" && !isMobile ? "right" : "bottom"}
        sideOffset={variant === "sidebar" ? 8 : 4}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2 px-1.5 py-1.5 font-normal text-foreground">
            <UserAvatar viewer={viewer} />
            <Identity viewer={viewer} />
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/dashboard/mcp" />}>
            <KeyIcon />
            API keys
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SunIcon />
              Theme
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(String(value))}>
                {THEMES.map(({ value, label, icon: Icon }) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    <Icon solid={theme === value} />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/" />}>
            <ArrowLeftIcon />
            Back to the site
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              await signOut()
              router.replace("/signin")
            }}
          >
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

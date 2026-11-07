"use client"

import { useMutation, useQuery } from "convex/react"
import type { FunctionArgs } from "convex/server"
import { formatDistanceToNow } from "date-fns"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { errorText } from "@/components/dashboard/lib"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  IconGlyph,
  LauncherPreview,
  WIDGET_ANIMATIONS,
  WIDGET_ICONS,
  type WidgetAnimation,
  type WidgetIcon,
} from "@/components/editor/widget-icons"
import { MAGIC_AGENT_URL } from "@/lib/magic-agent"
import { cn } from "@/lib/utils"

type Change = Omit<FunctionArgs<typeof api.widget.update>, "projectId">

/** The site's Magic Agent chat widget: on every published page unless switched off here. */
export function WidgetPanel({ projectId, path, primary }: { projectId: Id<"projects">; path: string; primary: string }) {
  const widget = useQuery(api.widget.get, { projectId })
  const update = useMutation(api.widget.update)
  const [error, setError] = useState<string | null>(null)

  async function change(args: Change) {
    setError(null)
    try {
      await update({ projectId, ...args })
    } catch (err) {
      setError(errorText(err))
    }
  }

  if (widget === undefined) {
    return (
      <div className="grid place-items-center p-6">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  }

  if (!widget.ready) {
    const failed = widget.workspace?.status === "failed"
    return (
      <div className="flex flex-col gap-2 p-4 text-sm text-muted-foreground">
        <h3 className="font-medium text-foreground">Chat widget</h3>
        {failed ? (
          <p className="text-destructive">{widget.workspace?.error ?? "This site's Magic Agent workspace couldn't be set up."} Retry from the dashboard.</p>
        ) : (
          <p className="flex items-center gap-2">
            <Spinner className="size-3" />
            Setting up this site&apos;s Magic Agent workspace…
          </p>
        )}
      </div>
    )
  }

  const hiddenHere = widget.hiddenPaths.includes(path)
  const icon = (widget.icon in WIDGET_ICONS ? widget.icon : "chat-dots") as WidgetIcon
  const animation = (WIDGET_ANIMATIONS.some((a) => a.value === widget.animation) ? widget.animation : "none") as WidgetAnimation

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Chat widget</h3>
        <p className="text-xs text-muted-foreground">
          Your Magic Agent answers visitors on every page. Changes go live at once, without publishing.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="widget-enabled">Show on this site</Label>
        <Switch id="widget-enabled" checked={widget.enabled} onCheckedChange={(enabled) => change({ enabled })} />
      </div>
      <div className={cn("flex items-center justify-between gap-3", !widget.enabled && "opacity-50")}>
        <Label htmlFor="widget-page">Show on this page</Label>
        <Switch
          id="widget-page"
          disabled={!widget.enabled}
          checked={!hiddenHere}
          onCheckedChange={(visible) => change({ page: { path, visible } })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Position</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {(["left", "right"] as const).map((position) => (
            <button
              key={position}
              type="button"
              aria-pressed={widget.position === position}
              onClick={() => change({ position })}
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs capitalize transition-colors",
                widget.position === position ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted",
              )}
            >
              Bottom {position}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <LauncherPreview icon={icon} animation={animation} color={widget.color ?? primary} />
          <p className="text-xs text-muted-foreground">
            How the button looks on your site. Animations pause while the chat is open.
          </p>
        </div>
        <Label>Icon</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(WIDGET_ICONS) as WidgetIcon[]).map((value) => (
            <button
              key={value}
              type="button"
              title={WIDGET_ICONS[value][0]}
              aria-label={`${WIDGET_ICONS[value][0]} icon`}
              aria-pressed={icon === value}
              onClick={() => change({ icon: value })}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[11px] transition-colors",
                icon === value ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <IconGlyph icon={value} size={20} />
              {WIDGET_ICONS[value][0]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Animation</Label>
        <div className="flex flex-wrap gap-1.5">
          {WIDGET_ANIMATIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={animation === value}
              onClick={() => change({ animation: value })}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                animation === value ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="widget-color">Color</Label>
        <div className="flex items-center gap-2">
          <input
            id="widget-color"
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(widget.color ?? primary) ? (widget.color ?? primary) : "#000000"}
            onChange={(e) => change({ color: e.target.value })}
            className="h-8 w-10 cursor-pointer rounded border bg-transparent"
          />
          <span className="text-xs text-muted-foreground">{widget.color ? widget.color : "Page's primary color"}</span>
          {widget.color && (
            <button type="button" className="ml-auto text-xs underline-offset-4 hover:underline" onClick={() => change({ color: "" })}>
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="widget-teaser">Teaser</Label>
        <Input
          id="widget-teaser"
          key={widget.teaser ?? ""}
          defaultValue={widget.teaser ?? ""}
          placeholder="Questions? Chat with us"
          maxLength={120}
          onBlur={(e) => {
            if (e.target.value.trim() !== (widget.teaser ?? "")) void change({ teaser: e.target.value })
          }}
        />
        <p className="text-xs text-muted-foreground">A one-line bubble beside the button. Leave empty for none.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <AgentSync projectId={projectId} />

      {MAGIC_AGENT_URL && widget.workspaceSlug && (
        <a
          href={`${MAGIC_AGENT_URL}/w/${widget.workspaceSlug}`}
          target="_blank"
          rel="noreferrer"
          className="mt-auto text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Set up the agent&apos;s answers in Magic Agent →
        </a>
      )}
    </div>
  )
}

/**
 * The workspace behind the widget, set up from the site: its company details,
 * front desk, marketing desk and a knowledge source per page, refreshed a
 * couple of minutes after each publish.
 */
function AgentSync({ projectId }: { projectId: Id<"projects"> }) {
  const status = useQuery(api.magicAgent.agentStatus, { projectId })
  const syncNow = useMutation(api.magicAgent.syncAgentNow)
  const [error, setError] = useState<string | null>(null)
  if (!status || status.workspace?.status !== "ready") return null
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Agent setup</h4>
      <p className="text-xs text-muted-foreground">
        Your company details, a front desk, a marketing agent and a knowledge base made from your pages, kept in step a couple of
        minutes after each publish.
      </p>
      <p className="text-xs">
        {status.pending ? (
          <span className="flex items-center gap-1.5">
            <Spinner className="size-3" /> Syncing with the site…
          </span>
        ) : status.error ? (
          <span className="text-destructive">{status.error}</span>
        ) : status.syncedAt ? (
          `Synced ${formatDistanceToNow(status.syncedAt, { addSuffix: true })}`
        ) : (
          "Not synced yet."
        )}
      </p>
      <button
        type="button"
        disabled={status.pending}
        className="self-start text-xs font-medium underline-offset-4 hover:underline disabled:opacity-50"
        onClick={async () => {
          setError(null)
          try {
            await syncNow({ projectId })
          } catch (err) {
            setError(errorText(err))
          }
        }}
      >
        Sync now
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

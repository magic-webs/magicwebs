"use client"

import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  ExternalLink,
  Gamepad2,
  Globe,
  Loader2,
  Monitor,
  PenLine,
  Plug,
  Rocket,
  RotateCw,
  Smartphone,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { errorText } from "@/components/dashboard/lib"
import { PreviewFrame, type Device } from "@/components/editor/preview-frame"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { AccountPanel, useAccountReady } from "./account-panel"
import { BlocksGame } from "./blocks-game"
import {
  card,
  cardPad,
  cardTitle,
  centerFill,
  ghostBtn,
  mono,
  muted,
  mutedSmall,
  narrow,
  narrowCardPad,
  primaryBtn,
  spin,
  textBtn,
} from "./styles"

/** Roughly how long one page takes, to move the bar between real updates. */
const PAGE_SECONDS = 70

const action = cn(
  "group/action flex items-center gap-3.5 rounded-[16px] p-4 bg-white shadow-mw-chip",
  "transition-[box-shadow,transform] duration-200 ease-mw-out hover:shadow-mw-window hover:[transform:translateY(-1px)]",
)
const actionIcon = "grid size-10 flex-none place-items-center rounded-[12px] bg-mw-sunk text-mw-accent [&_svg]:size-[19px]"
const actionText = "flex min-w-0 flex-1 flex-col gap-0.5"
const actionTitle = "text-[15px] font-semibold tracking-[-0.02em]"
const actionBody = "text-mw-subtle text-[13px] leading-[1.35]"
const actionArrow = cn(
  "size-[18px] flex-none text-mw-faint transition-[translate] duration-200 ease-mw-out",
  "group-hover/action:text-mw-fg group-hover/action:translate-x-0.5 group-hover/action:-translate-y-0.5",
)

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

function elapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${String(sec).padStart(2, "0")}`
}

/**
 * The site being built, on the start page: progress with a game to play
 * meanwhile, then the finished site with what to do next. It never moves on
 * by itself; the dashboard is only a click away for a domain or MCP.
 */
export function BuildView({ projectId }: { projectId: Id<"projects"> }) {
  const { ready, loading } = useAccountReady()
  if (loading) {
    return (
      <div className={centerFill}>
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  if (!ready) {
    return (
      <div className={narrow}>
        <div className={cn(card, narrowCardPad)}>
          <AccountPanel
            returnTo={`/start?project=${projectId}`}
            title="Sign in to see your site"
            description="Sign in with the account you started this site with."
          />
        </div>
      </div>
    )
  }
  return <Build projectId={projectId} />
}

function Build({ projectId }: { projectId: Id<"projects"> }) {
  const project = useQuery(api.projects.get, { projectId })
  const pages = useQuery(api.pages.list, { projectId })
  const reclone = useMutation(api.projects.reclone)
  const now = useNow(project?.status === "cloning")
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (project === undefined || pages === undefined) {
    return (
      <div className={centerFill}>
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  if (project === null) {
    return (
      <div className={narrow}>
        <div className={cn(card, cardPad, narrowCardPad)}>
          <h2 className={cardTitle}>We couldn&apos;t find that site</h2>
          <p className={muted}>It may belong to another account, or it was deleted.</p>
          <Link href="/start" className={textBtn}>
            Start a new site
          </Link>
        </div>
      </div>
    )
  }

  const revamp = Boolean(project.template)
  const hostname = new URL(project.sourceUrl).hostname.replace(/^www\./, "")

  if (project.status === "ready") return <Done project={project} pageCount={pages.length} />

  if (project.status === "failed") {
    return (
      <div className={narrow}>
        <div className={cn(card, cardPad, narrowCardPad)}>
          <span className="grid size-11 place-items-center rounded-[14px] bg-[#fff1f1] text-[#d92d20] [&_svg]:size-[22px]">
            <CircleAlert />
          </span>
          <h2 className={cardTitle}>We couldn&apos;t build {hostname}</h2>
          <p className={muted}>{project.error ?? "Something went wrong while reading the site."}</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryBtn}
              disabled={retrying}
              onClick={async () => {
                setRetrying(true)
                setError(null)
                try {
                  await reclone({ projectId })
                } catch (err) {
                  setError(errorText(err))
                } finally {
                  setRetrying(false)
                }
              }}
            >
              {retrying ? <Loader2 className={spin} /> : <RotateCw />}
              Try again
            </button>
            <Link href="/start" className={ghostBtn}>
              Try another address
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const total = Math.max(pages.length, 1)
  const done = pages.filter((p) => p.status !== "cloning").length
  const since = (now - project.createdAt) / 1000
  // The page in hand creeps forward with time, never past 90%, until the next real update.
  const current = 0.9 * (1 - Math.exp(-Math.max(0, since - done * PAGE_SECONDS) / PAGE_SECONDS))
  const pct = Math.min(97, Math.max(4, ((done + current) / total) * 100))
  const phases = [
    "Reading your website",
    revamp ? "Designing your new look" : "Capturing your design",
    total > 1 ? "Building your pages" : "Building your page",
    "Final touches",
  ]
  const phase = pct < 14 ? 0 : pct < 42 ? 1 : pct < 88 ? 2 : 3

  return (
    <div
      className={cn(
        "grid w-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,460px)] items-stretch gap-6 *:min-h-0 *:overflow-y-auto",
        "[@media(max-width:900px)]:grid-cols-[1fr] [@media(max-width:900px)]:*:overflow-visible",
      )}
    >
      <section className={cn(card, cardPad, "gap-[clamp(10px,2dvh,18px)]")} aria-live="polite">
        <div className="inline-flex items-center gap-2 text-mw-accent text-[13px] font-semibold">
          <span
            className="size-2 rounded-full bg-mw-accent [box-shadow:0_0_0_0_#18181b40] animate-[mw-pulse_1.6s_ease-out_infinite]"
            aria-hidden="true"
          />
          {revamp ? "Revamping" : "Rebuilding"} {hostname}
        </div>
        <h2 className="text-[length:clamp(26px,2vw_+_14px,36px)] font-semibold tracking-[-0.04em] leading-[1.1]">
          {revamp ? "Your new website is on its way" : "Your website is being rebuilt"}
        </h2>
        <p className={muted}>
          This takes a few minutes. Play a round while you wait. We&apos;ll show your site right here when it&apos;s
          ready.
        </p>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[34px] font-[650] tracking-[-0.04em] tabular-nums">{Math.round(pct)}%</span>
            <span className={cn(mutedSmall, mono)}>{elapsed(now - project.createdAt)}</span>
          </div>
          <div
            className="relative h-2.5 overflow-hidden rounded-full bg-mw-sunk"
            role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <span
              className={cn(
                "absolute inset-y-0 left-0 rounded-[inherit] bg-[linear-gradient(90deg,#18181b,#52525b,#18181b)] bg-[length:200%_100%]",
                "transition-[width] duration-1000 ease-mw-out animate-[mw-shimmer_2.4s_linear_infinite]",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <ol className="flex flex-col gap-2.5">
          {phases.map((label, i) => (
            <li
              key={label}
              className={cn(
                "group/phase flex items-center gap-2.5 text-mw-faint text-[15px] font-medium transition-[color] duration-300 ease-[ease]",
                "data-[state=done]:text-mw-muted data-[state=active]:text-mw-fg data-[state=active]:font-semibold",
              )}
              data-state={i < phase ? "done" : i === phase ? "active" : "todo"}
            >
              <span
                className={cn(
                  "grid size-6 flex-none place-items-center rounded-full shadow-[inset_0_0_0_1.5px_var(--mw-line)] [&_svg]:size-3.5",
                  "group-data-[state=done]/phase:bg-[#0dbf7f] group-data-[state=done]/phase:shadow-none group-data-[state=done]/phase:text-white",
                  "group-data-[state=active]/phase:shadow-[inset_0_0_0_1.5px_#18181b33] group-data-[state=active]/phase:text-mw-accent",
                )}
              >{i < phase ? <Check /> : i === phase ? <Loader2 className={spin} /> : null}</span>
              {label}
            </li>
          ))}
        </ol>

        {pages.length > 1 && (
          <ul className="flex flex-col gap-0.5 rounded-[16px] p-1.5 bg-mw-surface [&_svg]:size-[15px] [&_svg]:flex-none [&_svg]:text-mw-accent">
            {pages.map((p) => (
              <li
                key={p.path}
                className={cn(
                  "flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[14px]",
                  "data-[state=ready]:[&_svg]:text-[#0a9a66] data-[state=failed]:[&_svg]:text-[#d92d20]",
                )}
                data-state={p.status}
              >
                {p.status === "ready" ? <Check /> : p.status === "failed" ? <CircleAlert /> : <Loader2 className={spin} />}
                <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                <span className={cn(mutedSmall, mono)}>{p.path}</span>
              </li>
            ))}
          </ul>
        )}

        {project.step && <p className={cn("truncate border-t border-mw-line pt-3.5 text-mw-faint text-[12px]", mono)}>{project.step}</p>}
      </section>

      <section
        className={cn(
          card,
          cardPad,
          "gap-[clamp(8px,1.6dvh,16px)]",
          // The board shrinks with the screen so the whole game stays in view.
          "min-[901px]:[&>:last-child]:max-w-[clamp(220px,calc(100dvh_-_380px),400px)]",
        )}
        aria-label="Block puzzle"
      >
        <div className="flex items-center gap-2 text-[15px] font-semibold [&_svg]:size-[18px] [&_svg]:text-mw-accent">
          <Gamepad2 />
          <span>Blocks</span>
          <span className={cn(mutedSmall, "ml-auto font-normal")}>Fill a row or column to clear it</span>
        </div>
        <BlocksGame />
      </section>
    </div>
  )
}

const cardKicker = "inline-flex items-center gap-2 text-[16px] font-semibold tracking-[-0.02em]"

type DoneProject = NonNullable<FunctionReturnType<typeof api.projects.get>>

function Done({ project, pageCount }: { project: DoneProject; pageCount: number }) {
  const draft = useQuery(api.drafts.get, { projectId: project._id })
  const publish = useMutation(api.versions.publish)
  const [device, setDevice] = useState<Device>("desktop")
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const live = Boolean(project.publishedVersionId)
  const liveUrl = `https://${project.hostname}`
  const revamp = Boolean(project.template)

  async function onPublish() {
    setPublishing(true)
    setError(null)
    try {
      await publish({ projectId: project._id, note: "First publish" })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="flex w-full min-h-0 flex-col gap-[clamp(12px,2.4dvh,28px)]">
      <header className="flex flex-none flex-col items-center gap-[clamp(4px,1dvh,10px)] text-center">
        <span className="grid size-[clamp(36px,5.6dvh,52px)] place-items-center rounded-full bg-[linear-gradient(135deg,#0dbf7f,#0a9a66)] shadow-[0_12px_28px_-10px_#0a9a6699] text-white animate-[mw-badge_0.7s_var(--ease-mw-soft)] [&_svg]:size-[26px]">
          <Check />
        </span>
        <h2 className="text-[length:clamp(24px,min(3vw_+_14px,5dvh),48px)] font-semibold tracking-[-0.045em] leading-[1.05]">{revamp ? "Your new website is ready" : "Your website is ready"}</h2>
        <p className={muted}>
          {pageCount === 1 ? "1 page" : `${pageCount} pages`} built from {new URL(project.sourceUrl).hostname}.
          {project.error ? ` ${project.error}.` : ""} Have a look, then put it live.
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] items-stretch gap-6 [@media(max-width:960px)]:flex-none [@media(max-width:960px)]:grid-cols-[1fr]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-[16px] bg-white shadow-mw-window">
          <div className="flex flex-none items-center gap-3 border-b border-mw-line px-3 py-2.5 bg-mw-surface">
            <span className="flex gap-1.5 *:size-2.5 *:rounded-full *:bg-[#e2e2e2]" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate rounded-[8px] px-2.5 py-1 bg-white shadow-mw-chip text-mw-muted text-[12px] text-center",
                mono,
              )}
            >
              {project.hostname}
            </span>
            <div className="flex gap-0.5 rounded-[8px] p-0.5 bg-mw-sunk" role="radiogroup" aria-label="Preview size">
              {(
                [
                  ["desktop", Monitor, "Desktop"],
                  ["mobile", Smartphone, "Mobile"],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={device === id}
                  aria-label={label}
                  className="grid h-6 w-7 place-items-center rounded-[6px] text-mw-faint aria-checked:bg-white aria-checked:shadow-mw-chip aria-checked:text-mw-fg [&_svg]:size-3.5"
                  onClick={() => setDevice(id)}
                >
                  <Icon />
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 [@media(max-width:960px)]:h-[60dvh] [@media(max-width:960px)]:flex-none">
            {draft ? (
              <PreviewFrame doc={draft.doc} device={device} selectedId={null} onSelect={() => {}} />
            ) : (
              <div className={centerFill}>
                <Spinner className="size-5 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-[clamp(8px,1.4dvh,12px)] overflow-y-auto *:flex-none">
          <div className={cn(card, cardPad, "gap-2.5 p-5")}>
            {live ? (
              <>
                <p className={cardKicker}>
                  <span className="size-2 rounded-full bg-[#0dbf7f] shadow-[0_0_0_4px_#0dbf7f2e]" aria-hidden="true" /> Live
                </p>
                <a href={liveUrl} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1.5 text-mw-link text-[14px] break-all [&_svg]:size-3.5 [&_svg]:flex-none", mono)}>
                  {project.hostname}
                  <ExternalLink />
                </a>
              </>
            ) : (
              <>
                <p className={cardKicker}>Ready to go live</p>
                <p className={mutedSmall}>
                  Publish to <span className={mono}>{project.hostname}</span>. You can connect your own domain after.
                </p>
                <button type="button" className={primaryBtn} onClick={onPublish} disabled={publishing}>
                  {publishing ? <Loader2 className={spin} /> : <Rocket />}
                  Publish my site
                </button>
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <Link href={`/projects/${project._id}`} className={action}>
            <span className={actionIcon}>
              <PenLine />
            </span>
            <span className={actionText}>
              <strong className={actionTitle}>Edit your site</strong>
              <span className={actionBody}>Change anything with clicks or by chatting with AI</span>
            </span>
            <ArrowUpRight className={actionArrow} />
          </Link>
          <Link href={`/dashboard/domains?project=${project._id}`} className={action}>
            <span className={actionIcon}>
              <Globe />
            </span>
            <span className={actionText}>
              <strong className={actionTitle}>Connect your domain</strong>
              <span className={actionBody}>Put it on yourbusiness.com with free HTTPS</span>
            </span>
            <ArrowUpRight className={actionArrow} />
          </Link>
          <Link href="/dashboard/mcp" className={action}>
            <span className={actionIcon}>
              <Plug />
            </span>
            <span className={actionText}>
              <strong className={actionTitle}>Connect your AI agent</strong>
              <span className={actionBody}>Edit from Claude, Cursor or any MCP client</span>
            </span>
            <ArrowUpRight className={actionArrow} />
          </Link>
        </aside>
      </div>
    </div>
  )
}

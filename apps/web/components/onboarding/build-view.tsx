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

import { AccountPanel, useAccountReady } from "./account-panel"
import { BlocksGame } from "./blocks-game"
import s from "./onboarding.module.css"

/** Roughly how long one page takes, to move the bar between real updates. */
const PAGE_SECONDS = 70

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
      <div className={s.centerFill}>
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  if (!ready) {
    return (
      <div className={s.narrow}>
        <div className={s.card}>
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
      <div className={s.centerFill}>
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  if (project === null) {
    return (
      <div className={s.narrow}>
        <div className={`${s.card} ${s.cardPad}`}>
          <h2 className={s.cardTitle}>We couldn&apos;t find that site</h2>
          <p className={s.muted}>It may belong to another account, or it was deleted.</p>
          <Link href="/start" className={s.textLink}>
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
      <div className={s.narrow}>
        <div className={`${s.card} ${s.cardPad}`}>
          <span className={s.failIcon}>
            <CircleAlert />
          </span>
          <h2 className={s.cardTitle}>We couldn&apos;t build {hostname}</h2>
          <p className={s.muted}>{project.error ?? "Something went wrong while reading the site."}</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className={s.row}>
            <button
              type="button"
              className={s.primaryBtn}
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
              {retrying ? <Loader2 className={s.spin} /> : <RotateCw />}
              Try again
            </button>
            <Link href="/start" className={s.ghostBtn}>
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
    <div className={s.buildGrid}>
      <section className={`${s.card} ${s.cardPad} ${s.progressCard}`} aria-live="polite">
        <div className={s.eyebrow}>
          <span className={s.pulse} aria-hidden="true" />
          {revamp ? "Revamping" : "Rebuilding"} {hostname}
        </div>
        <h2 className={s.buildTitle}>
          {revamp ? "Your new website is on its way" : "Your website is being rebuilt"}
        </h2>
        <p className={s.muted}>
          This takes a few minutes. Play a round while you wait. We&apos;ll show your site right here when it&apos;s
          ready.
        </p>

        <div className={s.progress}>
          <div className={s.progressTop}>
            <span className={s.pct}>{Math.round(pct)}%</span>
            <span className={`${s.mutedSmall} ${s.mono}`}>{elapsed(now - project.createdAt)}</span>
          </div>
          <div className={s.bar} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>

        <ol className={s.phases}>
          {phases.map((label, i) => (
            <li key={label} data-state={i < phase ? "done" : i === phase ? "active" : "todo"}>
              <span className={s.phaseIcon}>{i < phase ? <Check /> : i === phase ? <Loader2 className={s.spin} /> : null}</span>
              {label}
            </li>
          ))}
        </ol>

        {pages.length > 1 && (
          <ul className={s.pageList}>
            {pages.map((p) => (
              <li key={p.path} data-state={p.status}>
                {p.status === "ready" ? <Check /> : p.status === "failed" ? <CircleAlert /> : <Loader2 className={s.spin} />}
                <span className={s.pageTitle}>{p.title}</span>
                <span className={`${s.mutedSmall} ${s.mono}`}>{p.path}</span>
              </li>
            ))}
          </ul>
        )}

        {project.step && <p className={`${s.stepLine} ${s.mono}`}>{project.step}</p>}
      </section>

      <section className={`${s.card} ${s.cardPad} ${s.gameCard}`} aria-label="Block puzzle">
        <div className={s.gameHead}>
          <Gamepad2 />
          <span>Blocks</span>
          <span className={s.mutedSmall}>Fill a row or column to clear it</span>
        </div>
        <BlocksGame />
      </section>
    </div>
  )
}

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
    <div className={s.doneWrap}>
      <header className={s.doneHead}>
        <span className={s.doneBadge}>
          <Check />
        </span>
        <h2 className={s.doneTitle}>{revamp ? "Your new website is ready" : "Your website is ready"}</h2>
        <p className={s.muted}>
          {pageCount === 1 ? "1 page" : `${pageCount} pages`} built from {new URL(project.sourceUrl).hostname}.
          {project.error ? ` ${project.error}.` : ""} Have a look, then put it live.
        </p>
      </header>

      <div className={s.doneGrid}>
        <div className={s.window}>
          <div className={s.windowBar}>
            <span className={s.dots} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className={`${s.address} ${s.mono}`}>{project.hostname}</span>
            <div className={s.deviceToggle} role="radiogroup" aria-label="Preview size">
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
                  onClick={() => setDevice(id)}
                >
                  <Icon />
                </button>
              ))}
            </div>
          </div>
          <div className={s.windowBody}>
            {draft ? (
              <PreviewFrame doc={draft.doc} device={device} selectedId={null} onSelect={() => {}} />
            ) : (
              <div className={s.centerFill}>
                <Spinner className="size-5 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        <aside className={s.nextSteps}>
          <div className={`${s.card} ${s.cardPad} ${s.publishCard}`}>
            {live ? (
              <>
                <p className={s.cardKicker}>
                  <span className={s.liveDot} aria-hidden="true" /> Live
                </p>
                <a href={liveUrl} target="_blank" rel="noreferrer" className={`${s.liveLink} ${s.mono}`}>
                  {project.hostname}
                  <ExternalLink />
                </a>
              </>
            ) : (
              <>
                <p className={s.cardKicker}>Ready to go live</p>
                <p className={s.mutedSmall}>
                  Publish to <span className={s.mono}>{project.hostname}</span>. You can connect your own domain after.
                </p>
                <button type="button" className={s.primaryBtn} onClick={onPublish} disabled={publishing}>
                  {publishing ? <Loader2 className={s.spin} /> : <Rocket />}
                  Publish my site
                </button>
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <Link href={`/projects/${project._id}`} className={s.action}>
            <span className={s.actionIcon}>
              <PenLine />
            </span>
            <span className={s.actionText}>
              <strong>Edit your site</strong>
              <span>Change anything with clicks or by chatting with AI</span>
            </span>
            <ArrowUpRight className={s.actionArrow} />
          </Link>
          <Link href={`/dashboard/domains?project=${project._id}`} className={s.action}>
            <span className={s.actionIcon}>
              <Globe />
            </span>
            <span className={s.actionText}>
              <strong>Connect your domain</strong>
              <span>Put it on yourbusiness.com with free HTTPS</span>
            </span>
            <ArrowUpRight className={s.actionArrow} />
          </Link>
          <Link href="/dashboard/mcp" className={s.action}>
            <span className={s.actionIcon}>
              <Plug />
            </span>
            <span className={s.actionText}>
              <strong>Connect your AI agent</strong>
              <span>Edit from Claude, Cursor or any MCP client</span>
            </span>
            <ArrowUpRight className={s.actionArrow} />
          </Link>
        </aside>
      </div>
    </div>
  )
}

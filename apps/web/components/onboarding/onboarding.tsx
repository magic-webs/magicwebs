"use client"

import { useAction, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { ArrowLeft, ArrowRight, Check, ChevronDown, Copy, Globe, Loader2, Sparkles, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"
import { getTemplate, MAX_SITE_PAGES, type TemplateId } from "@magicwebs/page-schema"

import { errorText, useProjectDefaults } from "@/components/dashboard/lib"
import { PagePicker } from "@/components/dashboard/page-picker"
import { TemplatePicker } from "@/components/dashboard/template-picker"
import l from "@/components/landing/landing.module.css"
import { AccountChip, AccountLoading } from "@/components/landing/account-chip"
import { Logo } from "@/components/landing/ui"
import { cn } from "@/lib/utils"

import { AccountPanel, useAccountReady } from "./account-panel"
import { BuildView } from "./build-view"
import s from "./onboarding.module.css"

type Mode = "copy" | "revamp"
type DiscoveredSite = FunctionReturnType<typeof api.pages.discover>

/** What the visitor has chosen so far, kept for the trip to Google and back. */
type Plan = {
  url: string
  site: DiscoveredSite | null
  confirmed: boolean
  mode: Mode | null
  template: TemplateId | null
  extra: string[]
  pending: boolean
}

const STORAGE_KEY = "magicwebs:start"
const EMPTY: Plan = { url: "", site: null, confirmed: false, mode: null, template: null, extra: [], pending: false }

function loadPlan(): Plan | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : null
  } catch {
    return null
  }
}

function savePlan(plan: Plan | null) {
  try {
    if (plan) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be blocked; the flow still works without the Google round trip.
  }
}

const STEPS = ["Your site", "Confirm", "Choose", "Build"] as const

function Stepper({ current }: { current: number }) {
  return (
    <ol className={s.stepper} aria-label="Progress">
      {STEPS.map((label, i) => (
        <li key={label} data-state={i < current ? "done" : i === current ? "active" : "todo"} aria-current={i === current ? "step" : undefined}>
          <span className={s.stepDot}>{i < current ? <Check /> : i + 1}</span>
          <span className={s.stepLabel}>{label}</span>
        </li>
      ))}
    </ol>
  )
}

function PrimaryButton({
  children,
  busy,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button {...props} className={cn(l.darkBtn, s.bigBtn, props.className)} disabled={props.disabled || busy}>
      <span className={l.darkLabel}>{children}</span>
      {busy ? <Loader2 className={cn(l.chev, s.spin)} /> : <ArrowRight className={l.chev} />}
    </button>
  )
}

function Header({ returnTo }: { returnTo: string }) {
  const { ready, loading, isAuthenticated } = useAccountReady()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onDown)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onDown)
    }
  }, [open])

  return (
    <header className={s.header}>
      <Logo />
      <div className={s.headerRight} ref={panelRef}>
        {loading ? (
          <AccountLoading />
        ) : isAuthenticated ? (
          <AccountChip />
        ) : (
          <button type="button" className={s.headerLink} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            Log in
          </button>
        )}
        {/* Signing in hides the panel and leaves the visitor where they were. */}
        {open && !ready && (
          <div className={s.loginPop} role="dialog" aria-label="Log in">
            <button type="button" className={s.popClose} onClick={() => setOpen(false)} aria-label="Close">
              <X />
            </button>
            <AccountPanel
              returnTo={returnTo}
              title="Create your account"
              description="One Magic account for your websites and their AI agents."
            />
          </div>
        )}
      </div>
    </header>
  )
}

/** What to show first: a saved plan (back from Google), else the address from the landing page. */
function initialPlan(initialUrl: string | undefined): Plan {
  const saved = loadPlan()
  if (saved?.site && (!initialUrl || saved.url === initialUrl)) return saved
  return { ...EMPTY, url: initialUrl ?? "" }
}

/** Rendered in the browser only (see StartClient), so the saved plan can be read straight away. */
export function Onboarding({ initialUrl, projectId: initialProject }: { initialUrl?: string; projectId?: string }) {
  const router = useRouter()
  const discover = useAction(api.pages.discover)
  const create = useMutation(api.projects.create)
  const [defaults] = useProjectDefaults()
  const { ready } = useAccountReady()

  const [projectId, setProjectId] = useState<Id<"projects"> | null>((initialProject as Id<"projects">) ?? null)
  const [plan, setPlan] = useState<Plan>(() => (initialProject ? EMPTY : initialPlan(initialUrl)))
  // An address from the landing page is checked as soon as the page opens.
  const [checking, setChecking] = useState(() => Boolean(!initialProject && initialUrl && !plan.site))
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(false)
  const update = (patch: Partial<Plan>) => setPlan((p) => ({ ...p, ...patch }))

  const lookUp = useCallback(
    (address: string) =>
      discover({ url: address })
        .then((site) => setPlan((p) => ({ ...p, url: address, site, confirmed: false, pending: false, extra: [] })))
        .catch((err) => setError(errorText(err, "We couldn't open that site. Check the address and that it's public.")))
        .finally(() => setChecking(false)),
    [discover],
  )

  function check(address: string) {
    const trimmed = address.trim()
    if (!trimmed) return
    setChecking(true)
    setError(null)
    update({ url: trimmed, site: null, confirmed: false, pending: false })
    void lookUp(trimmed)
  }

  useEffect(() => {
    if (checking && !plan.site) void lookUp(plan.url.trim())
    // Only on opening the page: later checks start from the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!projectId) savePlan(plan.url ? plan : null)
  }, [plan, projectId])

  // Once they've asked to build and are signed in (here or back from Google), build.
  useEffect(() => {
    const site = plan.site
    if (!plan.pending || !ready || projectId || !site || startedRef.current) return
    startedRef.current = true
    const pages = site.pages.slice(1).filter((p) => plan.extra.includes(p.path))
    create({
      url: site.url,
      model: defaults.model,
      effort: defaults.effort,
      template: plan.mode === "revamp" ? (plan.template ?? undefined) : undefined,
      pages: pages.map((p) => ({ url: p.url, title: p.title })),
    })
      .then((id) => {
        savePlan(null)
        setProjectId(id)
        router.replace(`/start?project=${id}`, { scroll: false })
      })
      .catch((err) => {
        startedRef.current = false
        setError(errorText(err))
        setPlan((p) => ({ ...p, pending: false }))
      })
  }, [plan, ready, projectId, create, defaults, router])

  const returnTo = projectId ? `/start?project=${projectId}` : "/start?resume=1"

  let step: number
  let body: React.ReactNode
  if (projectId) {
    step = 3
    body = <BuildView projectId={projectId} />
  } else if (!plan.site) {
    step = 0
    body = <EnterStep url={plan.url} checking={checking} error={error} onUrl={(url) => update({ url })} onSubmit={check} />
  } else if (!plan.confirmed) {
    step = 1
    body = (
      <ConfirmStep
        site={plan.site}
        onConfirm={() => update({ confirmed: true })}
        onReject={() => {
          setError(null)
          update({ site: null, confirmed: false })
        }}
      />
    )
  } else if (plan.pending && !ready) {
    step = 2
    body = (
      <div className={s.narrow}>
        <BackLink onClick={() => update({ pending: false })}>Back</BackLink>
        <div className={s.card}>
          <AccountPanel
            returnTo={returnTo}
            title="Save your site to an account"
            description="So you can edit it, publish it and come back to it. It takes a moment, and we'll start building right after."
          />
        </div>
      </div>
    )
  } else {
    step = 2
    body = (
      <ChooseStep
        plan={plan}
        error={error}
        busy={plan.pending && ready}
        onChange={(patch) => {
          setError(null)
          update(patch)
        }}
        onBack={() => update({ confirmed: false })}
        onStart={() => {
          if (plan.mode === "revamp" && !plan.template) return setError("Choose a style for your new look first.")
          setError(null)
          update({ pending: true })
        }}
      />
    )
  }

  return (
    <div className={cn(l.page, "light", s.root)}>
      <div className={s.bg} aria-hidden="true">
        <div className={l.heroGrid} />
      </div>
      <Header returnTo={returnTo} />
      <main className={s.main}>
        {!projectId && <Stepper current={step} />}
        <div key={step} className={s.stage}>
          {body}
        </div>
      </main>
    </div>
  )
}

function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={s.back} onClick={onClick}>
      <ArrowLeft />
      {children}
    </button>
  )
}

function EnterStep({
  url,
  checking,
  error,
  onUrl,
  onSubmit,
}: {
  url: string
  checking: boolean
  error: string | null
  onUrl: (url: string) => void
  onSubmit: (url: string) => void
}) {
  return (
    <div className={s.enter}>
      <div className={s.intro}>
        <span className={s.kicker}>
          <Sparkles /> Revamp it or rebuild it exactly
        </span>
        <h1 className={s.h1}>What&apos;s your website?</h1>
        <p className={s.lead}>
          Enter its address. We&apos;ll find it, then give it a fresh new look or rebuild it exactly, ready for you to
          edit and publish.
        </p>
      </div>
      <form
        className={s.urlForm}
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(url)
        }}
      >
        <Globe className={s.urlIcon} aria-hidden="true" />
        <input
          className={s.urlInput}
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          placeholder="yourbusiness.com"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Your website's address"
          autoFocus
          disabled={checking}
        />
        <PrimaryButton type="submit" busy={checking} disabled={!url.trim()}>
          {checking ? "Finding it…" : "Continue"}
        </PrimaryButton>
      </form>
      {checking && <p className={s.checking}>Looking up {url.trim()} and its pages…</p>}
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
    </div>
  )
}

function ConfirmStep({ site, onConfirm, onReject }: { site: DiscoveredSite; onConfirm: () => void; onReject: () => void }) {
  const hostname = new URL(site.url).hostname
  const [imageOk, setImageOk] = useState(true)
  const [imageFit, setImageFit] = useState<"cover" | "contain">("cover")
  const [iconOk, setIconOk] = useState(true)
  return (
    <div className={s.narrow}>
      <div className={s.intro}>
        <h1 className={s.h2}>Is this your website?</h1>
        <p className={s.lead}>Here&apos;s what we found. Make sure it&apos;s the right one before we start.</p>
      </div>
      <div className={s.siteCard}>
        {/* The live site when it allows framing (a preview image is often just a logo), else its image. */}
        {site.frameable ? (
          <LivePreview url={site.url} />
        ) : site.image && imageOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={s.siteImage}
            data-fit={imageFit}
            src={site.image}
            alt=""
            onError={() => setImageOk(false)}
            // A squarish image is usually a logo: show it whole rather than cropped.
            onLoad={(e) => setImageFit(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight < 1.5 ? "contain" : "cover")}
          />
        ) : (
          <div className={s.siteImageEmpty} aria-hidden="true">
            <Globe />
          </div>
        )}
        <div className={s.siteInfo}>
          <div className={s.siteTitleRow}>
            {iconOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={s.favicon} src={site.icon} alt="" onError={() => setIconOk(false)} />
            ) : (
              <Globe className={s.favicon} />
            )}
            <div className={s.siteNames}>
              <p className={s.siteTitle}>{site.title}</p>
              <a href={site.url} target="_blank" rel="noreferrer" className={`${s.siteHost} ${l.mono}`}>
                {hostname}
              </a>
            </div>
          </div>
          {site.description && <p className={s.siteDesc}>{site.description}</p>}
          <p className={s.sitePages}>
            <Check /> {site.pages.length === 1 ? "1 page found" : `${site.pages.length} pages found`}
          </p>
        </div>
      </div>
      <div className={s.actionsRow}>
        <button type="button" className={l.ghostBtn} onClick={onReject}>
          No, try another address
        </button>
        <PrimaryButton type="button" onClick={onConfirm} autoFocus>
          Yes, that&apos;s my site
        </PrimaryButton>
      </div>
    </div>
  )
}

/** Width the live preview lays the site out at before scaling it into the card. */
const PREVIEW_WIDTH = 1280

/** The site itself, scaled down into the card, for sites without a preview image. */
function LivePreview({ url }: { url: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ scale: 0.4, height: 300 })
  const [loaded, setLoaded] = useState(false)

  // The box's height follows the screen; the site is laid out wide and scaled to fill it.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect
      setSize({ scale: width / PREVIEW_WIDTH, height })
    })
    ro.observe(box)
    return () => ro.disconnect()
  }, [])
  const { scale } = size

  return (
    <div ref={boxRef} className={s.livePreview} data-loaded={loaded || undefined}>
      <iframe
        title="Your website"
        src={url}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        tabIndex={-1}
        aria-hidden="true"
        onLoad={() => setLoaded(true)}
        style={{ width: PREVIEW_WIDTH, height: size.height / scale, transform: `scale(${scale})` }}
      />
      {!loaded && (
        <div className={s.liveLoading} aria-hidden="true">
          <Loader2 className={s.spin} />
        </div>
      )}
    </div>
  )
}

const MODES: { value: Mode; title: string; body: string; Icon: typeof Sparkles; tag?: string }[] = [
  {
    value: "revamp",
    title: "Revamp it",
    body: "A fresh, modern design with your words, photos and links. Pick a style below.",
    Icon: Sparkles,
  },
  {
    value: "copy",
    title: "Keep my design",
    body: "Rebuild it exactly as it looks today, so you can edit, improve and host it here.",
    Icon: Copy,
  },
]

function ChooseStep({
  plan,
  error,
  busy,
  onChange,
  onBack,
  onStart,
}: {
  plan: Plan
  error: string | null
  busy: boolean
  onChange: (patch: Partial<Plan>) => void
  onBack: () => void
  onStart: () => void
}) {
  const site = plan.site!
  const hostname = new URL(site.url).hostname
  const [showPages, setShowPages] = useState(false)
  const selected = new Set(plan.extra)
  const count = selected.size + 1
  const template = plan.template ? getTemplate(plan.template) : undefined

  return (
    <div className={s.choose}>
      <BackLink onClick={onBack}>{hostname}</BackLink>
      <div className={s.intro}>
        <h1 className={s.h2}>What should we do with it?</h1>
        <p className={`${s.lead} ${s.chooseLead}`}>You can change your mind later. Every page stays fully editable.</p>
      </div>

      <div className={s.modes} role="radiogroup" aria-label="What to make" data-picked={plan.mode ? "" : undefined}>
        {MODES.map(({ value, title, body, Icon, tag }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={plan.mode === value}
            className={s.mode}
            onClick={() => onChange({ mode: value })}
          >
            <span className={s.modeTop}>
              <span className={s.modeIcon}>
                <Icon />
              </span>
              {tag && <span className={s.modeTag}>{tag}</span>}
              <span className={s.modeCheck} aria-hidden="true">
                <Check />
              </span>
            </span>
            <span className={s.modeTitle}>{title}</span>
            <span className={s.modeBody}>{body}</span>
          </button>
        ))}
      </div>

      {plan.mode === "revamp" && (
        // Folds to one line while the page list is open, so each list gets the room it needs.
        <section className={`${s.panel} ${s.stylePanel}`} data-open={!showPages || undefined}>
          <button type="button" className={s.panelToggle} aria-expanded={!showPages} onClick={() => setShowPages(false)}>
            <span>
              <strong>Choose a style</strong>
              <span className={s.mutedSmall}>{template ? template.name : "None picked yet"}</span>
            </span>
            <ChevronDown data-open={!showPages || undefined} />
          </button>
          {!showPages && (
            <TemplatePicker
              className={`max-h-none ${s.panelScroll}`}
              value={plan.template}
              onChange={(t) => onChange({ template: t })}
            />
          )}
        </section>
      )}

      {plan.mode && site.pages.length > 1 && (
        <section className={`${s.panel} ${s.pagesPanel}`} data-open={showPages || undefined}>
          <button type="button" className={s.panelToggle} aria-expanded={showPages} onClick={() => setShowPages((v) => !v)}>
            <span>
              <strong>Pages</strong>
              {!showPages && (
                <span className={s.mutedSmall}>
                  {count === 1 ? "Home page only" : `${count} pages`} · {site.pages.length} found
                </span>
              )}
            </span>
            <ChevronDown data-open={showPages || undefined} />
          </button>
          {showPages && (
            <PagePicker
              pages={site.pages}
              selected={selected}
              onChange={(next) => onChange({ extra: [...next] })}
              locked={new Map([[site.pages[0]!.path, "Home"]])}
              max={MAX_SITE_PAGES}
            />
          )}
        </section>
      )}

      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}

      {plan.mode && (
        <div className={s.startBar}>
          <p className={s.mutedSmall}>
            {plan.mode === "revamp"
              ? template
                ? `Revamp ${hostname} in the ${template.name} style`
                : "Pick a style to continue"
              : `Rebuild ${hostname} exactly`}
            {" · "}
            {count === 1 ? "1 page" : `${count} pages`}
          </p>
          <PrimaryButton type="button" onClick={onStart} busy={busy} disabled={plan.mode === "revamp" && !plan.template}>
            {busy ? "Starting…" : "Start building"}
          </PrimaryButton>
        </div>
      )}
    </div>
  )
}

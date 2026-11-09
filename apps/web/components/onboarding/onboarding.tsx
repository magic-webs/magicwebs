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
import { AccountChip, AccountLoading } from "@/components/landing/account-chip"
import { Logo, mw } from "@/components/landing/ui"
import { cn } from "@/lib/utils"

import { AccountPanel, useAccountReady } from "./account-panel"
import { BuildView } from "./build-view"
import { card, error as errorClass, intro, lead, mutedSmall, narrow, narrowCardPad, spin } from "./styles"

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

// ---------- Classes ----------

const hoverTint = "hover:bg-[#8080801f]"
const h2 =
  "text-[length:clamp(24px,min(2.6vw_+_14px,4.6dvh),42px)] font-semibold tracking-[-0.04em] leading-[1.08] text-balance"

/** One choice card. The radiogroup (`group/modes`) carries data-picked, the card (`group/mode`) aria-checked. */
const modeCard = cn(
  "group/mode relative flex flex-col gap-[clamp(4px,0.8dvh,8px)] rounded-[24px] bg-white shadow-mw-window text-left",
  "pt-[clamp(12px,2.2dvh,20px)] pr-[22px] pb-[clamp(12px,2.4dvh,22px)] pl-[22px]",
  "transition-[box-shadow,transform] duration-[250ms] ease-mw-out hover:[transform:translateY(-2px)]",
  "aria-checked:shadow-[0_0_0_2px_var(--mw-accent),0_24px_48px_-20px_#00000026]",
  "[@media(max-width:640px)]:pt-3 [@media(max-width:640px)]:pr-3.5 [@media(max-width:640px)]:pb-3.5 [@media(max-width:640px)]:pl-3.5",
  // Once a choice is made the cards become one line (icon, title, check) to leave room for the lists.
  "group-data-[picked]/modes:flex-row group-data-[picked]/modes:items-center group-data-[picked]/modes:gap-3 group-data-[picked]/modes:rounded-[16px]",
  "group-data-[picked]/modes:pt-2.5 group-data-[picked]/modes:pr-3.5 group-data-[picked]/modes:pb-2.5 group-data-[picked]/modes:pl-2.5",
)
const modeTop = "flex items-center gap-2 mb-[clamp(0px,0.6dvh,6px)] group-data-[picked]/modes:contents"
const modeIcon = cn(
  "grid size-10 place-items-center rounded-[12px] bg-mw-sunk text-mw-accent [&_svg]:size-5",
  "[@media(max-width:640px)]:size-8 [@media(max-width:640px)]:rounded-[10px]",
  "group-data-[picked]/modes:size-[34px] group-data-[picked]/modes:rounded-[10px] group-data-[picked]/modes:[&_svg]:size-[17px]",
)
const modeTag = "rounded-full px-[9px] py-0.5 bg-[#fff6db] text-[#8a5a00] text-[12px] font-semibold"
const modeCheck = cn(
  "grid size-[22px] place-items-center ml-auto rounded-full shadow-[inset_0_0_0_1.5px_var(--mw-line)] text-transparent",
  "transition-all duration-200 ease-mw-out [&_svg]:size-[13px]",
  "group-aria-checked/mode:bg-mw-accent group-aria-checked/mode:shadow-none group-aria-checked/mode:text-white",
  "group-data-[picked]/modes:order-2",
)
const modeTitle = cn(
  "text-[19px] font-semibold tracking-[-0.03em] [@media(max-width:640px)]:text-[16px]",
  "group-data-[picked]/modes:order-1 group-data-[picked]/modes:text-[16px]",
)
// On short or narrow screens the cards keep just their titles, side by side.
const modeBody =
  "text-mw-subtle text-[14px] leading-[1.45] [@media(max-height:760px),(max-width:640px)]:hidden group-data-[picked]/modes:hidden"

/** A fold-out list on the Choose step: open, it shares the height left over; closed, it's just its one-line header. */
const panel = cn(
  "flex min-h-0 flex-col gap-[clamp(8px,1.4dvh,14px)] rounded-[24px] p-[clamp(12px,2dvh,20px)] bg-[#ffffffd9] shadow-mw-chip",
  "animate-[mw-rise_0.45s_var(--ease-mw-out)]",
  "data-[open]:min-h-[150px] data-[open]:flex-[1_1_0] [&:not([data-open])]:py-3",
)
/** One line: title, then what's chosen, then the chevron. */
const panelToggle = "flex items-center justify-between gap-3 text-left"
const panelToggleText = "flex min-w-0 items-baseline gap-2.5"
const panelToggleTitle = "text-[16px] font-semibold tracking-[-0.02em]"
const panelChevron =
  "size-[18px] flex-none text-mw-subtle transition-[rotate] duration-200 ease-mw-out data-[open]:rotate-180"

function Stepper({ current }: { current: number }) {
  return (
    <ol
      className="flex flex-none items-center gap-1.5 rounded-full p-[5px] bg-[#ffffffcc] shadow-mw-badge text-[13px] font-[550]"
      aria-label="Progress"
    >
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={cn(
            "group/step flex items-center gap-[7px] rounded-full py-1 pr-3 pl-[5px] text-mw-faint",
            "transition-[background-color,color] duration-300 ease-mw-out",
            "data-[state=active]:bg-[#1c1c1c] data-[state=active]:text-white data-[state=done]:text-mw-strong",
            "[@media(max-width:560px)]:[&:not([data-state=active])]:pr-[5px]",
          )}
          data-state={i < current ? "done" : i === current ? "active" : "todo"}
          aria-current={i === current ? "step" : undefined}
        >
          <span
            className={cn(
              "grid size-[22px] place-items-center rounded-full bg-mw-sunk text-[12px] tabular-nums [&_svg]:size-[13px]",
              "group-data-[state=active]/step:bg-white group-data-[state=active]/step:text-[#18181b]",
              "group-data-[state=done]/step:bg-[#18181b12] group-data-[state=done]/step:text-mw-accent",
            )}
          >
            {i < current ? <Check /> : i + 1}
          </span>
          <span className="[@media(max-width:560px)]:group-[:not([data-state=active])]/step:hidden">{label}</span>
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
    <button
      {...props}
      className={cn(
        mw.darkBtn,
        "h-12 min-w-0 flex-none pl-[26px] pr-[22px] text-[15px] disabled:cursor-not-allowed disabled:opacity-55",
        props.className,
      )}
      disabled={props.disabled || busy}
    >
      <span className={mw.darkLabel}>{children}</span>
      {busy ? <Loader2 className={cn(mw.chev, spin)} /> : <ArrowRight className={mw.chev} />}
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
    <header
      className={cn(
        "relative z-20 flex flex-none items-center justify-between gap-3 py-[clamp(8px,1.6dvh,14px)] px-4 sm:px-6",
        "bg-[#ffffffb3] backdrop-blur-[14px] backdrop-saturate-[1.4] shadow-[0_1px_0_#0000000d]",
      )}
    >
      <Logo />
      <div className="relative flex items-center gap-1" ref={panelRef}>
        {loading ? (
          <AccountLoading />
        ) : isAuthenticated ? (
          <AccountChip />
        ) : (
          <button
            type="button"
            className={cn(
              "inline-flex h-[34px] items-center gap-1.5 rounded-full px-3.5 text-mw-strong text-[14px] font-medium",
              "transition-[background-color] duration-200 ease-mw-out [&_svg]:size-4",
              hoverTint,
            )}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            Log in
          </button>
        )}
        {/* Signing in hides the panel and leaves the visitor where they were. */}
        {open && !ready && (
          <div
            className={cn(
              "absolute top-[calc(100%+10px)] right-0 w-[min(380px,calc(100vw-32px))] sm:w-[min(380px,calc(100vw-48px))]",
              "max-h-[calc(100svh-90px)] overflow-y-auto rounded-[24px] p-[22px] bg-white shadow-mw-window",
              "animate-[mw-pop_0.25s_var(--ease-mw-out)] motion-reduce:animate-none",
            )}
            role="dialog"
            aria-label="Log in"
          >
            <button
              type="button"
              className={cn(
                "absolute top-3 right-3 grid size-7 place-items-center rounded-full text-mw-subtle [&_svg]:size-4",
                hoverTint,
              )}
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
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
      <div className={narrow}>
        <BackLink onClick={() => update({ pending: false })}>Back</BackLink>
        <div className={cn(card, narrowCardPad)}>
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
    // Exactly one screen tall: each step sizes its content to the viewport instead of scrolling the page.
    // The accent is neutral ink here, not the landing page's purple.
    <div className={cn(mw.page, "light", "relative flex h-dvh min-h-0 flex-col overflow-hidden font-mw [--mw-accent:#18181b]")}>
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
        <div className={mw.heroGrid} />
      </div>
      <Header returnTo={returnTo} />
      {/* Scrolls only when a step can't fit, e.g. a tiny screen or the sign-up form. */}
      <main
        className={cn(
          "relative z-[1] mx-auto flex w-full max-w-[1212px] sm:max-w-[1228px] min-h-0 flex-1 flex-col items-center gap-[clamp(12px,3dvh,32px)] overflow-y-auto",
          "pt-[clamp(12px,2.6dvh,32px)] pb-[clamp(12px,2.6dvh,28px)] px-4 sm:px-6",
        )}
      >
        {!projectId && <Stepper current={step} />}
        <div
          key={step}
          className="flex w-full min-h-0 flex-1 justify-center animate-[mw-rise_0.6s_var(--ease-mw-out)] motion-reduce:animate-none"
        >
          {body}
        </div>
      </main>
    </div>
  )
}

function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 self-start rounded-full py-1.5 pr-3 pl-2 text-mw-muted text-[14px] font-medium [&_svg]:size-4",
        hoverTint,
      )}
      onClick={onClick}
    >
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
    // Just below the steps, with room that grows a little on tall screens.
    <div className="flex w-full max-w-[720px] flex-col items-center gap-[clamp(18px,4dvh,32px)] mt-[clamp(8px,7dvh,88px)] mb-auto">
      <div className={intro}>
        <span className="inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-2.5 bg-[#fafbfb] shadow-mw-badge text-[13px] font-semibold [&_svg]:size-[15px] [&_svg]:text-mw-accent">
          <Sparkles /> Revamp it or rebuild it exactly
        </span>
        <h1 className="max-w-[760px] bg-[linear-gradient(130deg,#070120_33%,#545454_77%)] bg-clip-text text-[length:clamp(32px,min(5vw_+_12px,8dvh),68px)] font-semibold tracking-[-0.045em] leading-[1.02] text-balance [-webkit-text-fill-color:transparent]">
          What&apos;s your website?
        </h1>
        <p className={lead}>
          Enter its address. We&apos;ll find it, then give it a fresh new look or rebuild it exactly, ready for you to
          edit and publish.
        </p>
      </div>
      <form
        className={cn(
          "relative flex w-full max-w-[620px] items-center gap-2 rounded-full py-1.5 pr-1.5 pl-[50px] bg-white",
          "shadow-[0_0_0_1px_#0000001a,0_2px_4px_#0000000a,0_24px_48px_-18px_#0000001f] transition-shadow duration-[250ms] ease-mw-out",
          "focus-within:shadow-[0_0_0_2px_var(--mw-accent),0_2px_4px_#0000000a,0_24px_48px_-18px_#0000002e]",
          "[@media(max-width:520px)]:flex-col [@media(max-width:520px)]:items-stretch [@media(max-width:520px)]:gap-1.5 [@media(max-width:520px)]:rounded-[26px] [@media(max-width:520px)]:p-1.5",
        )}
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(url)
        }}
      >
        <Globe className="absolute left-5 size-5 text-mw-faint [@media(max-width:520px)]:top-5" aria-hidden="true" />
        <input
          className={cn(
            "min-w-0 h-12 flex-1 bg-transparent text-mw-fg text-[17px] font-medium tracking-[-0.01em] outline-none focus-visible:outline-none! placeholder:text-mw-faint",
            // flex: 1 in a column would override the height and squash the input.
            "[@media(max-width:520px)]:flex-none [@media(max-width:520px)]:ps-11 [@media(max-width:520px)]:pe-3 [@media(max-width:520px)]:text-ellipsis",
          )}
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
      {checking && (
        <p className="text-mw-subtle text-[14px] animate-[mw-breathe_1.6s_ease-in-out_infinite]">
          Looking up {url.trim()} and its pages…
        </p>
      )}
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
    </div>
  )
}

/** The preview takes the height the screen leaves, up to a 1.91:1 banner, and shrinks first when the screen is short. */
const sitePreview = "block w-full h-[293px] min-h-24 flex-[0_1_293px] object-cover bg-mw-sunk"
const favicon = "size-9 flex-none rounded-[10px] p-1.5 bg-mw-sunk object-contain text-mw-faint"

function ConfirmStep({ site, onConfirm, onReject }: { site: DiscoveredSite; onConfirm: () => void; onReject: () => void }) {
  const hostname = new URL(site.url).hostname
  const [imageOk, setImageOk] = useState(true)
  const [imageFit, setImageFit] = useState<"cover" | "contain">("cover")
  const [iconOk, setIconOk] = useState(true)
  return (
    <div className={narrow}>
      <div className={intro}>
        <h1 className={h2}>Is this your website?</h1>
        <p className={lead}>Here&apos;s what we found. Make sure it&apos;s the right one before we start.</p>
      </div>
      <div className="flex min-h-0 flex-[0_1_auto] flex-col overflow-hidden rounded-[24px] bg-white shadow-mw-window">
        {/* The live site when it allows framing (a preview image is often just a logo), else its image. */}
        {site.frameable ? (
          <LivePreview url={site.url} />
        ) : site.image && imageOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={cn(sitePreview, "data-[fit=contain]:p-7 data-[fit=contain]:object-contain data-[fit=contain]:bg-mw-surface")}
            data-fit={imageFit}
            src={site.image}
            alt=""
            onError={() => setImageOk(false)}
            // A squarish image is usually a logo: show it whole rather than cropped.
            onLoad={(e) => setImageFit(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight < 1.5 ? "contain" : "cover")}
          />
        ) : (
          <div className={cn(sitePreview, "grid place-items-center bg-mw-surface text-mw-faint [&_svg]:size-10")} aria-hidden="true">
            <Globe />
          </div>
        )}
        <div className="flex flex-col gap-[clamp(6px,1.4dvh,12px)] pt-[clamp(12px,2.2dvh,20px)] px-[22px] pb-[clamp(14px,2.4dvh,22px)]">
          <div className="flex items-center gap-3">
            {iconOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={favicon} src={site.icon} alt="" onError={() => setIconOk(false)} />
            ) : (
              <Globe className={favicon} />
            )}
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold tracking-[-0.02em]">{site.title}</p>
              <a href={site.url} target="_blank" rel="noreferrer" className={cn("text-mw-link text-[13px]", mw.mono)}>
                {hostname}
              </a>
            </div>
          </div>
          {site.description && <p className="line-clamp-3 text-mw-muted text-[14px] leading-[1.5]">{site.description}</p>}
          <p className="inline-flex items-center gap-1.5 text-[#0a7d55] text-[13px] font-[550] [&_svg]:size-[15px]">
            <Check /> {site.pages.length === 1 ? "1 page found" : `${site.pages.length} pages found`}
          </p>
        </div>
      </div>
      <div className="flex flex-none flex-wrap-reverse items-center justify-end gap-2 [@media(max-width:520px)]:*:w-full">
        <button type="button" className={mw.ghostBtn} onClick={onReject}>
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
    <div
      ref={boxRef}
      className={cn(sitePreview, "group/live relative overflow-hidden border-b border-mw-line")}
      data-loaded={loaded || undefined}
    >
      <iframe
        title="Your website"
        src={url}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute top-0 left-0 border-0 bg-white pointer-events-none opacity-0 origin-top-left transition-opacity duration-[400ms] ease-[ease] group-data-loaded/live:opacity-100"
        onLoad={() => setLoaded(true)}
        style={{ width: PREVIEW_WIDTH, height: size.height / scale, transform: `scale(${scale})` }}
      />
      {!loaded && (
        <div className="absolute inset-0 grid place-items-center text-mw-faint [&_svg]:size-[22px]" aria-hidden="true">
          <Loader2 className={spin} />
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
    <div className="flex w-full max-w-[820px] min-h-0 flex-col gap-[clamp(10px,2.2dvh,24px)] *:flex-none">
      <BackLink onClick={onBack}>{hostname}</BackLink>
      <div className={intro}>
        <h1 className={h2}>What should we do with it?</h1>
        <p className={cn(lead, "[@media(max-height:820px)]:hidden")}>
          You can change your mind later. Every page stays fully editable.
        </p>
      </div>

      <div
        className="group/modes grid grid-cols-[repeat(2,1fr)] gap-3.5 [@media(max-width:640px)]:gap-2.5"
        role="radiogroup"
        aria-label="What to make"
        data-picked={plan.mode ? "" : undefined}
      >
        {MODES.map(({ value, title, body, Icon, tag }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={plan.mode === value}
            className={modeCard}
            onClick={() => onChange({ mode: value })}
          >
            <span className={modeTop}>
              <span className={modeIcon}>
                <Icon />
              </span>
              {tag && <span className={modeTag}>{tag}</span>}
              <span className={modeCheck} aria-hidden="true">
                <Check />
              </span>
            </span>
            <span className={modeTitle}>{title}</span>
            <span className={modeBody}>{body}</span>
          </button>
        ))}
      </div>

      {plan.mode === "revamp" && (
        // Folds to one line while the page list is open, so each list gets the room it needs.
        <section className={panel} data-open={!showPages || undefined}>
          <button type="button" className={panelToggle} aria-expanded={!showPages} onClick={() => setShowPages(false)}>
            <span className={panelToggleText}>
              <strong className={panelToggleTitle}>Choose a style</strong>
              <span className={cn(mutedSmall, "truncate")}>{template ? template.name : "None picked yet"}</span>
            </span>
            <ChevronDown className={panelChevron} data-open={!showPages || undefined} />
          </button>
          {!showPages && (
            <TemplatePicker
              className="max-h-none min-h-0 flex-1"
              value={plan.template}
              onChange={(t) => onChange({ template: t })}
            />
          )}
        </section>
      )}

      {plan.mode && site.pages.length > 1 && (
        <section
          // The picker fills the panel, and its list drops its own fixed height to scroll in what's left.
          className={cn(panel, "[&>:last-child]:min-h-0 [&>:last-child]:flex-1 [&_ul]:max-h-none [&_ul]:min-h-0 [&_ul]:flex-1")}
          data-open={showPages || undefined}
        >
          <button type="button" className={panelToggle} aria-expanded={showPages} onClick={() => setShowPages((v) => !v)}>
            <span className={panelToggleText}>
              <strong className={panelToggleTitle}>Pages</strong>
              {!showPages && (
                <span className={cn(mutedSmall, "truncate")}>
                  {count === 1 ? "Home page only" : `${count} pages`} · {site.pages.length} found
                </span>
              )}
            </span>
            <ChevronDown className={panelChevron} data-open={showPages || undefined} />
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
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}

      {plan.mode && (
        <div
          className={cn(
            "relative z-[5] flex flex-wrap items-center justify-between gap-3 rounded-full py-2 pr-2 pl-[22px]",
            "bg-[#ffffffe6] backdrop-blur-[14px] backdrop-saturate-[1.4]",
            "shadow-[inset_0_0_0_1px_#fff6,0_0_0_0.5px_#00000029,0_21px_36px_-14px_#00000026]",
            "[@media(max-width:560px)]:rounded-[24px] [@media(max-width:560px)]:p-3 [@media(max-width:560px)]:[&>button]:w-full",
          )}
        >
          <p className={mutedSmall}>
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

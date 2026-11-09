"use client"

/* eslint-disable react/no-unescaped-entities -- terminal transcripts quote arguments literally */

import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { CircleCheck, Lock } from "lucide-react"
import { useCallback, useLayoutEffect, useRef } from "react"

import { prefersReducedMotion } from "./hero"
import { container, mw } from "./ui"

/* Terminal text colours. */
const MUTED = "text-[#8a8a8a]"
const OK = "text-[#4ade80]"
const MATCH = "text-[#c9b0ff] underline decoration-[#c9b0ff80] decoration-wavy underline-offset-3"
const TOOL = "[&_b]:font-semibold [&_b]:text-white"

const BAR = "block h-[7px] rounded-[4px] bg-[#ececec]"
const PLAN_BAR_FEATURED = "block h-[7px] rounded-[4px] bg-[#ffffff40]"
const RING = "animate-[mw-spin_0.8s_linear_infinite] rounded-full border-2"
/** Accent-tinted parts of the mock site follow --site-accent, which the timeline animates. */
const ACCENT_FADE = "transition-[background] duration-500 ease-[ease]"
const ACCENT_I = "[&_i]:transition-[background] [&_i]:duration-500 [&_i]:ease-[ease]"
const SITE_BTN = `inline-flex h-6 items-center rounded-[99px] bg-(--site-accent) px-3 text-[10px] font-semibold text-white ${ACCENT_FADE}`

const REQUEST = 'Clone acme.com, make the hero say "Launch in a weekend", use our purple, then publish it'
const OLD_TITLE = "Ship faster with Acme"
const NEW_TITLE = "Launch in a weekend"

type Line = {
  key: string
  /** When the line should print, in seconds after the request is sent. */
  at: number
  node: React.ReactNode
  className?: string
  /** Something the browser preview does when this line prints. */
  effect?: "clone" | "edit" | "theme" | "publish"
}

function Tool({ name, args }: { name: string; args?: string }) {
  return (
    <>
      <span className={OK}>●</span> <span className={MUTED}>magicwebs ·</span> <b>{name}</b>
      <span className={MUTED}>({args})</span>
    </>
  )
}

function Out({ children, first = true }: { children: React.ReactNode; first?: boolean }) {
  return (
    <>
      <span className={MUTED}>{first ? "  └  " : "     "}</span>
      {children}
    </>
  )
}

const LINES: Line[] = [
  {
    key: "req",
    at: 0,
    className: "mb-1.5 rounded-[6px] bg-[#ffffff12] px-2 py-1",
    node: (
      <>
        <span className={MUTED}>❯</span> {REQUEST}
      </>
    ),
  },
  { key: "t1", at: 0.6, className: TOOL, node: <Tool name="clone_landing_page" args='url: "https://acme.com"' /> },
  { key: "o1", at: 1.0, node: <Out>projectId: "k57x2a" · status: "cloning"</Out> },
  { key: "t1b", at: 1.6, className: TOOL, node: <Tool name="list_projects" /> },
  {
    key: "o1b",
    at: 2.2,
    effect: "clone",
    node: (
      <Out>
        acme.com · <span className={OK}>ready</span> · 38 images · 4 fonts · 1,204 CSS rules
      </Out>
    ),
  },
  { key: "t2", at: 2.7, className: TOOL, node: <Tool name="get_page_outline" /> },
  { key: "o2", at: 3.0, node: <Out>navbar · hero · logos · features · pricing · faq · footer</Out> },
  {
    key: "t3",
    at: 3.6,
    className: TOOL,
    node: <Tool name="set_field" args={`sectionId: "s_hero1", path: "props.heading", value: "${NEW_TITLE}"`} />,
  },
  {
    key: "o3",
    at: 4.0,
    effect: "edit",
    node: (
      <Out>
        <span className={OK}>✓</span> Draft saved
      </Out>
    ),
  },
  { key: "t4", at: 4.6, className: TOOL, node: <Tool name="update_theme" args='colors: { primary: "#6d00ff" }' /> },
  {
    key: "o4",
    at: 5.0,
    effect: "theme",
    node: (
      <Out>
        <span className={OK}>✓</span> Draft saved · preview updated
      </Out>
    ),
  },
  { key: "t5", at: 5.6, className: TOOL, node: <Tool name="publish_page" /> },
  {
    key: "o5",
    at: 6.2,
    effect: "publish",
    node: (
      <Out>
        Live at <span className={MATCH}>https://acme.magicwebs.ai</span> · version 1
      </Out>
    ),
  },
  {
    key: "said",
    at: 6.9,
    className: "mt-1.5",
    node: (
      <>
        <span className="text-white">●</span> Cloned acme.com, rewrote the hero, switched the theme to your purple and
        published it.
      </>
    ),
  },
]

const TYPE_DURATION = 1.6
const SEND_AT = TYPE_DURATION + 0.35

export function Replay() {
  const shotRef = useRef<HTMLDivElement>(null)
  const tlRef = useRef<gsap.core.Timeline | null>(null)

  const q = useCallback(<T extends Element = HTMLElement>(sel: string) => {
    return Array.from(shotRef.current?.querySelectorAll<T>(sel) ?? [])
  }, [])

  // Puts the scene back to its first frame. The server-rendered markup is the last frame,
  // so the page still reads correctly without JavaScript or with reduced motion.
  const reset = useCallback(() => {
    const [title] = q("[data-site-title]")
    const [address] = q("[data-address]")
    gsap.set(q("[data-line]"), { display: "none", opacity: 0 })
    gsap.set(q("[data-site-part]"), { opacity: 0, y: -8 })
    gsap.set(q("[data-cloning]"), { opacity: 1, display: "grid" })
    gsap.set(q("[data-toast]"), { opacity: 0, y: 10, scale: 0.9 })
    gsap.set(q("[data-live]"), { display: "none" })
    gsap.set(q("[data-lock]"), { display: "block" })
    gsap.set(q("[data-working]"), { display: "none" })
    gsap.set(q("[data-site]"), { "--site-accent": "#111111" })
    if (title) {
      title.textContent = OLD_TITLE
      delete title.dataset.edited
    }
    if (address) address.textContent = "acme.com"
    for (const el of q("[data-typed]")) el.textContent = ""
  }, [q])

  useLayoutEffect(() => {
    const shot = shotRef.current
    if (!shot || prefersReducedMotion()) return
    gsap.registerPlugin(ScrollTrigger)

    const ctx = gsap.context(() => {
      reset()
      const [typed] = q("[data-typed]")
      const [title] = q("[data-site-title]")
      const [address] = q("[data-address]")
      const typing = { n: 0 }

      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } })
      tl.to(typing, {
        n: REQUEST.length,
        duration: TYPE_DURATION,
        ease: "none",
        onUpdate: () => {
          if (typed) typed.textContent = REQUEST.slice(0, Math.round(typing.n))
        },
      })
      tl.call(() => {
        if (typed) typed.textContent = ""
      }, undefined, SEND_AT)
      tl.set(q("[data-working]"), { display: "flex" }, SEND_AT + 0.2)

      for (const line of LINES) {
        const el = shot.querySelector(`[data-line="${line.key}"]`)
        const at = SEND_AT + line.at
        tl.set(el, { display: "block" }, at).fromTo(el, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3 }, at)

        if (line.effect === "clone") {
          tl.to(q("[data-cloning]"), { opacity: 0, duration: 0.25 }, at)
            .set(q("[data-cloning]"), { display: "none" })
            .call(() => {
              if (address) address.textContent = "editor · acme.com"
            }, undefined, at)
            .to(q("[data-site-part]"), { opacity: 1, y: 0, duration: 0.6, stagger: 0.12 }, at + 0.1)
        }
        if (line.effect === "edit" && title) {
          tl.call(() => {
            title.dataset.edited = ""
            title.textContent = NEW_TITLE
          }, undefined, at)
            .fromTo(title, { scale: 0.96 }, { scale: 1, duration: 0.5, ease: "back.out(2)" }, at)
            .call(() => {
              delete title.dataset.edited
            }, undefined, at + 1.4)
        }
        if (line.effect === "theme") {
          tl.to(q("[data-site]"), { "--site-accent": "#6d00ff", duration: 0.6 }, at)
        }
        if (line.effect === "publish") {
          tl.call(() => {
            if (address) address.textContent = "acme.magicwebs.ai"
          }, undefined, at)
            .set(q("[data-lock]"), { display: "none" }, at)
            .set(q("[data-live]"), { display: "block" }, at)
            .to(q("[data-toast]"), { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.8)" }, at + 0.1)
        }
      }
      tl.set(q("[data-working]"), { display: "none" }, SEND_AT + LINES[LINES.length - 1].at)
      tl.fromTo(q("[data-caption]"), { opacity: 0 }, { opacity: 1, duration: 0.4 }, "+=0.2")
      tlRef.current = tl

      ScrollTrigger.create({ trigger: shot, start: "top 65%", once: true, onEnter: () => tl.play() })

      // The window tilts flat as it scrolls into view.
      gsap.fromTo(
        q("[data-replay]"),
        { rotateX: 16, scale: 0.92, y: 40, opacity: 0.5 },
        {
          rotateX: 0,
          scale: 1,
          y: 0,
          opacity: 1,
          ease: "none",
          scrollTrigger: { trigger: shot, start: "top 98%", end: "top 30%", scrub: 0.6 },
        },
      )
    }, shot)

    return () => {
      ctx.revert()
      tlRef.current = null
    }
  }, [q, reset])

  function replay() {
    const tl = tlRef.current
    if (!tl) return
    tl.pause(0)
    reset()
    tl.play(0)
  }

  return (
    <div ref={shotRef} id="features" className={`${container} perspective-[1600px]`}>
      <figure className="relative origin-[50%_0]" data-replay>
        <div className="relative h-[600px] max-[860px]:flex max-[860px]:h-auto max-[860px]:flex-col max-[860px]:gap-4">
          <div
            className="absolute top-0 left-0 h-[540px] w-[74%] overflow-hidden rounded-[16px] bg-white shadow-mw-window max-[860px]:relative max-[860px]:h-[420px] max-[860px]:w-full"
            aria-hidden="true"
          >
            <div className="flex h-10 items-center gap-3 border-b border-mw-line bg-mw-surface px-[14px]">
              <span className="flex gap-1.5 [&_span]:size-2.5 [&_span]:rounded-full [&_span]:bg-[#e2e2e2]">
                <span />
                <span />
                <span />
              </span>
              <span className="mx-auto flex h-6 max-w-[320px] flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-white text-[12px] text-mw-subtle shadow-mw-chip [&_svg]:size-3">
                <Lock data-lock style={{ display: "none" }} />
                <span className="size-[7px] rounded-full bg-[#22c55e] shadow-[0_0_0_3px_#22c55e33]" data-live />
                <span data-address>acme.magicwebs.ai</span>
              </span>
              <span style={{ width: 42 }} />
            </div>
            <div className="relative h-[calc(100%-40px)] overflow-hidden">
              <div className="absolute inset-0 grid place-items-center text-[13px] text-mw-faint" data-cloning style={{ display: "none" }}>
                <span className="flex items-center gap-2">
                  <span className={`${RING} size-[14px] border-[#0000001a] border-t-mw-accent`} /> Copying acme.com…
                </span>
              </div>
              <div
                className="relative flex flex-col gap-[22px] px-7 py-4 [--site-accent:#111] max-[860px]:gap-4 max-[860px]:px-4 max-[860px]:py-[14px]"
                data-site style={{ "--site-accent": "#6d00ff" } as React.CSSProperties}>
                <div className="flex items-center gap-[18px]" data-site-part>
                  <span
                    className={`flex items-center gap-1.5 text-[13px] font-bold tracking-[-0.02em] [&_i]:size-[14px] [&_i]:rounded-[4px] [&_i]:bg-(--site-accent) ${ACCENT_I}`}
                  >
                    <i />
                    Acme
                  </span>
                  <span className="ml-auto flex gap-[14px]">
                    <span className={BAR} style={{ width: 36 }} />
                    <span className={BAR} style={{ width: 44 }} />
                    <span className={BAR} style={{ width: 30 }} />
                  </span>
                  <span className={SITE_BTN}>Sign up</span>
                </div>
                <div className="flex flex-col items-center gap-2.5 pt-[18px] pb-1 text-center" data-site-part>
                  <span
                    className="relative rounded-[6px] px-1.5 text-[30px] leading-[1.1] font-bold tracking-[-0.04em] data-edited:bg-[#6d00ff14] data-edited:shadow-[0_0_0_1.5px_#6d00ff] max-[860px]:text-[22px]"
                    data-site-title
                  >
                    {NEW_TITLE}
                  </span>
                  <span className={BAR} style={{ width: 280, maxWidth: "80%" }} />
                  <span className={BAR} style={{ width: 200, maxWidth: "60%" }} />
                  <span className={SITE_BTN} style={{ marginTop: 6 }}>
                    Get started
                  </span>
                </div>
                <div className="flex justify-center gap-[22px]" data-site-part>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="block h-[9px] w-[54px] rounded-[4px] bg-[#e3e3e3]" />
                  ))}
                </div>
                <div className="grid grid-cols-[repeat(3,1fr)] gap-3" data-site-part>
                  {[70, 55, 80].map((w, i) => (
                    <div
                      key={i}
                      className={`flex flex-col gap-2 rounded-[12px] border border-mw-line p-[14px] [&_i]:size-[22px] [&_i]:rounded-[7px] [&_i]:bg-[color-mix(in_srgb,var(--site-accent)_14%,#fff)] ${ACCENT_I}`}
                    >
                      <i />
                      <span className={BAR} style={{ width: `${w}%`, background: "#dcdcdc" }} />
                      <span className={BAR} style={{ width: "90%" }} />
                      <span className={BAR} style={{ width: "65%" }} />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[repeat(3,1fr)] gap-3 max-[860px]:hidden" data-site-part>
                  {["$0", "$29", "$99"].map((price, i) => (
                    <div
                      key={price}
                      className={`flex flex-col gap-2 rounded-[12px] p-[14px] [&_b]:text-[18px] [&_b]:tracking-[-0.03em] ${i === 1 ? `bg-(--site-accent) text-white ${ACCENT_FADE}` : "bg-mw-sunk"}`}
                      data-featured={i === 1 || undefined}
                    >
                      <b>{price}</b>
                      <span className={i === 1 ? PLAN_BAR_FEATURED : BAR} style={{ width: "70%" }} />
                      <span className={i === 1 ? PLAN_BAR_FEATURED : BAR} style={{ width: "50%" }} />
                    </div>
                  ))}
                </div>
              </div>
              <div
                className="absolute right-4 bottom-4 flex items-center gap-2 rounded-[99px] bg-white py-2 pr-[14px] pl-2.5 text-[12px] font-semibold shadow-mw-window [&_svg]:size-4 [&_svg]:text-[#16a34a]"
                data-toast
              >
                <CircleCheck /> Published · version 1
              </div>
            </div>
          </div>

          <div
            className="absolute right-0 bottom-0 flex h-[430px] w-[52%] flex-col overflow-hidden rounded-[16px] bg-mw-dark text-mw-on-dark shadow-[0_2px_4px_#0000003d,0_7px_7px_#0003,0_17px_10px_#0000001f,0_30px_12px_#0000000a,inset_0_0_0_1px_#fff3] max-[860px]:relative max-[860px]:h-[400px] max-[860px]:w-full"
            aria-hidden="true"
          >
            <div className="relative flex h-9 flex-none items-center gap-1.5 border-b border-[#ffffff12] px-[14px] [&>i]:size-2.5 [&>i]:rounded-full [&>i]:bg-[#ff5f57] [&>i:nth-child(2)]:bg-[#febc2e] [&>i:nth-child(3)]:bg-[#28c840]">
              <i />
              <i />
              <i />
              <span className={`absolute left-1/2 -translate-x-1/2 text-[12px] text-[#9a9a9a] ${mw.mono}`}>~/acme-site · claude</span>
            </div>
            <div
              className={`flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden px-4 pt-[14px] pb-3 text-[12px] leading-[18px] ${mw.mono}`}
            >
              <div className="flex min-h-0 flex-1 flex-col justify-end gap-0.5 overflow-hidden">
                {LINES.map((line) => (
                  <p key={line.key} className={`whitespace-pre-wrap wrap-anywhere ${line.className ?? ""}`} data-line={line.key}>
                    {line.node}
                  </p>
                ))}
                <p className="flex items-center gap-2 text-[#c9b0ff]" data-working style={{ display: "none" }}>
                  <span className={`${RING} size-2.5 border-[#ffffff26] border-t-[#c9b0ff]`} /> Working…
                </p>
              </div>
              <div className="mt-2.5 flex min-h-[34px] flex-none items-center gap-2 rounded-[8px] border border-[#ffffff1f] px-2.5 py-[7px]">
                <span className={MUTED}>❯</span>
                <span>
                  <span data-typed />
                  <span className="ml-px inline-block h-[15px] w-[7px] animate-[mw-blink_1s_steps(1)_infinite] bg-[#e5e5e5] align-[-3px]" />
                </span>
              </div>
            </div>
          </div>
        </div>
        <figcaption className="mt-5 text-center text-[13px] text-mw-subtle" data-caption>
          One prompt in Claude Code · 6 calls to the Magicwebs MCP server
          <button type="button" className="ml-2 text-mw-link underline underline-offset-2" onClick={replay}>
            Replay
          </button>
        </figcaption>
      </figure>
    </div>
  )
}

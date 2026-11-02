"use client"

/* eslint-disable react/no-unescaped-entities -- terminal transcripts quote arguments literally */

import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { CircleCheck, Lock } from "lucide-react"
import { useCallback, useLayoutEffect, useRef } from "react"

import s from "./landing.module.css"
import { prefersReducedMotion } from "./hero"

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
      <span className={s.dot}>●</span> <span className={s.muted}>magicwebs ·</span> <b>{name}</b>
      <span className={s.muted}>({args})</span>
    </>
  )
}

function Out({ children, first = true }: { children: React.ReactNode; first?: boolean }) {
  return (
    <>
      <span className={s.muted}>{first ? "  └  " : "     "}</span>
      {children}
    </>
  )
}

const LINES: Line[] = [
  {
    key: "req",
    at: 0,
    className: s.request,
    node: (
      <>
        <span className={s.muted}>❯</span> {REQUEST}
      </>
    ),
  },
  { key: "t1", at: 0.6, className: s.tool, node: <Tool name="clone_landing_page" args='url: "https://acme.com"' /> },
  { key: "o1", at: 1.0, node: <Out>projectId: "k57x2a" · status: "cloning"</Out> },
  { key: "t1b", at: 1.6, className: s.tool, node: <Tool name="list_projects" /> },
  {
    key: "o1b",
    at: 2.2,
    effect: "clone",
    node: (
      <Out>
        acme.com · <span className={s.ok}>ready</span> · 38 images · 4 fonts · 1,204 CSS rules
      </Out>
    ),
  },
  { key: "t2", at: 2.7, className: s.tool, node: <Tool name="get_page_outline" /> },
  { key: "o2", at: 3.0, node: <Out>navbar · hero · logos · features · pricing · faq · footer</Out> },
  {
    key: "t3",
    at: 3.6,
    className: s.tool,
    node: <Tool name="set_field" args={`sectionId: "s_hero1", path: "props.heading", value: "${NEW_TITLE}"`} />,
  },
  {
    key: "o3",
    at: 4.0,
    effect: "edit",
    node: (
      <Out>
        <span className={s.ok}>✓</span> Draft saved
      </Out>
    ),
  },
  { key: "t4", at: 4.6, className: s.tool, node: <Tool name="update_theme" args='colors: { primary: "#6d00ff" }' /> },
  {
    key: "o4",
    at: 5.0,
    effect: "theme",
    node: (
      <Out>
        <span className={s.ok}>✓</span> Draft saved · preview updated
      </Out>
    ),
  },
  { key: "t5", at: 5.6, className: s.tool, node: <Tool name="publish_page" /> },
  {
    key: "o5",
    at: 6.2,
    effect: "publish",
    node: (
      <Out>
        Live at <span className={s.match}>https://acme.magicwebs.ai</span> · version 1
      </Out>
    ),
  },
  {
    key: "said",
    at: 6.9,
    className: s.said,
    node: (
      <>
        <span className={s.agentDot}>●</span> Cloned acme.com, rewrote the hero, switched the theme to your purple and
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
    <div ref={shotRef} id="features" className={`${s.container} ${s.shot}`}>
      <figure className={s.replay} data-replay>
        <div className={s.stage}>
          <div className={s.appWindow} aria-hidden="true">
            <div className={s.appBar}>
              <span className={s.lights}>
                <span />
                <span />
                <span />
              </span>
              <span className={s.address}>
                <Lock data-lock style={{ display: "none" }} />
                <span className={s.liveDot} data-live />
                <span data-address>acme.magicwebs.ai</span>
              </span>
              <span style={{ width: 42 }} />
            </div>
            <div className={s.appBody}>
              <div className={s.cloning} data-cloning style={{ display: "none" }}>
                <span className={s.cloningInner}>
                  <span className={s.ring} /> Copying acme.com…
                </span>
              </div>
              <div className={s.site} data-site style={{ "--site-accent": "#6d00ff" } as React.CSSProperties}>
                <div className={s.siteNav} data-site-part>
                  <span className={s.siteLogo}>
                    <i />
                    Acme
                  </span>
                  <span className={s.siteNavLinks}>
                    <span className={s.bar} style={{ width: 36 }} />
                    <span className={s.bar} style={{ width: 44 }} />
                    <span className={s.bar} style={{ width: 30 }} />
                  </span>
                  <span className={s.siteBtn}>Sign up</span>
                </div>
                <div className={s.siteHero} data-site-part>
                  <span className={s.siteTitle} data-site-title>
                    {NEW_TITLE}
                  </span>
                  <span className={s.bar} style={{ width: 280, maxWidth: "80%" }} />
                  <span className={s.bar} style={{ width: 200, maxWidth: "60%" }} />
                  <span className={s.siteBtn} style={{ marginTop: 6 }}>
                    Get started
                  </span>
                </div>
                <div className={s.siteLogos} data-site-part>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className={s.bar} />
                  ))}
                </div>
                <div className={s.siteCards} data-site-part>
                  {[70, 55, 80].map((w, i) => (
                    <div key={i} className={s.siteCard}>
                      <i />
                      <span className={s.bar} style={{ width: `${w}%`, background: "#dcdcdc" }} />
                      <span className={s.bar} style={{ width: "90%" }} />
                      <span className={s.bar} style={{ width: "65%" }} />
                    </div>
                  ))}
                </div>
                <div className={s.sitePricing} data-site-part>
                  {["$0", "$29", "$99"].map((price, i) => (
                    <div key={price} className={s.sitePlan} data-featured={i === 1 || undefined}>
                      <b>{price}</b>
                      <span className={s.bar} style={{ width: "70%" }} />
                      <span className={s.bar} style={{ width: "50%" }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className={s.toast} data-toast>
                <CircleCheck /> Published · version 1
              </div>
            </div>
          </div>

          <div className={s.terminal} aria-hidden="true">
            <div className={s.titleBar}>
              <i />
              <i />
              <i />
              <span className={`${s.titleText} ${s.mono}`}>~/acme-site · claude</span>
            </div>
            <div className={`${s.screen} ${s.mono}`}>
              <div className={s.screenLines}>
                {LINES.map((line) => (
                  <p key={line.key} className={`${s.line} ${line.className ?? ""}`} data-line={line.key}>
                    {line.node}
                  </p>
                ))}
                <p className={s.working} data-working style={{ display: "none" }}>
                  <span className={s.ring} /> Working…
                </p>
              </div>
              <div className={s.input}>
                <span className={s.muted}>❯</span>
                <span>
                  <span data-typed />
                  <span className={s.caret} />
                </span>
              </div>
            </div>
          </div>
        </div>
        <figcaption className={s.caption} data-caption>
          One prompt in Claude Code · 6 calls to the Magicwebs MCP server
          <button type="button" className={s.replayBtn} onClick={replay}>
            Replay
          </button>
        </figcaption>
      </figure>
    </div>
  )
}

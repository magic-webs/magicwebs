"use client"

import gsap from "gsap"
import { Bot, Code, MessageSquare, MousePointer2, Plug, Terminal, Wind, Zap, ChevronRight } from "lucide-react"
import { useEffect, useLayoutEffect, useRef } from "react"

import s from "./landing.module.css"
import { DarkButton, GhostButton } from "./ui"

const TITLE = "Any website, ready for your agent to edit"

const CLIENTS = [
  { name: "Claude Code", Icon: Terminal },
  { name: "Cursor", Icon: MousePointer2 },
  { name: "VS Code", Icon: Code },
  { name: "Windsurf", Icon: Wind },
  { name: "Zed", Icon: Zap },
  { name: "Cline", Icon: Bot },
  { name: "ChatGPT", Icon: MessageSquare },
]

const TRAIL_CHARS = "</>{}[]#*+~;$".split("")
const TRAIL_LIFE = 900

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Blur-and-rise entrance shared by the hero and the section reveals. */
export const RISE_FROM = { opacity: 0, filter: "blur(10px)", yPercent: 20 }
export const RISE_TO = { opacity: 1, filter: "blur(0px)", yPercent: 0, clearProps: "filter" }

export function Hero() {
  const heroRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Each word clips the same gradient, positioned so it reads as one fill across the whole title.
  useLayoutEffect(() => {
    const title = titleRef.current
    if (!title) return
    // Offsets rather than client rects: the words may be mid-entrance, and transforms would skew the fill.
    const measure = () => {
      for (const word of title.querySelectorAll<HTMLElement>("[data-hero-word]")) {
        word.style.setProperty("--fw", `${title.offsetWidth}px`)
        word.style.setProperty("--fh", `${title.offsetHeight}px`)
        word.style.setProperty("--fx", `${title.offsetLeft - word.offsetLeft}px`)
        word.style.setProperty("--fy", `${title.offsetTop - word.offsetTop}px`)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(title)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    if (prefersReducedMotion()) {
      hero.dataset.ready = ""
      return
    }
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out", duration: 1 } })
      tl.fromTo("[data-hero-bg]", { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 1.6 }, 0)
        .fromTo("[data-hero-badge]", RISE_FROM, RISE_TO, 0)
        .fromTo("[data-hero-word]", RISE_FROM, { ...RISE_TO, stagger: 0.08 }, 0.1)
        .fromTo("[data-hero-sub]", RISE_FROM, RISE_TO, 0.55)
        .fromTo("[data-hero-actions]", RISE_FROM, RISE_TO, 0.65)
        .fromTo("[data-hero-label]", RISE_FROM, RISE_TO, 0.75)
        .fromTo("[data-hero-logo]", RISE_FROM, { ...RISE_TO, duration: 0.6, stagger: 0.07 }, 0.85)
    }, hero)
    hero.dataset.ready = ""
    return () => ctx.revert()
  }, [])

  // A trail of code glyphs follows the mouse over the empty parts of the hero.
  useEffect(() => {
    const hero = heroRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!hero || !canvas || !ctx || prefersReducedMotion()) return

    type Glyph = { x: number; y: number; c: string; born: number; drift: number }
    let glyphs: Glyph[] = []
    let raf = 0
    let last = { x: -999, y: -999 }
    const font = `500 14px ${getComputedStyle(canvas).fontFamily}`
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const { width, height } = hero.getBoundingClientRect()
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(hero)

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      glyphs = glyphs.filter((g) => t - g.born < TRAIL_LIFE)
      ctx.font = font
      ctx.fillStyle = "#6d00ff"
      for (const g of glyphs) {
        const k = (t - g.born) / TRAIL_LIFE
        ctx.globalAlpha = (1 - k) * 0.85
        ctx.fillText(g.c, g.x + g.drift * k * 10, g.y - k * 14)
      }
      raf = glyphs.length ? requestAnimationFrame(draw) : 0
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      if (e.target instanceof Element && e.target.closest("[data-trail-safe]")) return
      const r = hero.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      if (Math.hypot(x - last.x, y - last.y) < 24) return
      last = { x, y }
      glyphs.push({
        x,
        y,
        c: TRAIL_CHARS[Math.floor(Math.random() * TRAIL_CHARS.length)],
        born: performance.now(),
        drift: Math.random() * 2 - 1,
      })
      if (!raf) raf = requestAnimationFrame(draw)
    }

    hero.addEventListener("pointermove", onMove)
    return () => {
      hero.removeEventListener("pointermove", onMove)
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section ref={heroRef} className={s.hero}>
      <noscript>
        <style>{`[data-hero-anim]{visibility:visible!important}`}</style>
      </noscript>
      <div className={s.heroBg} data-hero-bg data-hero-anim aria-hidden="true">
        <div className={s.heroGrid} />
        <div className={s.heroGlow} />
      </div>
      <canvas ref={canvasRef} className={`${s.trail} ${s.mono}`} aria-hidden="true" />

      <div className={s.heroMain}>
        <a className={s.badgeRing} href="#setup" data-trail-safe data-hero-badge data-hero-anim>
          <span className={s.badgeGlow} aria-hidden="true" />
          <span className={s.badge}>
            <Plug className={s.badgeIcon} />
            <span>Now with an MCP server</span>
            <ChevronRight className={s.chev} />
          </span>
        </a>

        <div className={s.copy}>
          <h1 ref={titleRef} className={s.title} data-trail-safe>
            {TITLE.split(" ").map((word, i) => (
              <span key={i}>
                <span className={s.word} data-hero-word data-hero-anim>
                  {word}
                </span>{" "}
              </span>
            ))}
          </h1>
          <p className={s.subtitle} data-trail-safe data-hero-sub data-hero-anim>
            Paste a URL and Magicwebs rebuilds the page exactly, with its CSS, fonts and animations. Edit it in the
            visual editor, with AI chat, or from any MCP client, then publish it to your own domain.
          </p>
        </div>

        <div className={s.heroActions} data-trail-safe data-hero-actions data-hero-anim>
          <GhostButton href="#setup">Connect your agent</GhostButton>
          <DarkButton href="/dashboard">Start building</DarkButton>
        </div>
      </div>

      <div className={s.trusted}>
        <p className={s.trustedLabel} data-hero-label data-hero-anim>
          Works with every MCP client
        </p>
        <ul className={s.logos} aria-label="MCP clients that work with Magicwebs" data-trail-safe>
          {CLIENTS.map(({ name, Icon }) => (
            <li key={name} className={s.logoItem} data-hero-logo data-hero-anim>
              <Icon />
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

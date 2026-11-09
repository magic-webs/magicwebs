"use client"

import gsap from "gsap"
import { Bot, Code, Globe, MessageSquare, MousePointer2, Plug, Terminal, Wind, Zap, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"

import { DarkButtonLight, darkBtnBase, GhostButton, mw } from "./ui"

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

const NARROW_QUERY = "(max-width: 560px)"

/** True on phone-width screens, where the full placeholder would be cut off. False while server rendering. */
function useNarrow() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW_QUERY)
      mq.addEventListener("change", onChange)
      return () => mq.removeEventListener("change", onChange)
    },
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  )
}

/** Where a visitor starts: their website's address, taken to the /start page to be checked and built. */
function StartForm() {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const narrow = useNarrow()
  return (
    <form
      className="relative flex w-full max-w-[560px] items-center gap-2 rounded-[99px] bg-white py-[5px] pr-[5px] pl-[46px] shadow-[0_0_0_1px_#0000001a,0_2px_4px_#0000000a,0_24px_48px_-18px_#0000001f] transition-[box-shadow] duration-250 ease-mw-out focus-within:shadow-[0_0_0_2px_#18181b,0_2px_4px_#0000000a,0_24px_48px_-18px_#0000002e] max-[560px]:flex-col max-[560px]:items-stretch max-[560px]:gap-1.5 max-[560px]:rounded-[26px] max-[560px]:p-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        const address = url.trim()
        router.push(address ? `/start?url=${encodeURIComponent(address)}` : "/start")
      }}
    >
      <Globe
        className="absolute left-[18px] size-[18px] text-mw-faint max-[560px]:top-[21px] max-[560px]:left-5"
        aria-hidden="true"
      />
      <input
        className="h-[42px] min-w-0 flex-1 bg-transparent text-[16px] font-medium tracking-[-0.01em] text-mw-fg placeholder:text-ellipsis placeholder:text-mw-faint focus-visible:outline-none! max-[560px]:h-12 max-[560px]:flex-none max-[560px]:pr-3 max-[560px]:pl-11 max-[560px]:text-ellipsis"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={narrow ? "e.g. yourbusiness.com" : "Enter your website, e.g. yourbusiness.com"}
        inputMode="url"
        autoComplete="url"
        autoCapitalize="none"
        spellCheck={false}
        aria-label="Your website's address"
      />
      <button
        type="submit"
        className={`${darkBtnBase} h-10 min-w-0 flex-none pr-5 pl-6 max-[560px]:h-12 max-[560px]:rounded-[20px] max-[560px]:text-[15px]`}
      >
        <DarkButtonLight />
        <span className={mw.darkLabel}>Start free</span>
        <ChevronRight className={mw.chev} />
      </button>
    </form>
  )
}

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
    <section
      ref={heroRef}
      className="relative flex flex-col items-center gap-[120px] overflow-hidden pt-[168px] pb-24 font-mw max-[640px]:gap-14 max-[640px]:pt-28 max-[640px]:pb-[72px] [&:not([data-ready])_[data-hero-anim]]:invisible"
    >
      <noscript>
        <style>{`[data-hero-anim]{visibility:visible!important}`}</style>
      </noscript>
      <div className="pointer-events-none absolute inset-0" data-hero-bg data-hero-anim aria-hidden="true">
        <div className={mw.heroGrid} />
        <div className="absolute top-[-260px] left-1/2 -ml-[550px] h-[640px] w-[1100px] rounded-full blur-[30px] [background:radial-gradient(closest-side_at_30%_55%,#ae0dff1f,transparent),radial-gradient(closest-side_at_70%_50%,#0dff9917,transparent),radial-gradient(closest-side_at_50%_70%,#ffdf0d14,transparent)]" />
      </div>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full font-mw-mono" aria-hidden="true" />

      <div className="relative flex w-full flex-col items-center gap-11 max-[640px]:gap-8">
        <a
          className="group relative isolate inline-flex overflow-hidden rounded-[999px] p-[1.5px]"
          href="#setup" data-trail-safe data-hero-badge data-hero-anim>
          <span
            className="absolute top-1/2 left-1/2 z-[-1] aspect-square w-[calc(100%+40px)] -translate-1/2 animate-[mw-spin_6s_linear_infinite] blur-[6px] [background:conic-gradient(from_0deg,#ae0dff,#ffdf0d,#0dff99,#6d00ff,#ae0dff)]"
            aria-hidden="true"
          />
          <span className="relative inline-flex h-7 items-center gap-1.5 rounded-[99px] bg-[#fafbfb] py-1 pr-1.5 pl-2 text-[14px] font-semibold tracking-[-0.01em] text-mw-fg shadow-mw-badge after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-white [&_svg]:size-4">
            <Plug className="text-mw-accent" />
            <span>Now with an MCP server</span>
            <ChevronRight className={mw.chev} />
          </span>
        </a>

        <div className="flex w-full flex-col items-center gap-[18px] text-center">
          <h1 ref={titleRef} className="max-w-[880px] px-6 pt-[0.04em] pb-[0.16em] font-mw-title text-[length:clamp(36px,4.4vw_+_12px,68px)] leading-none font-bold tracking-[-0.04em] text-balance max-[640px]:px-4"
            data-trail-safe>
            {TITLE.split(" ").map((word, i) => (
              <span key={i}>
                <span
                  className="-mx-[0.1em] -mt-[0.1em] -mb-[0.25em] inline-block bg-[linear-gradient(130deg,#070120_33%,#545454_77%)] bg-clip-text bg-no-repeat px-[0.1em] pt-[0.1em] pb-[0.25em] [-webkit-text-fill-color:transparent] [background-position:var(--fx,0)_var(--fy,0)] [background-size:var(--fw,100%)_var(--fh,100%)]"
                  data-hero-word data-hero-anim>
                  {word}
                </span>{" "}
              </span>
            ))}
          </h1>
          <p
            className="w-[90%] max-w-[720px] text-[18px] leading-[1.35] font-medium tracking-[-0.02em] text-balance text-mw-subtle max-[640px]:w-auto max-[640px]:px-4 max-[640px]:text-[15px]"
            data-trail-safe data-hero-sub data-hero-anim>
            Enter your website and Magicwebs gives it a fresh new look, or rebuilds it exactly with its CSS, fonts and
            animations. Edit it in the visual editor, with AI chat, or from any MCP client, then publish it to your own
            domain.
          </p>
        </div>

        <div
          className="flex w-full flex-col items-center gap-[14px] px-4 sm:px-6 max-[640px]:gap-2"
          data-trail-safe data-hero-actions data-hero-anim>
          <StartForm />
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <GhostButton href="#setup">Connect your agent</GhostButton>
          </div>
        </div>
      </div>

      <div className="relative flex w-full max-w-[1000px] flex-col items-center gap-[22px] px-4 sm:px-6">
        <p className="text-[15px] font-medium text-mw-muted" data-hero-label data-hero-anim>
          Works with every MCP client
        </p>
        <ul
          className="flex list-none flex-wrap justify-center gap-x-9 gap-y-[14px] max-[640px]:gap-x-[22px] max-[640px]:gap-y-3"
          aria-label="MCP clients that work with Magicwebs" data-trail-safe>
          {CLIENTS.map(({ name, Icon }) => (
            <li
              key={name}
              className="flex items-center gap-2 text-[17px] font-[650] tracking-[-0.03em] text-[#8b8b8b] transition-[color] duration-300 ease-mw-out hover:text-mw-strong max-[640px]:text-[15px] [&_svg]:size-5"
              data-hero-logo data-hero-anim>
              <Icon />
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

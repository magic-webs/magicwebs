"use client"

import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import {
  Bot,
  Braces,
  Cloud,
  Code,
  Copy,
  Globe,
  History,
  Image,
  Layers,
  LayoutTemplate,
  MousePointer2,
  Palette,
  PenLine,
  Plug,
  Rocket,
  Smartphone,
  Sparkles,
  Terminal,
  Type,
  Wand,
  Zap,
} from "lucide-react"
import Link from "next/link"
import { useLayoutEffect, useRef } from "react"

import { prefersReducedMotion } from "./hero"
import { Logo } from "./ui"

const CTA_LINE =
  "block w-fit bg-[linear-gradient(160deg,#fff_0%,#ffffffa6_100%)] bg-clip-text whitespace-nowrap text-transparent max-[960px]:mx-auto"
const CTA_BTN =
  "flex h-12 items-center justify-center rounded-[42px] px-7 py-3 text-[17px] font-semibold tracking-[-0.02em] whitespace-nowrap transition-[transform] duration-500 ease-mw-soft hover:[transform:scale(1.015)]"

// [Icon, left, top, size, rotation] inside a 640×440 field.
const ART: [typeof Zap, number, number, number, number][] = [
  [Sparkles, 248, 120, 190, 0],
  [Globe, 180, 96, 78, -8],
  [Plug, 98, 262, 56, -13],
  [Wand, 466, 34, 42, -14],
  [Palette, 168, 230, 86, 4],
  [Terminal, 262, 40, 84, -28],
  [Layers, 392, 60, 78, 15],
  [Rocket, 330, 318, 86, -16],
  [Code, 432, 206, 86, 15],
  [Type, 120, 168, 62, 16],
  [Copy, 244, 324, 70, 8],
  [MousePointer2, 456, 316, 62, -18],
  [Bot, 478, 120, 72, -18],
  [Image, 182, 350, 48, 15],
  [Braces, 120, 50, 62, -18],
  [Zap, 58, 116, 54, -2],
  [History, 538, 70, 48, 15],
  [Cloud, 212, 14, 54, -24],
  [Smartphone, 358, 10, 48, -15],
  [PenLine, 546, 266, 56, -15],
  [LayoutTemplate, 560, 170, 48, -18],
  [Sparkles, 54, 212, 46, 9],
  [Globe, 520, 210, 34, 6],
  [Zap, 414, 380, 34, -14],
]

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Start building", href: "/start" },
      { label: "Features", href: "#features" },
      { label: "MCP server", href: "#setup" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Exact clones", href: "#safety" },
      { label: "Visual editor", href: "/dashboard" },
      { label: "Versions", href: "#safety" },
      { label: "Custom domains", href: "#safety" },
    ],
  },
  {
    title: "Works with",
    links: [
      { label: "Claude Code", href: "#setup" },
      { label: "Cursor", href: "#setup" },
      { label: "VS Code", href: "#setup" },
      { label: "Windsurf", href: "#setup" },
    ],
  },
]

export function Footer() {
  const ctaRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const cta = ctaRef.current
    if (!cta || prefersReducedMotion()) return
    gsap.registerPlugin(ScrollTrigger)

    const ctx = gsap.context(() => {
      const icons = gsap.utils.toArray<HTMLElement>("[data-art]")
      gsap.fromTo(
        icons,
        { opacity: 0, scale: 0.2, rotate: () => gsap.utils.random(-60, 60) },
        {
          opacity: 1,
          scale: 1,
          rotate: 0,
          duration: 0.9,
          ease: "back.out(1.6)",
          stagger: { each: 0.035, from: "center" },
          scrollTrigger: { trigger: cta, start: "top 75%", once: true },
        },
      )
      gsap.fromTo(
        "[data-cta-line]",
        { opacity: 0, yPercent: 30, filter: "blur(8px)" },
        {
          opacity: 1,
          yPercent: 0,
          filter: "blur(0px)",
          clearProps: "filter",
          duration: 0.9,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: { trigger: cta, start: "top 75%", once: true },
        },
      )

      // Bigger icons sit closer, so they follow the pointer further.
      const movers = icons.map((el) => {
        const depth = Number(el.dataset.size) / 190
        return {
          depth,
          x: gsap.quickTo(el, "x", { duration: 0.8, ease: "power3.out" }),
          y: gsap.quickTo(el, "y", { duration: 0.8, ease: "power3.out" }),
        }
      })
      const onMove = (e: PointerEvent) => {
        const r = cta.getBoundingClientRect()
        const dx = (e.clientX - r.left) / r.width - 0.5
        const dy = (e.clientY - r.top) / r.height - 0.5
        for (const m of movers) {
          m.x(dx * 36 * m.depth)
          m.y(dy * 36 * m.depth)
        }
      }
      const onLeave = () => movers.forEach((m) => (m.x(0), m.y(0)))
      cta.addEventListener("pointermove", onMove)
      cta.addEventListener("pointerleave", onLeave)

      for (const el of icons) {
        el.addEventListener("pointerenter", () =>
          gsap.to(el, { scale: 1.14, rotate: gsap.utils.random(-12, 12), color: "#c9b0ff", duration: 0.4, ease: "back.out(2)" }),
        )
        el.addEventListener("pointerleave", () =>
          gsap.to(el, { scale: 1, rotate: 0, color: "#d4d4d4", duration: 0.6, ease: "power3.out" }),
        )
      }

      return () => {
        cta.removeEventListener("pointermove", onMove)
        cta.removeEventListener("pointerleave", onLeave)
      }
    }, cta)
    return () => ctx.revert()
  }, [])

  return (
    <footer className="mx-auto flex max-w-[1200px] flex-col gap-16 px-4 pt-36 pb-10 sm:px-6 max-[640px]:gap-12 max-[640px]:pt-24">
      <section
        ref={ctaRef}
        className="relative flex items-center overflow-hidden rounded-[24px] bg-mw-dark shadow-mw-dark-drop after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border-t after:border-[#ffffff59] max-[960px]:flex-col-reverse max-[960px]:items-stretch"
        aria-labelledby="footer-cta"
      >
        <div className="flex w-[500px] flex-none flex-col gap-8 px-12 pt-11 pb-12 max-[960px]:w-auto max-[960px]:items-center max-[960px]:p-7">
          <h2
            id="footer-cta"
            className="text-[52px] leading-[1.12] font-semibold tracking-[-0.03em] max-[960px]:text-center max-[960px]:text-[length:clamp(34px,8vw,52px)]"
          >
            <span className={CTA_LINE} data-cta-line>
              Start from
            </span>{" "}
            <span className={CTA_LINE} data-cta-line>
              any website
            </span>{" "}
            <span className={CTA_LINE} data-cta-line>
              in seconds
            </span>
          </h2>
          <div className="flex flex-col gap-[14px] max-[960px]:self-stretch">
            <Link
              className={`${CTA_BTN} bg-[linear-gradient(#f7f7f7,#ededed)] text-[#1c1c1c] shadow-[0_0_0_1px_#2020201a,0_1px_2px_#0000001a,0_4px_4px_#00000014,inset_0_1px_#fff]`}
              href="/start"
            >
              Start with your website
            </Link>
            <a className={`${CTA_BTN} bg-[#262626] text-[#fafafa] shadow-[inset_0_0_0_1px_#fff3]`} href="#setup">
              Connect your agent<span className="opacity-60 max-[960px]:hidden">&nbsp;over MCP</span>
            </a>
          </div>
        </div>
        <div
          className="relative h-[440px] min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,#0000_0%,#000_6%_94%,#0000_100%)] max-[960px]:h-[340px] max-[960px]:flex-none"
          aria-hidden="true"
        >
          <div className="absolute top-0 left-1/2 -ml-[320px] h-[440px] w-[640px]">
            {ART.map(([Icon, left, top, size, rotation], i) => (
              <span key={i} className="absolute" style={{ left, top, width: size, height: size, rotate: `${rotation}deg` }}>
                <span
                  className="absolute grid cursor-pointer place-items-center rounded-[28%] bg-[linear-gradient(160deg,#2e2e2e,#222)] text-[#d4d4d4] shadow-[inset_0_1px_#ffffff26,inset_0_0_0_1px_#ffffff12,0_10px_24px_-8px_#0009] [&_svg]:size-[46%] [&_svg]:stroke-[1.6]"
                  data-art data-size={size} style={{ inset: 0 }}>
                  <Icon />
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-12 px-2 max-[960px]:grid-cols-[1fr] max-[960px]:gap-10">
        <div className="flex max-w-[320px] flex-col items-start gap-4">
          <Logo />
          <p className="text-[14px] leading-[22px] text-mw-muted">
            Clone any landing page, edit it with AI or from any MCP client, and publish it to your own domain.
          </p>
        </div>
        <nav
          className="grid grid-cols-[repeat(3,160px)] gap-6 max-[960px]:grid-cols-2 max-[960px]:gap-x-4 max-[960px]:gap-y-8 [&:has(a:hover)_a:not(:hover)]:text-[#0000004d]"
          aria-label="Footer"
        >
          {COLUMNS.map((col) => (
            <div key={col.title} className="flex flex-col gap-4">
              <h2 className="text-[13px] font-medium text-mw-faint">{col.title}</h2>
              <ul className="flex list-none flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      className="text-[14px] font-medium tracking-[-0.01em] text-mw-strong transition-[color] duration-250 ease-mw-out"
                      href={link.href}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-[#00000012] px-2 pt-5 text-[13px] text-mw-faint max-[640px]:flex-col max-[640px]:items-start">
        <p>© {new Date().getFullYear()} Magicwebs. All rights reserved.</p>
        <p>Published pages are served from the edge on magicwebs.ai.</p>
      </div>

      <div
        className="pointer-events-none -mx-4 -mt-6 -mb-10 h-[calc(19cqi*0.82)] overflow-hidden select-none @container"
        aria-hidden="true"
      >
        <span className="block bg-[linear-gradient(#00000017_20%,#0000_85%)] bg-clip-text text-center text-[length:19cqi] leading-none font-[650] tracking-[-0.055em] whitespace-nowrap text-transparent">
          Magicwebs
        </span>
      </div>
    </footer>
  )
}

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

import s from "./landing.module.css"
import { prefersReducedMotion } from "./hero"
import { Logo } from "./ui"

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
      { label: "Start building", href: "/dashboard" },
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
    <footer className={s.footer}>
      <section ref={ctaRef} className={s.cta} aria-labelledby="footer-cta">
        <div className={s.ctaCopy}>
          <h2 id="footer-cta" className={s.ctaTitle}>
            <span data-cta-line>Start from</span> <span data-cta-line>any website</span>{" "}
            <span data-cta-line>in seconds</span>
          </h2>
          <div className={s.ctaActions}>
            <Link className={s.ctaLight} href="/dashboard">
              Clone your first page
            </Link>
            <a className={s.ctaDark} href="#setup">
              Connect your agent<span className={s.ctaMore}>&nbsp;over MCP</span>
            </a>
          </div>
        </div>
        <div className={s.ctaArt} aria-hidden="true">
          <div className={s.artField}>
            {ART.map(([Icon, left, top, size, rotation], i) => (
              <span key={i} className={s.artSlot} style={{ left, top, width: size, height: size, rotate: `${rotation}deg` }}>
                <span className={s.artIcon} data-art data-size={size} style={{ inset: 0 }}>
                  <Icon />
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className={s.directory}>
        <div className={s.brand}>
          <Logo />
          <p className={s.tagline}>
            Clone any landing page, edit it with AI or from any MCP client, and publish it to your own domain.
          </p>
        </div>
        <nav className={s.columns} aria-label="Footer">
          {COLUMNS.map((col) => (
            <div key={col.title} className={s.column}>
              <h2 className={s.columnTitle}>{col.title}</h2>
              <ul>
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a className={s.footLink} href={link.href}>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className={s.legal}>
        <p>© {new Date().getFullYear()} Magicwebs. All rights reserved.</p>
        <p>Published pages are served from the edge on magicwebs.ai.</p>
      </div>

      <div className={s.wordmark} aria-hidden="true">
        <span>Magicwebs</span>
      </div>
    </footer>
  )
}

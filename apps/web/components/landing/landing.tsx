"use client"

import "lenis/dist/lenis.css"

import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import Lenis from "lenis"
import { useLayoutEffect, useRef } from "react"

import { Footer } from "./footer"
import { Hero, prefersReducedMotion } from "./hero"
import s from "./landing.module.css"
import { Nav } from "./nav"
import { Replay } from "./replay"
import { Faq, Prompts, Reasons, Setup } from "./sections"

export function Landing() {
  const rootRef = useRef<HTMLDivElement>(null)

  // Smooth scrolling, driven by GSAP's ticker so ScrollTrigger stays in sync with it.
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return
    gsap.registerPlugin(ScrollTrigger)
    const lenis = new Lenis({ anchors: { offset: -96 }, autoRaf: false })
    lenis.on("scroll", ScrollTrigger.update)
    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [])

  // Headings, leads and blocks blur up into place as they scroll in; lists stagger row by row.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || prefersReducedMotion()) return
    gsap.registerPlugin(ScrollTrigger)
    const ctx = gsap.context(() => {
      for (const el of gsap.utils.toArray<HTMLElement>("[data-reveal]")) {
        const parts = el.matches("header") ? Array.from(el.children) : [el]
        gsap.fromTo(
          parts,
          { opacity: 0, y: 16, filter: "blur(8px)" },
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            clearProps: "filter",
            duration: 0.9,
            stagger: 0.08,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 85%", once: true },
          },
        )
      }
      for (const list of gsap.utils.toArray<HTMLElement>("[data-reveal-list]")) {
        gsap.fromTo(
          list.children,
          { opacity: 0, y: 14 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            stagger: 0.06,
            ease: "power3.out",
            scrollTrigger: { trigger: list, start: "top 85%", once: true },
          },
        )
      }
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={rootRef} className={s.page}>
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <Nav />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Replay />
        <Prompts />
        <Setup />
        <Reasons />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}

"use client"

import { useConvexAuth } from "convex/react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { AccountChip, AccountLoading } from "./account-chip"
import s from "./landing.module.css"
import { DarkButton, Logo } from "./ui"

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#setup", label: "MCP" },
  { href: "#safety", label: "Platform" },
  { href: "#faq", label: "FAQ" },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { isLoading, isAuthenticated } = useConvexAuth()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <header className={s.navWrap}>
      <nav className={s.nav} data-scrolled={scrolled || undefined} data-open={open || undefined}>
        <div className={s.navBar}>
          <Logo />
          <button
            type="button"
            className={s.toggle}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="landing-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
        </div>
        <div id="landing-menu" className={s.menu}>
          <ul className={s.links}>
            {LINKS.map((link) => (
              <li key={link.href}>
                <a className={s.navLink} href={link.href} onClick={() => setOpen(false)}>
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              {isLoading ? (
                <AccountLoading />
              ) : isAuthenticated ? (
                <AccountChip />
              ) : (
                <Link className={`${s.navLink} ${s.navSecondary}`} href="/start">
                  Log in
                </Link>
              )}
            </li>
          </ul>
          <div className={s.actions}>
            <DarkButton href="/start" small>
              Start building
            </DarkButton>
          </div>
        </div>
      </nav>
    </header>
  )
}

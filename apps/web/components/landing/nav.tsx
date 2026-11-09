"use client"

import { useConvexAuth } from "convex/react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { AccountChip, AccountLoading } from "./account-chip"
import { DarkButton, Logo } from "./ui"

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#setup", label: "MCP" },
  { href: "#safety", label: "Platform" },
  { href: "#faq", label: "FAQ" },
]

/* The bar is see-through at the top of the page and turns to frosted glass once scrolled or opened.
   Under 760px it becomes a dropdown: the menu is a column that fades in when [data-open]. */
const NAV =
  "group/nav pointer-events-auto relative flex h-[52px] w-full max-w-[1000px] items-center overflow-hidden rounded-[28px] bg-[#fff0] py-2 pr-2 pl-4 [--cta-w:150px] transition-[background-color,box-shadow,backdrop-filter,height] duration-600 ease-mw-spring [&:is([data-scrolled],[data-open])]:bg-[#ffffffd9] [&:is([data-scrolled],[data-open])]:shadow-[inset_0_0_0_1px_#fff6,inset_0_1px_0_#fff,0_0_0_0.5px_#00000029,0_21px_36px_-14px_#00000026] [&:is([data-scrolled],[data-open])]:[backdrop-filter:blur(15px)_saturate(1.4)] max-[760px]:h-12 max-[760px]:flex-col max-[760px]:items-stretch max-[760px]:pl-[14px] max-[760px]:data-open:h-[344px] max-[760px]:data-open:pb-4"

const BAR =
  "absolute top-[15px] left-2 h-0.5 w-4 rounded-[1px] bg-mw-accent transition-[rotate] duration-600 ease-mw-spring"

const LINK =
  "flex h-[30px] items-center rounded-[46px] px-[11px] py-1 text-[14px] font-medium tracking-[-0.02em] text-[#222] transition-[background-color] duration-300 ease-mw-out"

/** Under 760px the links and the button slide in once the menu opens. */
const REVEAL =
  "max-[760px]:pointer-events-none max-[760px]:translate-x-10 max-[760px]:translate-y-4 max-[760px]:opacity-0 max-[760px]:transition-[opacity,translate] max-[760px]:duration-600 max-[760px]:ease-mw-spring max-[760px]:group-data-open/nav:pointer-events-auto max-[760px]:group-data-open/nav:translate-none max-[760px]:group-data-open/nav:opacity-100"

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
    <header className="pointer-events-none fixed inset-x-4 top-3 z-50 flex justify-center sm:inset-x-6">
      <nav className={NAV} data-scrolled={scrolled || undefined} data-open={open || undefined}>
        <div className="flex flex-none items-center justify-between">
          <Logo />
          <button
            type="button"
            className="relative hidden size-8 rounded-[65px] bg-[#ffffffb3] shadow-[inset_0_0_0_1px_#fff6,inset_0_1px_#fff,0_0_0_0.5px_#00000014] max-[760px]:block"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="landing-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className={`${BAR} group-data-open/nav:-rotate-45`} />
            <span className={`${BAR} -rotate-90 group-data-open/nav:-rotate-135`} />
          </button>
        </div>
        <div
          id="landing-menu"
          className="ml-auto flex translate-x-(--cta-w) items-center transition-[translate] duration-600 ease-mw-spring group-data-scrolled/nav:translate-x-0 max-[760px]:mt-7 max-[760px]:ml-0 max-[760px]:translate-none max-[760px]:flex-col max-[760px]:items-stretch max-[760px]:gap-6"
        >
          <ul className={`flex list-none max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-2 ${REVEAL}`}>
            {LINKS.map((link) => (
              <li key={link.href}>
                <a className={`${LINK} hover:bg-[#8080801f]`} href={link.href} onClick={() => setOpen(false)}>
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
                <Link
                  className={`${LINK} ml-1.5 bg-white shadow-mw-chip hover:bg-[#f2f2f2] max-[760px]:ml-0`}
                  href="/start"
                >
                  Log in
                </Link>
              )}
            </li>
          </ul>
          <div
            className={`pointer-events-none flex items-center pl-2 opacity-0 transition-[opacity] duration-400 ease-mw-out min-[760px]:group-data-scrolled/nav:pointer-events-auto min-[760px]:group-data-scrolled/nav:opacity-100 max-[760px]:pl-0 ${REVEAL}`}
          >
            <DarkButton href="/start" small className="max-[760px]:h-10 max-[760px]:w-full">
              Start building
            </DarkButton>
          </div>
        </div>
      </nav>
    </header>
  )
}

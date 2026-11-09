"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useQuery } from "convex/react"
import { ChevronDown, LayoutDashboard, Loader2, LogOut } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { api } from "@magicwebs/backend/convex/_generated/api"

import s from "./landing.module.css"

type Viewer = { name?: string; email?: string; image?: string }

function displayName(viewer: Viewer | null | undefined) {
  return viewer?.name || viewer?.email?.split("@")[0] || "Account"
}

function initials(viewer: Viewer | null | undefined) {
  const words = displayName(viewer).split(/[\s._-]+/).filter(Boolean)
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : displayName(viewer).slice(0, 2)).toUpperCase()
}

/** Holds the account's place in a navbar while sign-in and the account load. */
export function AccountLoading({ className }: { className?: string }) {
  return (
    <span className={`${s.accountChip} ${s.chipLoading} ${className ?? ""}`} role="status" aria-label="Loading your account">
      <span className={s.chipAvatar} aria-hidden="true">
        <Loader2 className={s.chipSpin} />
      </span>
      <span className={s.chipBar} aria-hidden="true" />
    </span>
  )
}

/**
 * The signed-in person in the landing and start page navbars: their avatar and
 * name, opening a menu with the dashboard and sign out. The menu is portalled
 * so the navbar's rounded clip doesn't cut it off.
 */
export function AccountChip({ className }: { className?: string }) {
  const viewer = useQuery(api.users.viewer)
  const { signOut } = useAuthActions()
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null)
  const [imageOk, setImageOk] = useState(true)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onDown)
    window.addEventListener("scroll", close, { passive: true })
    window.addEventListener("resize", close)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onDown)
      window.removeEventListener("scroll", close)
      window.removeEventListener("resize", close)
    }
  }, [menu])

  function toggle() {
    if (menu) return setMenu(null)
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setMenu({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) })
  }

  if (viewer === undefined) return <AccountLoading className={className} />

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${s.accountChip} ${className ?? ""}`}
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={toggle}
      >
        <span className={s.chipAvatar} aria-hidden="true">
          {viewer?.image && imageOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewer.image} alt="" onError={() => setImageOk(false)} />
          ) : (
            initials(viewer)
          )}
        </span>
        <span className={s.chipName}>{displayName(viewer)}</span>
        <ChevronDown className={s.chipChev} aria-hidden="true" />
      </button>
      {menu &&
        createPortal(
          <div ref={menuRef} role="menu" className={s.chipMenu} style={{ top: menu.top, right: menu.right }}>
            <div className={s.chipWho}>
              <strong>{displayName(viewer)}</strong>
              {viewer?.email && <span>{viewer.email}</span>}
            </div>
            <Link role="menuitem" href="/dashboard" className={s.chipItem} onClick={() => setMenu(null)}>
              <LayoutDashboard />
              Dashboard
            </Link>
            <button
              role="menuitem"
              type="button"
              className={s.chipItem}
              onClick={() => {
                setMenu(null)
                void signOut()
              }}
            >
              <LogOut />
              Sign out
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}

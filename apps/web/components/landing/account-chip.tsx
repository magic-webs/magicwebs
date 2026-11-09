"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useQuery } from "convex/react"
import { ChevronDown, LayoutDashboard, Loader2, LogOut } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { api } from "@magicwebs/backend/convex/_generated/api"

const CHIP =
  "ml-1.5 inline-flex h-8 max-w-[200px] items-center gap-[7px] rounded-[99px] bg-white py-[3px] pr-[9px] pl-[3px] text-[14px] font-medium tracking-[-0.02em] text-[#222] shadow-[0_0_0_1px_#0000000a,0_1px_2px_#0000001a] transition-[background-color] duration-200 ease-[ease] hover:bg-[#f2f2f2]"

const AVATAR = "grid size-[26px] flex-none place-items-center overflow-hidden rounded-[99px] text-[11px] font-[650]"

const ITEM =
  "flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] font-medium text-[#222] hover:bg-[#f4f4f5] [&_svg]:size-4 [&_svg]:text-[#595959]"

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
    <span className={`${CHIP} pointer-events-none ${className ?? ""}`} role="status" aria-label="Loading your account">
      <span className={`${AVATAR} bg-[#f4f4f5] text-[#52525b]`} aria-hidden="true">
        <Loader2 className="size-[14px] animate-[mw-spin_0.9s_linear_infinite] motion-reduce:animate-none" />
      </span>
      <span
        className="mr-1 h-2.5 w-16 animate-[mw-shimmer_1.2s_linear_infinite] rounded-[99px] bg-[linear-gradient(90deg,#ececec_25%,#f7f7f7_50%,#ececec_75%)] [background-size:200%_100%] motion-reduce:animate-none"
        aria-hidden="true"
      />
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
        className={`${CHIP} ${className ?? ""}`}
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={toggle}
      >
        <span className={`${AVATAR} bg-[#18181b] text-white [&_img]:size-full [&_img]:object-cover`} aria-hidden="true">
          {viewer?.image && imageOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewer.image} alt="" onError={() => setImageOk(false)} />
          ) : (
            initials(viewer)
          )}
        </span>
        <span className="min-w-0 truncate">{displayName(viewer)}</span>
        <ChevronDown className="size-[14px] flex-none text-[#8a8a8a]" aria-hidden="true" />
      </button>
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-100 flex w-[240px] animate-[mw-menu_0.2s_cubic-bezier(0.23,1,0.32,1)] flex-col gap-0.5 rounded-[16px] bg-white p-1.5 font-sans text-black shadow-[0_0_0_1px_#0000000d,0_2px_4px_#0000000a,0_12px_24px_-6px_#00000014,0_40px_80px_-20px_#0000001f] scheme-light"
            style={{ top: menu.top, right: menu.right }}
          >
            <div className="mb-1 flex flex-col gap-px border-b border-[#e7e7e7] px-2.5 pt-2 pb-2.5 [&_span]:truncate [&_span]:text-[12px] [&_span]:text-[#707070] [&_strong]:truncate [&_strong]:text-[14px] [&_strong]:font-semibold">
              <strong>{displayName(viewer)}</strong>
              {viewer?.email && <span>{viewer.email}</span>}
            </div>
            <Link role="menuitem" href="/dashboard" className={ITEM} onClick={() => setMenu(null)}>
              <LayoutDashboard />
              Dashboard
            </Link>
            <button
              role="menuitem"
              type="button"
              className={ITEM}
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

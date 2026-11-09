"use client"

import { Check, ChevronRight, Copy } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { BrandMark } from "@/components/brand-mark"
import { cn } from "@/lib/utils"

/* Shared class strings for the marketing pages (landing and /start). Each is a self-contained
   set of utilities. Note: Tailwind's max-[Npx] variants mean `width < N`. */

export const darkBtnBase =
  "group relative inline-flex items-center justify-center gap-1.5 overflow-hidden rounded-[62px] bg-[linear-gradient(#333,#202020)] text-[14px] font-medium tracking-[-0.01em] whitespace-nowrap text-[#fafafa] shadow-mw-btn-dark select-none"

export const mw = {
  /** The white page shell: colours, type, and the accent focus ring for everything inside. */
  page: "min-h-svh overflow-x-clip bg-mw-bg font-sans text-[16px] leading-[1.5] text-mw-fg antialiased scheme-light [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-offset-2 [&_:focus-visible]:outline-mw-accent",
  /** Dotted grid that fades out towards the edges. */
  heroGrid:
    "absolute inset-0 bg-[radial-gradient(circle,#0000002e_1px,transparent_1.5px)] [background-position:center_top] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_20%,#000_20%,transparent_75%)]",
  /** Dark pill button. Pair with <DarkButtonLight /> as its first child, and `darkLabel`/`chev` inside. */
  darkBtn: `${darkBtnBase} h-10 min-w-[166px] pr-5 pl-6`,
  darkLabel: "relative",
  /** Chevron that nudges right when its `group` parent is hovered. */
  chev: "relative size-4 flex-none transition-[translate] duration-200 ease-mw-out group-hover:translate-x-0.5",
  ghostBtn:
    "group inline-flex h-10 items-center justify-center gap-1 rounded-[62px] px-[22px] text-[14px] font-medium tracking-[-0.01em] whitespace-nowrap text-[#202020] transition-[background-color] duration-200 ease-mw-out hover:bg-[#8080801f]",
  mono: "font-mw-mono",
}

/** Page-width wrapper: 1100px of content plus the gutter. */
export const container = "mx-auto w-full max-w-[1132px] px-4 sm:max-w-[1148px] sm:px-6"

/** The coloured light that spins inside a dark button while it's hovered. */
export function DarkButtonLight() {
  return (
    <span
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] [mask-image:linear-gradient(#000_0%,#0000_56%)]"
      aria-hidden="true"
    >
      <span className="absolute top-[-40px] left-1/2 -ml-[60px] size-[120px] animate-[mw-spin_3s_linear_infinite_paused] rounded-full bg-[conic-gradient(#ae0dff_0deg,#ffdf0d_115deg,#0dff99_238deg,#6d00ff_360deg)] mix-blend-screen blur-[20px] group-hover:[animation-play-state:running]" />
    </span>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 rounded-[8px] text-[16px] font-[650] tracking-[-0.03em] text-mw-fg",
        className,
      )}
      aria-label="Magicwebs home"
    >
      <BrandMark className="size-7 shrink-0" />
      Magicwebs
    </Link>
  )
}

export function DarkButton({
  href,
  children,
  small,
  className,
}: {
  href: string
  children: React.ReactNode
  small?: boolean
  className?: string
}) {
  const size = small ? `${darkBtnBase} h-[30px] min-w-0 pr-[10px] pl-[14px]` : mw.darkBtn
  return (
    <Link href={href} className={className ? `${size} ${className}` : size}>
      <DarkButtonLight />
      <span className={mw.darkLabel}>{children}</span>
      <ChevronRight className={mw.chev} />
    </Link>
  )
}

export function GhostButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={mw.ghostBtn}>
      {children}
      <ChevronRight className={mw.chev} />
    </Link>
  )
}

/** A dark code block with a copy button. `children` is the rendered code; `text` is what gets copied. */
export function Snippet({
  text,
  children,
  multiline,
}: {
  text: string
  children?: React.ReactNode
  multiline?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the code stays selectable.
    }
  }

  return (
    <div className="relative rounded-[16px] bg-mw-dark px-5 py-4 shadow-[0_2px_4px_#0000003d,0_7px_7px_#0003,0_17px_10px_#0000001f,0_30px_12px_#0000000a,inset_0_0_0_1px_#fff3]">
      <code
        className={`block overflow-x-auto pr-11 font-mw-mono text-[13px] whitespace-pre text-mw-on-dark [scrollbar-width:none] ${multiline ? "leading-[21px]" : "leading-[22px]"}`}
      >
        {children ?? text}
      </code>
      <button
        type="button"
        className="group absolute top-2.5 right-2.5 inline-flex h-8 cursor-pointer items-center rounded-[10px] bg-[#2c2c2c] px-2 text-[13px] font-medium text-mw-on-dark shadow-[0_0_0_1px_#ffffff14] transition-[background] duration-200 ease-[ease] hover:bg-[#363636] active:scale-[0.96] [&_svg]:size-4"
        onClick={copy}
        data-copied={copied || undefined}
        aria-label={copied ? "Copied" : "Copy"}
      >
        {copied ? <Check /> : <Copy />}
        <span
          className={`grid grid-cols-[0fr] opacity-0 [transition:grid-template-columns_0.22s_cubic-bezier(0.23,1,0.32,1),opacity_0.16s_cubic-bezier(0.23,1,0.32,1)] group-hover:grid-cols-[1fr] group-hover:opacity-100 group-focus-visible:grid-cols-[1fr] group-focus-visible:opacity-100 group-data-copied:grid-cols-[1fr] group-data-copied:opacity-100`}
          aria-hidden="true"
        >
          <span className="overflow-hidden whitespace-nowrap before:inline-block before:w-1.5">
            {copied ? "Copied" : "Copy"}
          </span>
        </span>
      </button>
    </div>
  )
}

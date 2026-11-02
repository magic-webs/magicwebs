"use client"

import { Check, ChevronRight, Copy, Sparkles } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

import s from "./landing.module.css"

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn(s.logo, className)} aria-label="Magicwebs home">
      <span className={s.logoMark}>
        <Sparkles />
      </span>
      Magicwebs
    </Link>
  )
}

export function DarkButton({
  href,
  children,
  small,
}: {
  href: string
  children: React.ReactNode
  small?: boolean
}) {
  return (
    <Link href={href} className={cn(s.darkBtn, small && s.darkBtnSm)}>
      <span className={s.lightMask} aria-hidden="true">
        <span className={s.light} />
      </span>
      <span className={s.darkLabel}>{children}</span>
      <ChevronRight className={s.chev} />
    </Link>
  )
}

export function GhostButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={s.ghostBtn}>
      {children}
      <ChevronRight className={s.chev} />
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
    <div className={cn(s.snippet, multiline && s.snippetMulti)}>
      <code className={cn(s.code, s.mono)}>{children ?? text}</code>
      <button
        type="button"
        className={s.copyBtn}
        onClick={copy}
        data-copied={copied || undefined}
        aria-label={copied ? "Copied" : "Copy"}
      >
        {copied ? <Check /> : <Copy />}
        <span className={s.copyLabel} aria-hidden="true">
          <span>{copied ? "Copied" : "Copy"}</span>
        </span>
      </button>
    </div>
  )
}

import Link from "next/link"
import type { ReactNode } from "react"

import { Logo } from "@/components/landing/ui"

/** Where people write about privacy, their data or these terms. */
export const LEGAL_CONTACT = "support@magicwebs.ai"

/**
 * The frame shared by /privacy and /terms: the logo, a title with its last
 * update, readable prose, and links between the two. Google's consent screen
 * links to both, so they stay public and outside the auth gate.
 */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-mw-bg text-mw-fg">
      <header className="mx-auto flex max-w-[760px] items-center justify-between px-4 py-6 sm:px-6">
        <Logo />
        <Link href="/start" className="text-[14px] font-medium text-mw-strong hover:text-mw-fg">
          Start building
        </Link>
      </header>

      <main className="mx-auto max-w-[760px] px-4 pt-10 pb-24 sm:px-6">
        <h1 className="text-[40px] leading-[1.15] font-semibold tracking-[-0.03em] max-[640px]:text-[32px]">{title}</h1>
        <p className="mt-3 text-[14px] text-mw-faint">Last updated {updated}</p>
        <div className="mt-10 space-y-5 text-[16px] leading-[1.7] text-mw-strong [&_a]:text-mw-link [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-12 [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-mw-fg [&_li]:mt-2 [&_strong]:font-semibold [&_strong]:text-mw-fg [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </div>
      </main>

      <footer className="mx-auto flex max-w-[760px] flex-wrap items-center justify-between gap-4 border-t border-mw-line px-4 py-6 text-[13px] text-mw-faint sm:px-6">
        <p>© {new Date().getFullYear()} Magicwebs</p>
        <nav className="flex gap-5" aria-label="Legal">
          <Link href="/privacy" className="hover:text-mw-strong">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-mw-strong">
            Terms
          </Link>
          <a href={`mailto:${LEGAL_CONTACT}`} className="hover:text-mw-strong">
            Contact
          </a>
        </nav>
      </footer>
    </div>
  )
}

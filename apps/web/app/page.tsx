import type { Metadata } from "next"
import { Geist, Manrope } from "next/font/google"

import { Landing } from "@/components/landing/landing"

export const metadata: Metadata = {
  title: "Magicwebs · Any website, ready for your agent to edit",
  description:
    "Clone any landing page exactly, edit it in the visual editor, with AI chat or from any MCP client, and publish it to your own domain.",
}

// The hero's typeface; the rest of the landing page uses the app's Inter.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
// The hero headline's typeface.
const manrope = Manrope({ subsets: ["latin"], weight: ["700"], variable: "--font-manrope" })

export default function Home() {
  return (
    <div className={`${geist.variable} ${manrope.variable}`}>
      <Landing />
    </div>
  )
}

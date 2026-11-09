import type { Metadata } from "next"
import { Geist } from "next/font/google"

import { StartClient } from "@/components/onboarding/start-client"

export const metadata: Metadata = {
  title: "Start · Magicwebs",
  description: "Enter your website and Magicwebs revamps it or rebuilds it exactly, ready to edit and publish.",
}

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined)

/**
 * Where new visitors make their first site, from the landing page: enter the
 * address, confirm it, choose a revamp or an exact copy, then watch it build.
 * Signing in happens here too, and nothing sends people on to the dashboard.
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  return (
    <div className={geist.variable}>
      <StartClient initialUrl={one(params.url)} projectId={one(params.project)} />
    </div>
  )
}

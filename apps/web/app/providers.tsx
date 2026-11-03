"use client"

import { ConvexAuthProvider } from "@convex-dev/auth/react"
import { ConvexReactClient } from "convex/react"
import * as React from "react"

import { ThemeProvider } from "@/components/theme-provider"

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      <ThemeProvider>{children}</ThemeProvider>
    </ConvexAuthProvider>
  )
}

"use client"

import { useConvexAuth } from "convex/react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"

import { Spinner } from "@/components/ui/spinner"

/** Renders its children only for signed-in users and sends everyone else to sign in. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace(`/signin?next=${encodeURIComponent(pathname)}`)
  }, [isLoading, isAuthenticated, pathname, router])

  if (!isAuthenticated) {
    return (
      <div className="grid min-h-svh place-items-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }
  return children
}

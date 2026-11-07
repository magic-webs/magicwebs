"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useAction, useConvexAuth, useQuery } from "convex/react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"

import { BrandMark } from "@/components/brand-mark"
import { errorText } from "@/components/dashboard/lib"
import { MagicAccountForm, type AccountFlow } from "@/components/magic-account-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

function Loading() {
  return (
    <div className="grid min-h-svh place-items-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  )
}

/**
 * Renders its children only for signed-in users with a Magic account, and
 * sends everyone else to sign in. Someone signed in with Google, or with a
 * password from before accounts moved to Magic Agent, connects one first.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const status = useQuery(api.magicAgent.status, isAuthenticated ? {} : "skip")
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace(`/signin?next=${encodeURIComponent(pathname)}`)
  }, [isLoading, isAuthenticated, pathname, router])

  if (!isAuthenticated || status === undefined || status === null) return <Loading />
  if (status.required) return <ConnectAccount email={status.email} reconnect={status.reconnect} />
  return children
}

function ConnectAccount({ email, reconnect }: { email: string | null; reconnect: boolean }) {
  const link = useAction(api.magicAgent.link)
  const { signOut } = useAuthActions()
  const [flow, setFlow] = useState<AccountFlow>("signIn")

  return (
    <main className="grid min-h-svh place-items-center bg-muted/40 px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-semibold">
          <BrandMark className="size-8 text-foreground" />
          Magicwebs
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{reconnect ? "Sign in again" : "Connect your Magic account"}</CardTitle>
            <CardDescription>
              {reconnect
                ? "Your Magic account sign-in has ended. Sign in again to keep your websites' agents in step."
                : "Magicwebs and Magic Agent now share one account. Each of your websites gets its own Magic Agent workspace, with an AI agent ready to answer its visitors."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <MagicAccountForm
              flow={flow}
              onFlowChange={setFlow}
              email={email ?? undefined}
              onSession={async (sessionToken) => {
                try {
                  await link({ sessionToken })
                } catch (err) {
                  throw new Error(errorText(err))
                }
              }}
            />
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

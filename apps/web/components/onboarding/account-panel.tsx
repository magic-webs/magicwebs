"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useAction, useConvexAuth, useQuery } from "convex/react"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"

import { errorText } from "@/components/dashboard/lib"
import { MagicAccountForm, type AccountFlow } from "@/components/magic-account-form"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"

import s from "./onboarding.module.css"

/**
 * Whether the visitor can make a site: signed in, with the Magic account each
 * site's agent workspace is made in.
 */
export function useAccountReady() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const status = useQuery(api.magicAgent.status, isAuthenticated ? {} : "skip")
  const ready = isAuthenticated && status != null && !status.required
  const loading = isLoading || (isAuthenticated && status === undefined)
  return { ready, loading, isAuthenticated, status }
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  )
}

/**
 * Sign in or open an account without leaving the page. Google sign-in has to
 * leave for Google, so it comes back to `returnTo` (on this page), never the
 * dashboard.
 */
export function AccountPanel({ returnTo, title, description }: { returnTo: string; title: string; description: string }) {
  const { signIn, signOut } = useAuthActions()
  const link = useAction(api.magicAgent.link)
  const { loading, isAuthenticated, status } = useAccountReady()
  const [flow, setFlow] = useState<AccountFlow>("signUp")
  const [google, setGoogle] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) {
    return (
      <div className={s.accountLoading}>
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  // Signed in with Google (or an old password) but without a Magic account yet.
  if (isAuthenticated && status?.required) {
    return (
      <div className={s.account}>
        <div className={s.accountHead}>
          <h3>{status.reconnect ? "Sign in to your Magic account again" : "Connect your Magic account"}</h3>
          <p>Each of your websites gets an AI agent that answers its visitors. It lives in your Magic account.</p>
        </div>
        <MagicAccountForm
          flow={flow}
          onFlowChange={setFlow}
          email={status.email ?? undefined}
          onSession={async (sessionToken) => {
            try {
              await link({ sessionToken })
            } catch (err) {
              throw new Error(errorText(err))
            }
          }}
        />
        <button type="button" className={s.textBtn} onClick={() => void signOut()}>
          Use a different account
        </button>
      </div>
    )
  }

  async function onGoogle() {
    setError(null)
    setGoogle(true)
    try {
      await signIn("google", { redirectTo: returnTo })
    } catch {
      setError("Couldn't start Google sign-in. Try again.")
      setGoogle(false)
    }
  }

  return (
    <div className={s.account}>
      <div className={s.accountHead}>
        <h3>{flow === "signIn" ? "Welcome back" : title}</h3>
        <p>{flow === "signIn" ? "Sign in to your Magic account. You'll stay right here." : description}</p>
      </div>
      <Button variant="outline" size="lg" onClick={onGoogle} disabled={google}>
        {google ? <Spinner /> : <GoogleIcon />}
        Continue with Google
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        or
        <Separator className="flex-1" />
      </div>
      <MagicAccountForm
        flow={flow}
        onFlowChange={setFlow}
        onSession={async (sessionToken) => {
          try {
            await signIn("magic-agent", { sessionToken })
          } catch {
            throw new Error("Couldn't sign you in. Try again.")
          }
        }}
        onWrongPassword={async (email, password) => {
          try {
            await signIn("password", { email, password, flow: "signIn" })
            return true
          } catch {
            return false
          }
        }}
      />
    </div>
  )
}

"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useConvexAuth } from "convex/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MagicAccountForm, type AccountFlow } from "@/components/magic-account-form"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"

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

export function SignInForm({ next }: { next: string }) {
  const { signIn } = useAuthActions()
  const { isAuthenticated } = useConvexAuth()
  const router = useRouter()
  const [flow, setFlow] = useState<AccountFlow>("signIn")
  const [google, setGoogle] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Covers coming back from Google as well as a password sign-in.
  useEffect(() => {
    if (isAuthenticated) router.replace(next)
  }, [isAuthenticated, next, router])

  async function onSession(sessionToken: string) {
    try {
      await signIn("magic-agent", { sessionToken })
    } catch {
      throw new Error("Couldn't sign you in. Try again.")
    }
  }

  // A password from before accounts moved to Magic Agent. It still signs in,
  // and the dashboard then asks the person to connect a Magic account.
  async function onWrongPassword(email: string, password: string) {
    try {
      await signIn("password", { email, password, flow: "signIn" })
      return true
    } catch {
      return false
    }
  }

  async function onGoogle() {
    setError(null)
    setGoogle(true)
    try {
      await signIn("google", { redirectTo: next })
    } catch {
      setError("Couldn't start Google sign-in. Try again.")
      setGoogle(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/40 px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-semibold">
          <BrandMark className="size-8 text-foreground" />
          Magicwebs
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>{flow === "signIn" ? "Sign in" : "Create your account"}</CardTitle>
            <CardDescription>
              {flow === "signIn"
                ? "One Magic account for Magicwebs and Magic Agent."
                : "One account for building your websites and the AI agents that answer their visitors."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Button variant="outline" onClick={onGoogle} disabled={google}>
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
              onSession={onSession}
              onWrongPassword={onWrongPassword}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

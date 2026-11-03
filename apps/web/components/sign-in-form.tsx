"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useConvexAuth } from "convex/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { SparkleIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"

type Flow = "signIn" | "signUp"

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
  const [flow, setFlow] = useState<Flow>("signIn")
  const [pending, setPending] = useState<"password" | "google" | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Covers coming back from Google as well as a password sign-in.
  useEffect(() => {
    if (isAuthenticated) router.replace(next)
  }, [isAuthenticated, next, router])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    form.set("flow", flow)
    setError(null)
    setPending("password")
    try {
      await signIn("password", form)
    } catch {
      setError(
        flow === "signIn"
          ? "That email and password don't match an account."
          : "Couldn't create the account. It may already exist, or the password is shorter than 8 characters.",
      )
      setPending(null)
    }
  }

  async function onGoogle() {
    setError(null)
    setPending("google")
    try {
      await signIn("google", { redirectTo: next })
    } catch {
      setError("Couldn't start Google sign-in. Try again.")
      setPending(null)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/40 px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <SparkleIcon solid className="size-4" />
          </span>
          Magicwebs
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>{flow === "signIn" ? "Sign in" : "Create your account"}</CardTitle>
            <CardDescription>
              {flow === "signIn" ? "Welcome back. Your pages are waiting." : "Clone, edit and publish pages with AI."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Button variant="outline" onClick={onGoogle} disabled={pending !== null}>
              {pending === "google" ? <Spinner /> : <GoogleIcon />}
              Continue with Google
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" />
              or
              <Separator className="flex-1" />
            </div>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={flow === "signIn" ? "current-password" : "new-password"}
                  minLength={8}
                  required
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={pending !== null}>
                {pending === "password" && <Spinner />}
                {flow === "signIn" ? "Sign in" : "Create account"}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground">
              {flow === "signIn" ? "New to Magicwebs?" : "Already have an account?"}{" "}
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setFlow(flow === "signIn" ? "signUp" : "signIn")
                  setError(null)
                }}
              >
                {flow === "signIn" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

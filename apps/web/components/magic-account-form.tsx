"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import {
  finishSignUp,
  finishTwoFactor,
  MagicAgentError,
  resendSignUpCode,
  signInToMagicAgent,
  startSignUp,
  type SignInStep,
} from "@/lib/magic-agent"

export type AccountFlow = "signIn" | "signUp"

type Stage =
  | { kind: "form" }
  | { kind: "twoFactor"; challenge: string }
  | { kind: "verify"; challenge: string; email: string }

/**
 * Signs in to a Magic account, or opens one (with the code emailed to the
 * address), and hands the session to `onSession`. One account works on
 * Magicwebs and Magic Agent alike.
 */
export function MagicAccountForm({
  flow,
  onFlowChange,
  onSession,
  onWrongPassword,
  email: fixedEmail,
}: {
  flow: AccountFlow
  onFlowChange: (flow: AccountFlow) => void
  onSession: (sessionToken: string) => Promise<void>
  /** A last try when Magic Agent rejects the password; true when it signed in some other way. */
  onWrongPassword?: (email: string, password: string) => Promise<boolean>
  /** Only this address may be used, e.g. when connecting an account to the one signed in. */
  email?: string
}) {
  const [stage, setStage] = useState<Stage>({ kind: "form" })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function run(work: () => Promise<void>) {
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      await work()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.")
      if (err instanceof MagicAgentError && err.restart) setStage({ kind: "form" })
    } finally {
      setPending(false)
    }
  }

  async function after(step: SignInStep) {
    if (step.status === "twoFactor") setStage({ kind: "twoFactor", challenge: step.challenge })
    else await onSession(step.sessionToken)
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = fixedEmail ?? String(form.get("email") ?? "").trim()
    const password = String(form.get("password") ?? "")
    const name = String(form.get("name") ?? "").trim()
    const code = String(form.get("code") ?? "").replace(/\D/g, "")

    void run(async () => {
      if (stage.kind === "twoFactor") return after(await finishTwoFactor(stage.challenge, code))
      if (stage.kind === "verify") return onSession(await finishSignUp(stage.challenge, code))
      if (flow === "signUp") {
        setStage({ kind: "verify", challenge: await startSignUp({ name, email, password }), email })
        return
      }
      try {
        await after(await signInToMagicAgent(email, password))
      } catch (err) {
        if (err instanceof MagicAgentError && onWrongPassword && (await onWrongPassword(email, password))) return
        throw err
      }
    })
  }

  if (stage.kind !== "form") {
    const verifying = stage.kind === "verify"
    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {verifying
            ? `We emailed a 6-digit code to ${stage.email}. Enter it to finish creating your account.`
            : "Enter the 6-digit code from your authenticator app, or one of your recovery codes."}
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">Code</Label>
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {verifying ? "Create account" : "Sign in"}
        </Button>
        <div className="flex justify-between text-sm">
          <button
            type="button"
            className="text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setStage({ kind: "form" })
              setError(null)
            }}
          >
            Back
          </button>
          {verifying && (
            <button
              type="button"
              disabled={pending}
              className="font-medium underline-offset-4 hover:underline"
              onClick={() =>
                run(async () => {
                  await resendSignUpCode(stage.challenge)
                  setNotice("A new code is on its way.")
                })
              }
            >
              Send a new code
            </button>
          )}
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {flow === "signUp" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" maxLength={80} required />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required={!fixedEmail}
          value={fixedEmail}
          readOnly={Boolean(fixedEmail)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={flow === "signIn" ? "current-password" : "new-password"}
          minLength={flow === "signUp" ? 12 : undefined}
          required
        />
        {flow === "signUp" && <p className="text-xs text-muted-foreground">At least 12 characters.</p>}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending && <Spinner />}
        {flow === "signIn" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {flow === "signIn" ? "No Magic account yet?" : "Already have a Magic account?"}{" "}
        <button
          type="button"
          className="font-medium text-foreground underline-offset-4 hover:underline"
          onClick={() => {
            onFlowChange(flow === "signIn" ? "signUp" : "signIn")
            setError(null)
          }}
        >
          {flow === "signIn" ? "Create one" : "Sign in"}
        </button>
      </p>
    </form>
  )
}

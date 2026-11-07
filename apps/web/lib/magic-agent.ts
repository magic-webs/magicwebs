// Accounts live on Magic Agent. The sign-in page calls its sign-in actions
// directly and hands the session they open to our "magic-agent" provider (or
// to magicAgent.link, for someone already signed in here). Sessions opened
// with `client: "magicwebs"` never sign the person out of Magic Agent itself.

export const MAGIC_AGENT_CONVEX_URL = process.env.NEXT_PUBLIC_MAGIC_AGENT_CONVEX_URL?.replace(/\/$/, "") || null
export const MAGIC_AGENT_URL = process.env.NEXT_PUBLIC_MAGIC_AGENT_URL?.replace(/\/$/, "") || null

export class MagicAgentError extends Error {
  constructor(
    message: string,
    /** The half-done sign-in or sign-up is gone; only starting over helps. */
    readonly restart = false,
  ) {
    super(message)
  }
}

type Reply<T> = { status: "success"; value: T } | { status: "error"; errorMessage?: string; errorData?: unknown }

async function action<T>(path: string, args: Record<string, unknown>): Promise<T> {
  if (!MAGIC_AGENT_CONVEX_URL) throw new MagicAgentError("Sign-in isn't set up yet.")
  let reply: Reply<T> | null = null
  try {
    const response = await fetch(`${MAGIC_AGENT_CONVEX_URL}/api/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, args, format: "json" }),
    })
    reply = (await response.json()) as Reply<T>
  } catch {
    throw new MagicAgentError("Couldn't reach the sign-in service. Check your connection and try again.")
  }
  if (reply.status === "success") return reply.value
  const data = reply.errorData
  if (typeof data === "string") throw new MagicAgentError(data)
  if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
    throw new MagicAgentError(data.message, "restart" in data && data.restart === true)
  }
  throw new MagicAgentError("Something went wrong. Try again.")
}

function device(): string | undefined {
  if (typeof navigator === "undefined") return undefined
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser"
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : null
  return `Magicwebs · ${browser}${os ? ` on ${os}` : ""}`
}

export type SignInStep = { status: "signedIn"; sessionToken: string } | { status: "twoFactor"; challenge: string }

type LoginOutcome =
  | { status: "signedIn"; sessionToken: string }
  | { status: "twoFactor"; challenge: string }
  | { status: "sessionActive"; challenge: string }

function step(outcome: LoginOutcome): SignInStep {
  if (outcome.status === "signedIn") return { status: "signedIn", sessionToken: outcome.sessionToken }
  if (outcome.status === "twoFactor") return { status: "twoFactor", challenge: outcome.challenge }
  // A "magicwebs" session never displaces another, so this can't happen.
  throw new MagicAgentError("Couldn't sign in. Try again.")
}

export async function signInToMagicAgent(email: string, password: string): Promise<SignInStep> {
  return step(
    await action<LoginOutcome>("auth:login", { username: email, password, client: "magicwebs", device: device() }),
  )
}

export async function finishTwoFactor(challenge: string, code: string): Promise<SignInStep> {
  return step(await action<LoginOutcome>("auth:continueLogin", { challenge, code }))
}

/** Emails a code to the address; the account is made once `finishSignUp` gets it back. */
export async function startSignUp(details: { name: string; email: string; password: string }): Promise<string> {
  const { challenge } = await action<{ challenge: string }>("auth:startSignUp", {
    ...details,
    client: "magicwebs",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: typeof navigator === "undefined" ? undefined : navigator.language,
  })
  return challenge
}

export async function resendSignUpCode(challenge: string): Promise<void> {
  await action("auth:resendSignUpCode", { challenge })
}

export async function finishSignUp(challenge: string, code: string): Promise<string> {
  const { sessionToken } = await action<{ sessionToken: string }>("auth:finishSignUp", {
    challenge,
    code,
    client: "magicwebs",
    device: device(),
  })
  return sessionToken
}

import { ConvexHttpClient } from "convex/browser"

import { api } from "@magicwebs/backend/convex/_generated/api"

import { env } from "./env"

// Every Convex call the API makes runs as the person it is acting for, so the
// backend's ownership checks apply to the AI chat and MCP clients exactly as
// they do to the platform UI.

/** A Convex client authenticated as the holder of a Convex Auth token (the platform UI's session). */
export function clientForToken(token: string): ConvexHttpClient {
  const client = new ConvexHttpClient(env.convexUrl)
  client.setAuth(token)
  return client
}

/** True if the token belongs to a signed-in user. */
export async function isSignedIn(client: ConvexHttpClient): Promise<boolean> {
  try {
    return (await client.query(api.users.viewer, {})) !== null
  } catch {
    return false
  }
}

// API keys are traded for a Convex Auth token through the "api-key" provider.
// Tokens are reused for a few minutes so a burst of MCP calls signs in once;
// a revoked key stops working at once, because its session is deleted.
const TOKEN_TTL_MS = 5 * 60 * 1000
const tokens = new Map<string, { token: string; expires: number }>()

async function keyId(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))
  return Buffer.from(digest).toString("base64url")
}

/** A Convex client signed in with a personal API key, or null if the key is invalid. */
export async function clientForApiKey(key: string): Promise<ConvexHttpClient | null> {
  const id = await keyId(key)
  const cached = tokens.get(id)
  if (cached && cached.expires > Date.now()) return clientForToken(cached.token)

  const signIn = new ConvexHttpClient(env.convexUrl)
  const result = await signIn.action(api.auth.signIn, { provider: "api-key", params: { key } }).catch(() => null)
  const token = result?.tokens?.token
  if (!token) {
    tokens.delete(id)
    return null
  }
  tokens.set(id, { token, expires: Date.now() + TOKEN_TTL_MS })
  return clientForToken(token)
}

export function bearer(request: Request): string | null {
  const match = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

import Google from "@auth/core/providers/google"
import { convexAuth } from "@convex-dev/auth/server"
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials"
import { Password } from "@convex-dev/auth/providers/Password"

import { ConvexError } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { signInWithMagicAgent } from "./magicAgent"

// Accounts live on Magic Agent: people sign in there and hand the session it
// opened to the "magic-agent" provider (see magicAgent.ts). Google stays, and
// the old passwords still sign in so their owners can connect a Magic account,
// but no new password account is made here. MCP clients and other agents sign
// in with a personal API key ("api-key"): the API server trades the key for a
// session token, so agents pass the same ownership checks as the platform UI.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        if (params.flow === "signUp") throw new ConvexError("Create your account with Magic Agent instead.")
        return { email: params.email as string }
      },
    }),
    Google,
    ConvexCredentials({
      id: "magic-agent",
      authorize: async (credentials, ctx) => signInWithMagicAgent(ctx, credentials.sessionToken),
    }),
    ConvexCredentials({
      id: "api-key",
      authorize: async (credentials, ctx): Promise<{ userId: Id<"users">; sessionId: Id<"authSessions"> } | null> => {
        if (typeof credentials.key !== "string") return null
        return ctx.runMutation(internal.apiKeys.signIn, { key: credentials.key })
      },
    }),
  ],
})

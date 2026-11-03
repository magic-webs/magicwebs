import Google from "@auth/core/providers/google"
import { convexAuth } from "@convex-dev/auth/server"
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials"
import { Password } from "@convex-dev/auth/providers/Password"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"

// People sign in to the platform with a password or Google. MCP clients and
// other agents sign in with a personal API key ("api-key"): the API server
// trades the key for a session token, so agents pass the same ownership
// checks as the platform UI.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password,
    Google,
    ConvexCredentials({
      id: "api-key",
      authorize: async (credentials, ctx): Promise<{ userId: Id<"users">; sessionId: Id<"authSessions"> } | null> => {
        if (typeof credentials.key !== "string") return null
        return ctx.runMutation(internal.apiKeys.signIn, { key: credentials.key })
      },
    }),
  ],
})

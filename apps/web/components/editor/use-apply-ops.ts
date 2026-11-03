"use client"

import { useMutation } from "convex/react"
import { ConvexError } from "convex/values"
import { useCallback, useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"
import type { Op } from "@magicwebs/page-schema"

/** Apply edit operations from the visual editor to one page, keeping the last error for display. */
export function useApplyOps(projectId: Id<"projects">, path: string) {
  const mutate = useMutation(api.drafts.applyOps)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback(
    async (...ops: Op[]) => {
      try {
        await mutate({ projectId, path, ops, source: "editor" })
        setError(null)
      } catch (err) {
        setError(err instanceof ConvexError ? String(err.data) : "That change couldn't be saved.")
      }
    },
    [mutate, projectId, path],
  )

  return { apply, error, clearError: () => setError(null) }
}

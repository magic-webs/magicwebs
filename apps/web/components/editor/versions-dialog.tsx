"use client"

import { useMutation, useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import { History } from "lucide-react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export function VersionsDialog({
  projectId,
  publishedVersionId,
}: {
  projectId: Id<"projects">
  publishedVersionId?: Id<"versions">
}) {
  const versions = useQuery(api.versions.list, { projectId })
  const rollback = useMutation(api.versions.rollback)
  const restore = useMutation(api.versions.restoreToDraft)

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <History />
        Versions
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Versions</DialogTitle>
          <DialogDescription>
            Every publish is saved. Roll back to make an earlier version live, or load it into the draft to keep editing.
          </DialogDescription>
        </DialogHeader>
        {versions === undefined ? null : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing published yet.</p>
        ) : (
          <ul className="flex max-h-96 flex-col divide-y overflow-y-auto">
            {versions.map((version) => (
              <li key={version._id} className="flex items-center gap-3 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    Version {version.number}
                    {version._id === publishedVersionId && <Badge>Live</Badge>}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {formatDistanceToNow(version.createdAt, { addSuffix: true })}
                    {version.note ? ` · ${version.note}` : ""}
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => restore({ projectId, versionId: version._id })}>
                  Load to draft
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={version._id === publishedVersionId}
                  onClick={() => rollback({ projectId, versionId: version._id })}
                >
                  Roll back
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

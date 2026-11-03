import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { AuthGate } from "@/components/auth-gate"
import { Editor } from "@/components/editor/editor"

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params
  return (
    <AuthGate>
      <Editor projectId={projectId as Id<"projects">} />
    </AuthGate>
  )
}

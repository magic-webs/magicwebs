import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { Editor } from "@/components/editor/editor"

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params
  return <Editor projectId={projectId as Id<"projects">} />
}

import { Badge } from "@/components/ui/badge"

export function ProjectStatus({ status, published }: { status: "cloning" | "ready" | "failed"; published?: boolean }) {
  if (status === "cloning") return <Badge variant="secondary">Cloning</Badge>
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>
  return <Badge variant={published ? "default" : "outline"}>{published ? "Live" : "Draft"}</Badge>
}

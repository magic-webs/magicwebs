import { query } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { viewerProjects } from "./lib"

// Read models for the dashboard, which looks across all of the signed-in
// user's projects at once.

/** Every domain of the user's projects with the project's name, newest first. */
export const domains = query({
  args: {},
  handler: async (ctx) => {
    const rows = []
    for (const project of await viewerProjects(ctx)) {
      const domains = await ctx.db
        .query("domains")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect()
      rows.push(...domains.map((d) => ({ ...d, projectName: project.name })))
    }
    return rows.sort((a, b) => b._creationTime - a._creationTime).slice(0, 200)
  },
})

export type ActivityItem =
  | {
      kind: "edit"
      id: Id<"edits">
      projectId: Id<"projects">
      projectName: string
      source: Doc<"edits">["source"]
      summary: string
      count: number
      createdAt: number
    }
  | {
      kind: "publish"
      id: Id<"versions">
      projectId: Id<"projects">
      projectName: string
      number: number
      note?: string
      createdAt: number
    }

/** Recent edits and publishes across the user's projects, merged into one feed. */
export const activity = query({
  args: {},
  handler: async (ctx): Promise<ActivityItem[]> => {
    const projects = await viewerProjects(ctx)
    const names = new Map(projects.map((p) => [p._id, p.name]))
    const edits: Doc<"edits">[] = []
    const versions: Doc<"versions">[] = []
    for (const project of projects) {
      edits.push(
        ...(await ctx.db
          .query("edits")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .order("desc")
          .take(60)),
      )
      versions.push(
        ...(await ctx.db
          .query("versions")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .order("desc")
          .take(60)),
      )
    }

    const items: ActivityItem[] = []
    for (const e of edits) {
      const projectName = names.get(e.projectId)
      if (!projectName) continue
      items.push({
        kind: "edit",
        id: e._id,
        projectId: e.projectId,
        projectName,
        source: e.source,
        summary: e.results[0] ?? `${e.ops.length} change${e.ops.length === 1 ? "" : "s"}`,
        count: Math.max(e.ops.length, e.results.length),
        createdAt: e.createdAt,
      })
    }
    for (const v of versions) {
      const projectName = names.get(v.projectId)
      if (!projectName) continue
      items.push({
        kind: "publish",
        id: v._id,
        projectId: v.projectId,
        projectName,
        number: v.number,
        note: v.note,
        createdAt: v.createdAt,
      })
    }
    return items.sort((a, b) => b.createdAt - a.createdAt).slice(0, 60)
  },
})

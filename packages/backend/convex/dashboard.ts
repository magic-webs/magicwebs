import { query } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"

// Read models for the dashboard, which looks across every project at once.

async function projectNames(ctx: QueryCtx, ids: Id<"projects">[]) {
  const names = new Map<Id<"projects">, string>()
  for (const id of new Set(ids)) {
    const project = await ctx.db.get(id)
    if (project) names.set(id, project.name)
  }
  return names
}

/** Every domain with the name of the project it serves, newest first. */
export const domains = query({
  args: {},
  handler: async (ctx) => {
    const domains = await ctx.db.query("domains").order("desc").take(200)
    const names = await projectNames(
      ctx,
      domains.map((d) => d.projectId),
    )
    return domains
      .filter((d) => names.has(d.projectId))
      .map((d) => ({ ...d, projectName: names.get(d.projectId)! }))
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

/** Recent edits and publishes across all projects, merged into one feed. */
export const activity = query({
  args: {},
  handler: async (ctx): Promise<ActivityItem[]> => {
    const edits = await ctx.db.query("edits").order("desc").take(60)
    const versions = await ctx.db.query("versions").order("desc").take(60)
    const names = await projectNames(ctx, [...edits.map((e) => e.projectId), ...versions.map((v) => v.projectId)])

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

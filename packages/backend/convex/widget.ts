import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import { requireProject } from "./lib"

// The Magic Agent chat widget on a published site. Every website's workspace
// gets a web channel (magicAgent.ts), and the edge worker adds that channel's
// embed script to every page, unless the site switches it off or a page hides
// it. The settings travel with the live lookup the edge makes on each request,
// so a change shows on the next page load without publishing.

const TEASER_MAX = 120

/** What the edge needs to add the widget to a site's pages, or null when it shows nowhere. */
export function edgeWidget(project: Doc<"projects">) {
  const widget = project.widget
  const origin = process.env.MAGIC_AGENT_URL?.replace(/\/$/, "")
  if (!widget?.enabled || !origin) return null
  return {
    src: `${origin}/widget/${widget.channelKey}/embed.js`,
    position: widget.position,
    color: widget.color,
    teaser: widget.teaser,
    hiddenPaths: widget.hiddenPaths ?? [],
  }
}

/** The project's widget settings, for the editor and the AI tools. */
export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId)
    const widget = project.widget
    if (!widget) {
      // Still being set up with the workspace, or the workspace couldn't be made.
      return { ready: false as const, workspace: project.magicAgent ?? null }
    }
    return {
      ready: true as const,
      enabled: widget.enabled,
      position: widget.position ?? "right",
      color: widget.color ?? null,
      teaser: widget.teaser ?? null,
      hiddenPaths: widget.hiddenPaths ?? [],
      workspaceSlug: project.magicAgent?.workspaceSlug ?? null,
    }
  },
})

/** Change the widget: on or off for the site, where it sits, its color and teaser, and which pages hide it. */
export const update = mutation({
  args: {
    projectId: v.id("projects"),
    enabled: v.optional(v.boolean()),
    position: v.optional(v.union(v.literal("left"), v.literal("right"))),
    /** A CSS color; an empty string goes back to the page's primary color. */
    color: v.optional(v.string()),
    /** An empty string removes it. */
    teaser: v.optional(v.string()),
    /** Show or hide it on one page. */
    page: v.optional(v.object({ path: v.string(), visible: v.boolean() })),
  },
  handler: async (ctx, { projectId, enabled, position, color, teaser, page }) => {
    const project = await requireProject(ctx, projectId)
    const widget = project.widget
    if (!widget) throw new ConvexError("The chat widget is still being set up with this site's Magic Agent workspace.")

    const next = { ...widget }
    if (enabled !== undefined) next.enabled = enabled
    if (position !== undefined) next.position = position
    if (color !== undefined) {
      const value = color.trim()
      if (value && !/^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/]+\))$/i.test(value)) {
        throw new ConvexError("Use a hex, rgb() or hsl() color for the widget")
      }
      next.color = value || undefined
    }
    if (teaser !== undefined) next.teaser = teaser.trim().slice(0, TEASER_MAX) || undefined
    if (page) {
      const hidden = new Set(widget.hiddenPaths ?? [])
      if (page.visible) hidden.delete(page.path)
      else hidden.add(page.path)
      next.hiddenPaths = [...hidden]
    }
    await ctx.db.patch(projectId, { widget: next })
    // Workers KV is the edge's fallback copy; keep it in step.
    if (project.publishedVersionId) await ctx.scheduler.runAfter(0, internal.edge.syncSite, { projectId })
  },
})

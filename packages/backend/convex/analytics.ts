import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { internalAction, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server"
import { requireProject } from "./lib"

// Visitor analytics for published sites. The edge adds a small beacon to every
// page: a view when it loads, then how long it was visible and how far it was
// scrolled when the visitor leaves. The worker forwards both to
// /analytics/collect (http.ts), which lands here.
//
// Raw views live in `pageviews` for RAW_DAYS. Every few minutes `rollup`
// recomputes each site-day whose views changed into one `analyticsDays` row,
// and the dashboard reads those, so a busy site costs the same to chart as a
// quiet one. Days are UTC.

const RAW_DAYS = 8
const DAY_MS = 24 * 60 * 60 * 1000
/** Entries kept per breakdown per day. */
const TOP = 100
/** Someone is "online now" if they loaded a page this recently. */
const LIVE_MS = 5 * 60 * 1000
const MAX_DURATION_MS = 30 * 60 * 1000

export const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10)

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|curl|wget|python|httpclient|monitor|uptime/i

/** Device, browser and OS from a user agent, or null for a bot. */
export function describeAgent(ua: string): { device: "desktop" | "mobile" | "tablet"; browser: string; os: string } | null {
  if (!ua || BOT.test(ua)) return null
  const device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua) ? "tablet" : /Mobi|iPhone|iPod|Android/i.test(ua) ? "mobile" : "desktop"
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Firefox\/|FxiOS/.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Other"
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "Other"
  return { device, browser, os }
}

async function siteFor(ctx: QueryCtx, hostname: string) {
  const domain = await ctx.db
    .query("domains")
    .withIndex("by_hostname", (q) => q.eq("hostname", hostname))
    .first()
  if (!domain || domain.status !== "active") return null
  const project = await ctx.db.get(domain.projectId)
  return project?.publishedVersionId ? project : null
}

const clip = (value: string | undefined, max = 200) => value?.trim().slice(0, max) || undefined

export const recordView = internalMutation({
  args: {
    hostname: v.string(),
    path: v.string(),
    visitor: v.string(),
    referrer: v.optional(v.string()),
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    device: v.union(v.literal("desktop"), v.literal("mobile"), v.literal("tablet")),
    browser: v.string(),
    os: v.string(),
  },
  handler: async (ctx, { hostname, ...view }): Promise<Id<"pageviews"> | null> => {
    const project = await siteFor(ctx, hostname)
    if (!project) return null
    const now = Date.now()
    return ctx.db.insert("pageviews", {
      ...view,
      projectId: project._id,
      day: dayOf(now),
      path: view.path.slice(0, 300) || "/",
      referrer: clip(view.referrer, 120),
      utmSource: clip(view.utmSource, 80),
      utmMedium: clip(view.utmMedium, 80),
      utmCampaign: clip(view.utmCampaign, 120),
      country: clip(view.country, 8),
      city: clip(view.city, 80),
      createdAt: now,
      updatedAt: now,
    })
  },
})

/** How long a view was visible and how far it was scrolled, sent as the visitor leaves. */
export const recordEngagement = internalMutation({
  args: { hostname: v.string(), id: v.string(), duration: v.number(), scroll: v.number() },
  handler: async (ctx, { hostname, id, duration, scroll }) => {
    const viewId = ctx.db.normalizeId("pageviews", id)
    const view = viewId && (await ctx.db.get(viewId))
    if (!view) return
    // Only the site the view was on may add to it.
    const project = await siteFor(ctx, hostname)
    if (!project || project._id !== view.projectId) return
    const ms = Math.min(Math.max(Math.round(duration), 0), MAX_DURATION_MS)
    const depth = Math.min(Math.max(Math.round(scroll), 0), 100)
    if ((view.duration ?? -1) >= ms && (view.scroll ?? -1) >= depth) return
    await ctx.db.patch(view._id, {
      duration: Math.max(ms, view.duration ?? 0),
      scroll: Math.max(depth, view.scroll ?? 0),
      updatedAt: Date.now(),
    })
  },
})

// --- Rollup -------------------------------------------------------------------

export const rollupState = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("analyticsState").first(),
})

export const setRolledUpTo = internalMutation({
  args: { time: v.number() },
  handler: async (ctx, { time }) => {
    const state = await ctx.db.query("analyticsState").first()
    if (state) await ctx.db.patch(state._id, { rolledUpTo: time })
    else await ctx.db.insert("analyticsState", { rolledUpTo: time })
  },
})

/** The site-days of views that changed in a time window, a page at a time. */
export const changedDays = internalQuery({
  args: { after: v.number(), before: v.number(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { after, before, paginationOpts }) => {
    const result = await ctx.db
      .query("pageviews")
      .withIndex("by_updated", (q) => q.gt("updatedAt", after).lte("updatedAt", before))
      .paginate(paginationOpts)
    return {
      ...result,
      page: [...new Set(result.page.map((view) => `${view.projectId}|${view.day}`))],
    }
  },
})

type ViewFields = Pick<
  Doc<"pageviews">,
  "path" | "visitor" | "referrer" | "utmSource" | "utmCampaign" | "country" | "device" | "browser" | "os" | "duration"
>

export const dayViews = internalQuery({
  args: { projectId: v.id("projects"), day: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { projectId, day, paginationOpts }) => {
    const result = await ctx.db
      .query("pageviews")
      .withIndex("by_project_day", (q) => q.eq("projectId", projectId).eq("day", day))
      .paginate(paginationOpts)
    return {
      ...result,
      page: result.page.map(
        (view): ViewFields => ({
          path: view.path,
          visitor: view.visitor,
          referrer: view.referrer,
          utmSource: view.utmSource,
          utmCampaign: view.utmCampaign,
          country: view.country,
          device: view.device,
          browser: view.browser,
          os: view.os,
          duration: view.duration,
        }),
      ),
    }
  },
})

type Counted = { key: string; count: number }

function top(counts: Map<string, number>): Counted[] {
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP)
}

function bump(counts: Map<string, number>, key: string | undefined) {
  if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
}

/** One day's numbers from its views. */
export function summarise(views: ViewFields[]) {
  const perVisitor = new Map<string, number>()
  const pages = new Map<string, { views: number; visitors: Set<string> }>()
  const dims = {
    referrers: new Map<string, number>(),
    sources: new Map<string, number>(),
    campaigns: new Map<string, number>(),
    countries: new Map<string, number>(),
    devices: new Map<string, number>(),
    browsers: new Map<string, number>(),
    os: new Map<string, number>(),
  }
  let durationMs = 0
  let timedViews = 0
  for (const view of views) {
    perVisitor.set(view.visitor, (perVisitor.get(view.visitor) ?? 0) + 1)
    const page = pages.get(view.path) ?? { views: 0, visitors: new Set<string>() }
    page.views += 1
    page.visitors.add(view.visitor)
    pages.set(view.path, page)
    bump(dims.referrers, view.referrer ?? "Direct")
    bump(dims.sources, view.utmSource)
    bump(dims.campaigns, view.utmCampaign)
    bump(dims.countries, view.country)
    bump(dims.devices, view.device)
    bump(dims.browsers, view.browser)
    bump(dims.os, view.os)
    if (view.duration !== undefined) {
      durationMs += view.duration
      timedViews += 1
    }
  }
  return {
    visitors: perVisitor.size,
    pageviews: views.length,
    bounces: [...perVisitor.values()].filter((count) => count === 1).length,
    durationMs,
    timedViews,
    pages: [...pages]
      .map(([key, page]) => ({ key, views: page.views, visitors: page.visitors.size }))
      .sort((a, b) => b.views - a.views)
      .slice(0, TOP),
    referrers: top(dims.referrers),
    sources: top(dims.sources),
    campaigns: top(dims.campaigns),
    countries: top(dims.countries),
    devices: top(dims.devices),
    browsers: top(dims.browsers),
    os: top(dims.os),
  }
}

export const saveDay = internalMutation({
  args: { projectId: v.id("projects"), day: v.string(), summary: v.any() },
  handler: async (ctx, { projectId, day, summary }) => {
    if (!(await ctx.db.get(projectId))) return
    const existing = await ctx.db
      .query("analyticsDays")
      .withIndex("by_project_day", (q) => q.eq("projectId", projectId).eq("day", day))
      .unique()
    const row = { ...(summary as ReturnType<typeof summarise>), updatedAt: Date.now() }
    if (existing) await ctx.db.replace(existing._id, { projectId, day, ...row })
    else await ctx.db.insert("analyticsDays", { projectId, day, ...row })
  },
})

/** Recompute every site-day whose views changed since the last run. Runs from crons.ts. */
export const rollup = internalAction({
  args: {},
  handler: async (ctx) => {
    const before = Date.now()
    const state = await ctx.runQuery(internal.analytics.rollupState, {})
    const after = state?.rolledUpTo ?? before - 2 * DAY_MS

    const keys = new Set<string>()
    let cursor: string | null = null
    for (;;) {
      const result: { page: string[]; isDone: boolean; continueCursor: string } = await ctx.runQuery(
        internal.analytics.changedDays,
        { after, before, paginationOpts: { numItems: 2000, cursor } },
      )
      result.page.forEach((key) => keys.add(key))
      if (result.isDone) break
      cursor = result.continueCursor
    }

    for (const key of keys) {
      const [projectId, day] = key.split("|") as [Id<"projects">, string]
      const views: ViewFields[] = []
      let dayCursor: string | null = null
      for (;;) {
        const result: { page: ViewFields[]; isDone: boolean; continueCursor: string } = await ctx.runQuery(
          internal.analytics.dayViews,
          { projectId, day, paginationOpts: { numItems: 4000, cursor: dayCursor } },
        )
        views.push(...result.page)
        if (result.isDone) break
        dayCursor = result.continueCursor
      }
      await ctx.runMutation(internal.analytics.saveDay, { projectId, day, summary: summarise(views) })
    }
    await ctx.runMutation(internal.analytics.setRolledUpTo, { time: before })
  },
})

/** Drop raw views older than RAW_DAYS, once they're in their day's rollup. Runs from crons.ts. */
export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RAW_DAYS * DAY_MS
    const old = await ctx.db
      .query("pageviews")
      .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
      .take(1000)
    for (const view of old) await ctx.db.delete(view._id)
    if (old.length === 1000) await ctx.scheduler.runAfter(0, internal.analytics.prune, {})
  },
})

// --- Dashboard ----------------------------------------------------------------

function merge(lists: Counted[][], limit = 10): Counted[] {
  const totals = new Map<string, number>()
  for (const list of lists) for (const { key, count } of list) totals.set(key, (totals.get(key) ?? 0) + count)
  return top(totals).slice(0, limit)
}

function totalsOf(rows: Doc<"analyticsDays">[], leads: number) {
  const visitors = rows.reduce((sum, r) => sum + r.visitors, 0)
  const pageviews = rows.reduce((sum, r) => sum + r.pageviews, 0)
  const bounces = rows.reduce((sum, r) => sum + r.bounces, 0)
  const durationMs = rows.reduce((sum, r) => sum + r.durationMs, 0)
  const timedViews = rows.reduce((sum, r) => sum + r.timedViews, 0)
  return {
    visitors,
    pageviews,
    bounceRate: visitors ? bounces / visitors : null,
    avgTimeMs: timedViews ? durationMs / timedViews : null,
    viewsPerVisitor: visitors ? pageviews / visitors : null,
    leads,
    conversionRate: visitors ? leads / visitors : null,
  }
}

async function daysBetween(ctx: QueryCtx, projectId: Id<"projects">, from: string, to: string) {
  return ctx.db
    .query("analyticsDays")
    .withIndex("by_project_day", (q) => q.eq("projectId", projectId).gte("day", from).lte("day", to))
    .collect()
}

/**
 * A site's traffic over the last `days` days (today included), with the same
 * numbers for the period before it, a row per day, the top pages, sources,
 * places and devices, and who is on the site now.
 */
export const summary = query({
  args: { projectId: v.id("projects"), days: v.number() },
  handler: async (ctx, { projectId, days }) => {
    await requireProject(ctx, projectId)
    const span = Math.min(Math.max(Math.round(days), 1), 365)
    const now = Date.now()
    const today = dayOf(now)
    const start = dayOf(now - (span - 1) * DAY_MS)
    const prevStart = dayOf(now - (2 * span - 1) * DAY_MS)
    const prevEnd = dayOf(now - span * DAY_MS)
    const startTime = Date.parse(`${start}T00:00:00Z`)
    const prevStartTime = Date.parse(`${prevStart}T00:00:00Z`)

    const [rows, prevRows, recent, leadRows] = await Promise.all([
      daysBetween(ctx, projectId, start, today),
      daysBetween(ctx, projectId, prevStart, prevEnd),
      ctx.db
        .query("pageviews")
        .withIndex("by_project_time", (q) => q.eq("projectId", projectId).gt("createdAt", now - LIVE_MS))
        .take(2000),
      ctx.db
        .query("leads")
        .withIndex("by_project", (q) => q.eq("projectId", projectId).gte("createdAt", prevStartTime))
        .take(10000),
    ])

    const leadsByDay = new Map<string, number>()
    for (const lead of leadRows) leadsByDay.set(dayOf(lead.createdAt), (leadsByDay.get(dayOf(lead.createdAt)) ?? 0) + 1)
    const leadsIn = leadRows.filter((l) => l.createdAt >= startTime).length
    const leadsBefore = leadRows.length - leadsIn

    const byDay = new Map(rows.map((r) => [r.day, r]))
    const series = Array.from({ length: span }, (_, i) => {
      const day = dayOf(Date.parse(`${start}T00:00:00Z`) + i * DAY_MS)
      const row = byDay.get(day)
      return { day, visitors: row?.visitors ?? 0, pageviews: row?.pageviews ?? 0, leads: leadsByDay.get(day) ?? 0 }
    })

    const pages = new Map<string, { views: number; visitors: number }>()
    for (const row of rows) {
      for (const page of row.pages) {
        const entry = pages.get(page.key) ?? { views: 0, visitors: 0 }
        entry.views += page.views
        entry.visitors += page.visitors
        pages.set(page.key, entry)
      }
    }

    const liveVisitors = new Set(recent.map((view) => view.visitor))
    const livePages = new Map<string, Set<string>>()
    for (const view of recent) livePages.set(view.path, (livePages.get(view.path) ?? new Set()).add(view.visitor))

    return {
      start,
      end: today,
      totals: totalsOf(rows, leadsIn),
      previous: totalsOf(prevRows, leadsBefore),
      series,
      pages: [...pages]
        .map(([key, page]) => ({ key, ...page }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10),
      referrers: merge(rows.map((r) => r.referrers)),
      sources: merge(rows.map((r) => r.sources)),
      campaigns: merge(rows.map((r) => r.campaigns)),
      countries: merge(rows.map((r) => r.countries)),
      devices: merge(rows.map((r) => r.devices)),
      browsers: merge(rows.map((r) => r.browsers)),
      os: merge(rows.map((r) => r.os)),
      live: {
        visitors: liveVisitors.size,
        pages: [...livePages]
          .map(([key, visitors]) => ({ key, count: visitors.size }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      },
    }
  },
})

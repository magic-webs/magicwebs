import { authTables } from "@convex-dev/auth/server"
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

import { aiEffort, aiMode, aiModel, aiUsage, storedTemplateId } from "./models"

// Page documents are stored as `v.any()` and validated with the shared Zod
// schema from @magicwebs/page-schema, which is the real contract.
export default defineSchema({
  ...authTables,

  /** Personal keys MCP clients and other agents authenticate with. Only a hash is stored. */
  apiKeys: defineTable({
    userId: v.id("users"),
    name: v.string(),
    /** First characters of the key, shown so people can tell their keys apart. */
    prefix: v.string(),
    hash: v.string(),
    /** The auth session agents using this key sign in to; deleted when the key is revoked. */
    sessionId: v.optional(v.id("authSessions")),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_hash", ["hash"])
    .index("by_user", ["userId"]),

  /**
   * The Magic Agent account a user signs in with. Accounts live on Magic Agent;
   * this is the link to one, and the session Magicwebs acts with on its behalf
   * (creating a workspace per website). The session token is a credential:
   * it never leaves the backend.
   */
  magicAgentAccounts: defineTable({
    userId: v.id("users"),
    /** The Magic Agent `users` id. */
    maUserId: v.string(),
    email: v.string(),
    sessionToken: v.string(),
    /** When the session is expected to end; a failed call ends it sooner. */
    expiresAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_ma_user", ["maUserId"]),

  projects: defineTable({
    /** Owner. Optional only for projects made before accounts existed; see migrations.claimProjects. */
    userId: v.optional(v.id("users")),
    name: v.string(),
    slug: v.string(),
    sourceUrl: v.string(),
    model: v.optional(aiModel),
    effort: v.optional(aiEffort),
    /**
     * Set on revamps: every page is rebuilt by AI in this design template
     * instead of being copied exactly.
     */
    template: v.optional(storedTemplateId),
    /** Usage of the latest successful rebuild. */
    usage: v.optional(aiUsage),
    status: v.union(v.literal("cloning"), v.literal("ready"), v.literal("failed")),
    step: v.optional(v.string()),
    error: v.optional(v.string()),
    publishedVersionId: v.optional(v.id("versions")),
    publishedAt: v.optional(v.number()),
    /** Pending auto-publish after the latest edit. */
    autoPublishId: v.optional(v.id("_scheduled_functions")),
    /** The site's own workspace on Magic Agent, made with it (see magicAgent.ts). */
    magicAgent: v.optional(
      v.object({
        status: v.union(v.literal("pending"), v.literal("creating"), v.literal("ready"), v.literal("failed")),
        workspaceSlug: v.optional(v.string()),
        /** The workspace's "Website enquiry" book's incoming URL, where every lead is sent. */
        leadsUrl: v.optional(v.string()),
        error: v.optional(v.string()),
      }),
    ),
    /** The blog's heading and intro, shown at /blog. */
    blog: v.optional(v.object({ title: v.optional(v.string()), intro: v.optional(v.string()) })),
    /**
     * Keeping the workspace in step with the site: company details, front
     * desk, marketing desk and a knowledge source per page (magicAgent.syncAgent).
     */
    agentSync: v.optional(
      v.object({
        scheduledId: v.optional(v.id("_scheduled_functions")),
        syncedAt: v.optional(v.number()),
        error: v.optional(v.string()),
      }),
    ),
    /** What the original website states about the business (parseSiteDetails), cached for a week. */
    originalDetails: v.optional(v.object({ fetchedAt: v.number(), details: v.any() })),
    /** Forms that don't collect leads, by key (see leads.ts). Every other form does. */
    stoppedForms: v.optional(v.array(v.string())),
    /**
     * The workspace's chat widget, which the edge adds to every published page
     * unless it's switched off or hidden on that page. Changes go live without
     * publishing (see widget.ts).
     */
    widget: v.optional(
      v.object({
        channelKey: v.string(),
        enabled: v.boolean(),
        position: v.optional(v.union(v.literal("left"), v.literal("right"))),
        /** Launcher color; the page's primary color when unset. */
        color: v.optional(v.string()),
        /** One-line bubble beside the launcher. */
        teaser: v.optional(v.string()),
        /** Pages that don't show it. */
        hiddenPaths: v.optional(v.array(v.string())),
      }),
    ),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_user", ["userId"]),

  /**
   * The pages of a project's site, without their documents (those are in
   * drafts), so listing pages stays cheap. Projects made before sites had
   * several pages have no rows here; their single draft is the home page.
   */
  pages: defineTable({
    projectId: v.id("projects"),
    /** Where the clone serves the page: "/" for the home page, else e.g. "/about". */
    path: v.string(),
    title: v.string(),
    /** The original page this one is cloned from. */
    sourceUrl: v.string(),
    status: v.union(v.literal("cloning"), v.literal("ready"), v.literal("failed")),
    step: v.optional(v.string()),
    error: v.optional(v.string()),
    /** Position in the page list; the home page is 0. */
    order: v.number(),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId", "order"])
    .index("by_project_path", ["projectId", "path"]),

  /** The editable document of one page. A draft without `path` (older projects) is the home page. */
  drafts: defineTable({
    projectId: v.id("projects"),
    path: v.optional(v.string()),
    doc: v.any(),
    revision: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_path", ["projectId", "path"]),

  edits: defineTable({
    projectId: v.id("projects"),
    revision: v.number(),
    source: v.union(
      v.literal("editor"),
      v.literal("ai"),
      v.literal("mcp"),
      v.literal("clone"),
      v.literal("rollback"),
      /** The pages linked to the blog when its first post was published. */
      v.literal("blog"),
    ),
    ops: v.array(v.any()),
    results: v.array(v.string()),
    /** The page edited; missing means the home page. */
    path: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  versions: defineTable({
    projectId: v.id("projects"),
    number: v.number(),
    /** The home page. */
    doc: v.any(),
    /**
     * Every page of the site at this version. Each page is a snapshot: the
     * hash of its stored document in the blobs table, so unchanged pages are
     * shared between versions. Missing on versions from before multi-page sites.
     */
    pages: v.optional(
      v.array(v.object({ path: v.string(), title: v.string(), sourceUrl: v.string(), snapshot: v.string() })),
    ),
    note: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_project", ["projectId", "number"]),

  jobs: defineTable({
    projectId: v.id("projects"),
    /** The page this job clones; missing means the home page. */
    path: v.optional(v.string()),
    url: v.string(),
    model: v.optional(aiModel),
    effort: v.optional(aiEffort),
    usage: v.optional(aiUsage),
    /** Whose AI rebuilds the page when it is too large to copy; defaults to the platform's. */
    ai: v.optional(aiMode),
    /** Revamp the page in this template instead of copying it. */
    template: v.optional(storedTemplateId),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("awaiting_agent"),
      v.literal("done"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    workerId: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_project", ["projectId"]),

  /**
   * What an agent needs to rebuild a page itself (agent-mode jobs whose page is
   * too large to copy): screenshots in file storage and the captured structure.
   */
  rebuildBriefs: defineTable({
    projectId: v.id("projects"),
    jobId: v.id("jobs"),
    /** The page being rebuilt; missing means the home page. */
    path: v.optional(v.string()),
    url: v.string(),
    /** Set when the page is to be revamped in this template rather than rebuilt as it is. */
    template: v.optional(storedTemplateId),
    screenshots: v.array(v.id("_storage")),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  /**
   * The in-app AI chat of each project, one row per message, in order. Holds
   * AI SDK UI messages, including the page context each user turn was sent
   * with, so the conversation replays byte for byte and stays prompt-cached.
   */
  chatMessages: defineTable({
    projectId: v.id("projects"),
    messageId: v.string(),
    message: v.any(),
  })
    .index("by_project", ["projectId"])
    .index("by_message", ["projectId", "messageId"]),

  /**
   * What visitors sent through the published site's forms. Each is also sent
   * to the site's Magic Agent workspace, as a record in its "Website enquiry"
   * book; `delivery` says how that went.
   */
  leads: defineTable({
    projectId: v.id("projects"),
    /** Page the form was on. */
    path: v.string(),
    /** The form: a form section's id, or "<section id>:<n>" for the n-th form inside a copied section. */
    form: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    message: v.optional(v.string()),
    /** Every answer, as the form named it. */
    fields: v.array(v.object({ key: v.string(), value: v.string() })),
    /** Hash of the sender's IP address and the day, only for rate limiting. */
    sender: v.optional(v.string()),
    delivery: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    deliveryError: v.optional(v.string()),
    /** Where it came from: a form on the site (the default) or the Magic Agent chat widget. */
    source: v.optional(v.union(v.literal("form"), v.literal("chat"))),
    /** Chat leads: the Magic Agent contact and conversation they belong to. */
    chatContactId: v.optional(v.string()),
    chatConversationId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId", "createdAt"])
    .index("by_project_form", ["projectId", "form", "createdAt"])
    .index("by_sender", ["projectId", "sender", "createdAt"])
    .index("by_delivery", ["projectId", "delivery"])
    .index("by_chat_contact", ["projectId", "chatContactId"]),

  /**
   * Blog posts, served at /blog/<slug> on the published site between its own
   * header and footer. A post goes live on its own when published, without
   * publishing the site; a publish date in the future schedules it.
   */
  posts: defineTable({
    projectId: v.id("projects"),
    slug: v.string(),
    title: v.string(),
    excerpt: v.optional(v.string()),
    cover: v.optional(v.string()),
    coverAlt: v.optional(v.string()),
    author: v.optional(v.string()),
    tags: v.array(v.string()),
    /** Markdown, as written. */
    body: v.string(),
    /** The body as HTML, made on save; sanitized when it renders. */
    html: v.string(),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published")),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId", "updatedAt"])
    .index("by_project_slug", ["projectId", "slug"])
    .index("by_project_live", ["projectId", "status", "publishedAt"]),

  /**
   * One page view on a published site, sent by the edge's beacon. Raw views
   * are kept for a few days; analytics.ts rolls them into analyticsDays, which
   * the dashboard reads. No cookies and no IP address: `visitor` is a hash of
   * the IP, browser and site with a salt that changes every day, so a visitor
   * can be counted once a day and never followed across days.
   */
  pageviews: defineTable({
    projectId: v.id("projects"),
    /** UTC day, "YYYY-MM-DD". */
    day: v.string(),
    path: v.string(),
    visitor: v.string(),
    /** Hostname of the page the visitor came from, if it was another site. */
    referrer: v.optional(v.string()),
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    device: v.union(v.literal("desktop"), v.literal("mobile"), v.literal("tablet")),
    browser: v.string(),
    os: v.string(),
    /** Time the page was visible, in ms; set when the visitor leaves. */
    duration: v.optional(v.number()),
    /** Deepest scroll, 0-100. */
    scroll: v.optional(v.number()),
    createdAt: v.number(),
    /** Last change (the view, then its time on page), so a rollup knows which days moved. */
    updatedAt: v.number(),
  })
    .index("by_project_time", ["projectId", "createdAt"])
    .index("by_project_day", ["projectId", "day"])
    .index("by_updated", ["updatedAt"])
    .index("by_created", ["createdAt"]),

  /** A site's traffic for one UTC day, rolled up from its page views. */
  analyticsDays: defineTable({
    projectId: v.id("projects"),
    day: v.string(),
    visitors: v.number(),
    pageviews: v.number(),
    /** Visitors who saw one page and left. */
    bounces: v.number(),
    /** Total and count of the page views whose time on page is known. */
    durationMs: v.number(),
    timedViews: v.number(),
    /** The day's top entries, by page views (pages also by visitors). */
    pages: v.array(v.object({ key: v.string(), views: v.number(), visitors: v.number() })),
    referrers: v.array(v.object({ key: v.string(), count: v.number() })),
    sources: v.array(v.object({ key: v.string(), count: v.number() })),
    campaigns: v.array(v.object({ key: v.string(), count: v.number() })),
    countries: v.array(v.object({ key: v.string(), count: v.number() })),
    devices: v.array(v.object({ key: v.string(), count: v.number() })),
    browsers: v.array(v.object({ key: v.string(), count: v.number() })),
    os: v.array(v.object({ key: v.string(), count: v.number() })),
    updatedAt: v.number(),
  }).index("by_project_day", ["projectId", "day"]),

  /** Where the analytics rollup got to, so each run only looks at what changed. */
  analyticsState: defineTable({
    rolledUpTo: v.number(),
  }),

  /** Long strings of stored pages (exact clones' markup and CSS), see lib.ts. */
  blobs: defineTable({
    hash: v.string(),
    index: v.number(),
    data: v.string(),
  }).index("by_hash", ["hash", "index"]),

  domains: defineTable({
    projectId: v.id("projects"),
    hostname: v.string(),
    kind: v.union(v.literal("subdomain"), v.literal("custom")),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("failed")),
    cloudflareId: v.optional(v.string()),
    // DNS records the customer must add, as returned by Cloudflare for SaaS.
    verification: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_hostname", ["hostname"])
    .index("by_project", ["projectId"]),
})

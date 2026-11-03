import { authTables } from "@convex-dev/auth/server"
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

import { aiEffort, aiMode, aiModel, aiUsage } from "./models"

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

  projects: defineTable({
    /** Owner. Optional only for projects made before accounts existed; see migrations.claimProjects. */
    userId: v.optional(v.id("users")),
    name: v.string(),
    slug: v.string(),
    sourceUrl: v.string(),
    model: v.optional(aiModel),
    effort: v.optional(aiEffort),
    /** Usage of the latest successful rebuild. */
    usage: v.optional(aiUsage),
    status: v.union(v.literal("cloning"), v.literal("ready"), v.literal("failed")),
    step: v.optional(v.string()),
    error: v.optional(v.string()),
    publishedVersionId: v.optional(v.id("versions")),
    publishedAt: v.optional(v.number()),
    /** Pending auto-publish after the latest edit. */
    autoPublishId: v.optional(v.id("_scheduled_functions")),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_user", ["userId"]),

  drafts: defineTable({
    projectId: v.id("projects"),
    doc: v.any(),
    revision: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  edits: defineTable({
    projectId: v.id("projects"),
    revision: v.number(),
    source: v.union(v.literal("editor"), v.literal("ai"), v.literal("mcp"), v.literal("clone"), v.literal("rollback")),
    ops: v.array(v.any()),
    results: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  versions: defineTable({
    projectId: v.id("projects"),
    number: v.number(),
    doc: v.any(),
    note: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_project", ["projectId", "number"]),

  jobs: defineTable({
    projectId: v.id("projects"),
    url: v.string(),
    model: v.optional(aiModel),
    effort: v.optional(aiEffort),
    usage: v.optional(aiUsage),
    /** Whose AI rebuilds the page when it is too large to copy; defaults to the platform's. */
    ai: v.optional(aiMode),
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
    url: v.string(),
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

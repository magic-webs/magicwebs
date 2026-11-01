import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

// Page documents are stored as `v.any()` and validated with the shared Zod
// schema from @magicwebs/page-schema, which is the real contract.
export default defineSchema({
  projects: defineTable({
    name: v.string(),
    slug: v.string(),
    sourceUrl: v.string(),
    status: v.union(v.literal("cloning"), v.literal("ready"), v.literal("failed")),
    step: v.optional(v.string()),
    error: v.optional(v.string()),
    publishedVersionId: v.optional(v.id("versions")),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

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
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("done"), v.literal("failed")),
    attempts: v.number(),
    workerId: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_project", ["projectId"]),

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

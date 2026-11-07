import { ConvexError, v } from "convex/values"

import type { PageDoc } from "@magicwebs/page-schema"

import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server"
import { findDraft, listPages, loadDoc, requireProject } from "./lib"

// Leads: what visitors send through a published site's forms. The edge
// worker's runtime catches every form's submit (form sections, and forms copied
// inside html sections) and posts it to /__forms, which hands it to `submit`
// here. Each lead is kept for the dashboard and sent on to the site's Magic
// Agent workspace, as a record in its "Website enquiry" book.
//
// A form is keyed by where it is: a form section's id, or "<section id>:<n>"
// for the n-th form inside a copied (html) section. Every form collects unless
// its key is in `projects.stoppedForms`.

const MAX_FIELDS = 40
const MAX_KEY = 100
const MAX_VALUE = 5000
/** Submissions one sender may make to one site in RATE_WINDOW_MS. */
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000

type Details = { name?: string; email?: string; phone?: string; company?: string; message?: string }

const PATTERNS: [keyof Details, RegExp][] = [
  ["email", /e-?mail/],
  ["phone", /phone|mobile|tel|whatsapp|contact.?number|cell/],
  ["company", /company|business|organi[sz]ation|firm/],
  ["message", /message|comment|enquiry|inquiry|question|details|description|requirement|note|msg/],
  ["name", /^(your)?.?(full.?)?name$|^name|fullname/],
]

/** The lead's details picked out of a form's answers by their names. */
export function leadDetails(fields: { key: string; value: string }[]): Details {
  const details: Details = {}
  let first = ""
  let last = ""
  for (const { key, value } of fields) {
    const k = key.toLowerCase().replace(/[\s_\-[\]]+/g, " ").trim()
    if (/first.?name|fname|given/.test(k)) first = value
    else if (/last.?name|lname|surname|family/.test(k)) last = value
    else {
      const match = PATTERNS.find(([, pattern]) => pattern.test(k))
      if (match && !details[match[0]]) details[match[0]] = value
    }
  }
  if (!details.name && (first || last)) details.name = `${first} ${last}`.trim()
  if (!details.email) details.email = fields.find((f) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.value))?.value
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value)) as Details
}

/** Called by the /forms/submit HTTP route with what the edge worker received. */
export const submit = internalMutation({
  args: {
    hostname: v.string(),
    form: v.string(),
    path: v.string(),
    fields: v.array(v.object({ key: v.string(), value: v.string() })),
    sender: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<"ok" | "unknown" | "stopped" | "limited"> => {
    const domain = await ctx.db
      .query("domains")
      .withIndex("by_hostname", (q) => q.eq("hostname", args.hostname))
      .first()
    if (!domain || domain.status !== "active") return "unknown"
    const project = await ctx.db.get(domain.projectId)
    if (!project?.publishedVersionId) return "unknown"
    if (project.stoppedForms?.includes(args.form)) return "stopped"

    const now = Date.now()
    if (args.sender) {
      const recent = await ctx.db
        .query("leads")
        .withIndex("by_sender", (q) =>
          q.eq("projectId", project._id).eq("sender", args.sender).gt("createdAt", now - RATE_WINDOW_MS),
        )
        .take(RATE_LIMIT)
      if (recent.length >= RATE_LIMIT) return "limited"
    }

    const fields = args.fields
      .slice(0, MAX_FIELDS)
      .map((f) => ({ key: f.key.trim().slice(0, MAX_KEY), value: f.value.trim().slice(0, MAX_VALUE) }))
      .filter((f) => f.key && f.value)
    if (!fields.length) return "ok"

    const leadId = await ctx.db.insert("leads", {
      projectId: project._id,
      path: args.path.slice(0, 200),
      form: args.form.slice(0, 120),
      ...leadDetails(fields),
      fields,
      sender: args.sender,
      delivery: "pending",
      createdAt: now,
    })
    if (project.magicAgent?.leadsUrl) await ctx.scheduler.runAfter(0, internal.leads.deliver, { leadId })
    return "ok"
  },
})

export const forDelivery = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.db.get(leadId)
    if (!lead) return null
    const project = await ctx.db.get(lead.projectId)
    const url = project?.magicAgent?.leadsUrl
    return url ? { lead, url } : null
  },
})

export const noteDelivery = internalMutation({
  args: { leadId: v.id("leads"), error: v.optional(v.string()) },
  handler: async (ctx, { leadId, error }) => {
    if (!(await ctx.db.get(leadId))) return
    await ctx.db.patch(leadId, error ? { delivery: "failed", deliveryError: error } : { delivery: "sent", deliveryError: undefined })
  },
})

/** Send one lead to the site's Magic Agent workspace. */
export const deliver = internalAction({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const found = await ctx.runQuery(internal.leads.forDelivery, { leadId })
    if (!found) return
    const { lead, url } = found
    // The book matches name, email, phone and company to the person and the
    // rest to its fields by key; anything else is kept as an extra.
    const body: Record<string, string> = Object.fromEntries(lead.fields.map((f) => [f.key, f.value]))
    for (const key of ["name", "email", "phone", "company", "message"] as const) {
      const value = lead[key]
      if (value) body[key] = value
    }
    body.page = lead.path
    body.form = lead.form
    let error: string | undefined
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) error = `Magic Agent answered ${response.status}`
    } catch (err) {
      error = err instanceof Error ? err.message : "Couldn't reach Magic Agent"
    }
    await ctx.runMutation(internal.leads.noteDelivery, { leadId, error })
  },
})

/** Send every lead that hasn't reached Magic Agent yet; run once the workspace's book exists. */
export const deliverPending = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    for (const delivery of ["pending", "failed"] as const) {
      const leads = await ctx.db
        .query("leads")
        .withIndex("by_delivery", (q) => q.eq("projectId", projectId).eq("delivery", delivery))
        .take(200)
      for (const lead of leads) await ctx.scheduler.runAfter(0, internal.leads.deliver, { leadId: lead._id })
    }
  },
})

/** Try again to send a site's leads that didn't reach Magic Agent. */
export const retryDelivery = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId)
    if (!project.magicAgent?.leadsUrl) throw new ConvexError("This site's Magic Agent workspace isn't ready yet.")
    await ctx.scheduler.runAfter(0, internal.leads.deliverPending, { projectId })
  },
})

/** The form key chat leads are filed under; no form on a page has it. */
export const CHAT_FORM = "chat"

const maybe = v.union(v.string(), v.null())

/** One lead as Magic Agent's websites:chatLeads returns it. */
export const chatLead = v.object({
  contactId: v.string(),
  conversationId: maybe,
  name: maybe,
  phone: maybe,
  email: maybe,
  company: maybe,
  message: maybe,
  createdAt: v.number(),
})

/** Keep the chat widget's leads (pulled from Magic Agent by magicAgent.syncChatLeads) in step, one row per contact. */
export const saveChatLeads = internalMutation({
  args: { projectId: v.id("projects"), leads: v.array(chatLead) },
  handler: async (ctx, { projectId, leads }) => {
    for (const chat of leads) {
      const details = {
        name: chat.name?.slice(0, MAX_VALUE) || undefined,
        email: chat.email?.slice(0, MAX_VALUE) || undefined,
        phone: chat.phone?.slice(0, MAX_VALUE) || undefined,
        company: chat.company?.slice(0, MAX_VALUE) || undefined,
        message: chat.message?.slice(0, MAX_VALUE) || undefined,
        chatConversationId: chat.conversationId ?? undefined,
      }
      const fields = (["name", "email", "phone", "company", "message"] as const).flatMap((key) =>
        details[key] ? [{ key, value: details[key]! }] : [],
      )
      const existing = await ctx.db
        .query("leads")
        .withIndex("by_chat_contact", (q) => q.eq("projectId", projectId).eq("chatContactId", chat.contactId))
        .first()
      if (existing) {
        await ctx.db.patch(existing._id, { ...details, fields })
      } else {
        await ctx.db.insert("leads", {
          projectId,
          path: "",
          form: CHAT_FORM,
          ...details,
          fields,
          // It is already in Magic Agent: that's where it came from.
          delivery: "sent",
          source: "chat",
          chatContactId: chat.contactId,
          createdAt: chat.createdAt,
        })
      }
    }
  },
})

/** What syncChatLeads needs to ask Magic Agent, for a site the caller owns. */
export const chatLeadSource = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId)
    const workspaceSlug = project.magicAgent?.status === "ready" ? project.magicAgent.workspaceSlug : undefined
    if (!workspaceSlug || !project.userId) return null
    const account = await ctx.db
      .query("magicAgentAccounts")
      .withIndex("by_user", (q) => q.eq("userId", project.userId!))
      .unique()
    return account ? { workspaceSlug, sessionToken: account.sessionToken } : null
  },
})

/** A site's leads, newest first. */
export const list = query({
  args: { projectId: v.id("projects"), form: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { projectId, form, limit }) => {
    await requireProject(ctx, projectId)
    const take = Math.min(Math.max(limit ?? 200, 1), 1000)
    const rows = form
      ? await ctx.db
          .query("leads")
          .withIndex("by_project_form", (q) => q.eq("projectId", projectId).eq("form", form))
          .order("desc")
          .take(take)
      : await ctx.db
          .query("leads")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .order("desc")
          .take(take)
    return rows.map(({ sender: _sender, ...lead }) => lead)
  },
})

type FoundForm = {
  key: string
  path: string
  pageTitle: string
  /** "section": a form section; "copied": a form inside a copied (html) section. */
  kind: "section" | "copied"
  label: string
  fields: string[]
}

const FORM_TAG = /<form\b[\s\S]*?<\/form>/gi
const NAME_ATTR = /\bname\s*=\s*["']([^"']+)["']/gi

/** Mirrors the runtime's test, so the list shows the forms that collect. */
function isSearchForm(markup: string): boolean {
  const open = markup.slice(0, markup.indexOf(">") + 1).toLowerCase()
  if (/role\s*=\s*["']search/.test(open) || /action\s*=\s*["'][^"']*search/.test(open)) return true
  if (/type\s*=\s*["']search/i.test(markup)) return true
  const names = [...markup.matchAll(NAME_ATTR)].map((m) => m[1]!)
  return names.length === 1 && /^(q|s|query|search)$/i.test(names[0]!)
}

function formsOf(doc: PageDoc, path: string, pageTitle: string): FoundForm[] {
  const found: FoundForm[] = []
  for (const section of doc.sections) {
    if (section.hidden) continue
    if (section.type === "form") {
      found.push({
        key: section.id,
        path,
        pageTitle,
        kind: "section",
        label: section.props.heading?.replace(/\*\*/g, "") || "Form",
        fields: section.props.fields.map((f) => f.label),
      })
    } else if (section.type === "html") {
      ;[...section.props.html.matchAll(FORM_TAG)].forEach((match, index) => {
        const markup = match[0]
        if (isSearchForm(markup)) return
        const names = [...new Set([...markup.matchAll(NAME_ATTR)].map((m) => m[1]!).filter((n) => !n.startsWith("_")))]
        found.push({
          key: `${section.id}:${index}`,
          path,
          pageTitle,
          kind: "copied",
          label: section.props.label || "Form",
          fields: names.slice(0, 12),
        })
      })
    }
  }
  return found
}

async function siteForms(ctx: QueryCtx, project: Doc<"projects">) {
  const forms: FoundForm[] = []
  for (const page of await listPages(ctx, project)) {
    const draft = await findDraft(ctx, project._id, page.path)
    if (draft) forms.push(...formsOf(await loadDoc(ctx, draft.doc), page.path, page.title))
  }
  const stopped = new Set(project.stoppedForms ?? [])
  return Promise.all(
    forms.map(async (form) => {
      const recent = await ctx.db
        .query("leads")
        .withIndex("by_project_form", (q) => q.eq("projectId", project._id).eq("form", form.key))
        .order("desc")
        .take(100)
      return { ...form, collecting: !stopped.has(form.key), leads: recent.length, lastLeadAt: recent[0]?.createdAt ?? null }
    }),
  )
}

/** Every form on the site's pages, whether it collects leads, and how many it has. */
export const forms = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId)
    return {
      forms: await siteForms(ctx, project),
      workspace: project.magicAgent ?? null,
    }
  },
})

/** Stop a form collecting leads, or start it again. Takes effect on the live site at once. */
export const setCollecting = mutation({
  args: { projectId: v.id("projects"), form: v.string(), collecting: v.boolean() },
  handler: async (ctx, { projectId, form, collecting }) => {
    const project = await requireProject(ctx, projectId)
    const stopped = new Set(project.stoppedForms ?? [])
    if (collecting) stopped.delete(form)
    else stopped.add(form)
    await ctx.db.patch(projectId, { stoppedForms: [...stopped] })
    if (project.publishedVersionId) await ctx.scheduler.runAfter(0, internal.edge.syncSite, { projectId })
  },
})

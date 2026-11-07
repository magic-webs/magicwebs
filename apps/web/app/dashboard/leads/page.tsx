"use client"

import { useAction, useMutation, useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import { useEffect, useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Doc, Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { errorText } from "@/components/dashboard/lib"
import { PageHeader } from "@/components/dashboard/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MAGIC_AGENT_URL } from "@/lib/magic-agent"

type Lead = Omit<Doc<"leads">, "sender">

function csvCell(value: string | undefined) {
  const text = value ?? ""
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Every lead as a CSV: the usual details first, then each other answer in its own column. */
function downloadCsv(leads: Lead[], name: string) {
  const known = new Set(["name", "email", "phone", "company", "message"])
  const extra = [...new Set(leads.flatMap((l) => l.fields.map((f) => f.key)).filter((k) => !known.has(k.toLowerCase())))]
  const header = ["Date", "Name", "Email", "Phone", "Company", "Message", "Page", "Form", ...extra]
  const rows = leads.map((l) => {
    const answers = new Map(l.fields.map((f) => [f.key, f.value]))
    return [
      new Date(l.createdAt).toISOString(),
      l.name,
      l.email,
      l.phone,
      l.company,
      l.message,
      l.path,
      l.form,
      ...extra.map((k) => answers.get(k)),
    ]
  })
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const link = Object.assign(document.createElement("a"), { href: url, download: `${name}-leads.csv` })
  link.click()
  URL.revokeObjectURL(url)
}

export default function LeadsPage() {
  const projects = useQuery(api.projects.list)
  const [chosen, setChosen] = useState<Id<"projects"> | null>(null)
  const projectId = chosen ?? projects?.[0]?._id ?? null
  const project = projects?.find((p) => p._id === projectId)

  return (
    <>
      <PageHeader
        title="Leads"
        description="What visitors send through your sites' forms and leave in the chat widget. Every lead also lands in the site's Magic Agent workspace."
        action={
          projects && projects.length > 1 ? (
            <NativeSelect value={projectId ?? ""} onChange={(e) => setChosen(e.target.value as Id<"projects">)} aria-label="Site">
              {projects.map((p) => (
                <NativeSelectOption key={p._id} value={p._id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : undefined
        }
      />
      {projects === undefined ? (
        <Skeleton className="h-64" />
      ) : !project ? (
        <p className="text-sm text-muted-foreground">Create a site first; its forms&apos; submissions will show up here.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <Forms projectId={project._id} />
          <Leads projectId={project._id} name={project.slug} />
        </div>
      )}
    </>
  )
}

function Forms({ projectId }: { projectId: Id<"projects"> }) {
  const data = useQuery(api.leads.forms, { projectId })
  const setCollecting = useMutation(api.leads.setCollecting)
  const [error, setError] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forms</CardTitle>
        <CardDescription>
          Every form on the site collects leads once it&apos;s published: the ones it was cloned with and the ones you add.
          To add a form, ask the AI chat in the editor; it asks you which fields the form should have.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {data === undefined ? (
          <Skeleton className="h-16" />
        ) : data.forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">This site has no forms yet.</p>
        ) : (
          data.forms.map((form) => (
            <div key={form.key} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">
                  {form.label} <span className="font-normal text-muted-foreground">on {form.pageTitle}</span>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {form.kind === "copied" ? "From the original site" : "Form section"}
                  {form.fields.length > 0 && ` · ${form.fields.join(", ")}`}
                </span>
              </div>
              <Badge variant="secondary">
                {form.leads >= 100 ? "100+" : form.leads} lead{form.leads === 1 ? "" : "s"}
              </Badge>
              <Switch
                aria-label={`Collect leads from ${form.label}`}
                checked={form.collecting}
                onCheckedChange={async (collecting) => {
                  setError(null)
                  try {
                    await setCollecting({ projectId, form: form.key, collecting })
                  } catch (err) {
                    setError(errorText(err))
                  }
                }}
              />
            </div>
          ))
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

function Leads({ projectId, name }: { projectId: Id<"projects">; name: string }) {
  const leads = useQuery(api.leads.list, { projectId, limit: 1000 })
  const forms = useQuery(api.leads.forms, { projectId })
  const retry = useMutation(api.leads.retryDelivery)
  const syncChat = useAction(api.magicAgent.syncChatLeads)
  const [notice, setNotice] = useState<string | null>(null)
  const undelivered = leads?.filter((l) => l.delivery !== "sent").length ?? 0
  const workspace = forms?.workspace
  const agentBase = workspace?.workspaceSlug && MAGIC_AGENT_URL ? `${MAGIC_AGENT_URL}/w/${workspace.workspaceSlug}` : null

  // The chat widget's leads live in Magic Agent; bring them over each time the page opens.
  useEffect(() => {
    syncChat({ projectId }).catch(() => {
      // The form leads still show; the chat ones come on the next visit.
    })
  }, [projectId, syncChat])

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Submissions</CardTitle>
          <CardDescription>
            {agentBase ? (
              <a
                className="underline-offset-4 hover:underline"
                href={agentBase}
                target="_blank"
                rel="noreferrer"
              >
                Follow them up in Magic Agent →
              </a>
            ) : (
              "Newest first."
            )}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          {undelivered > 0 && workspace?.leadsUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await retry({ projectId })
                  setNotice("Sending them again.")
                } catch (err) {
                  setNotice(errorText(err))
                }
              }}
            >
              Resend {undelivered} to Magic Agent
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={!leads?.length} onClick={() => leads && downloadCsv(leads, name)}>
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {notice && <p className="mb-3 text-sm text-muted-foreground">{notice}</p>}
        {leads === undefined ? (
          <Skeleton className="h-32" />
        ) : leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No leads yet. They appear here as soon as someone sends a form or leaves their details in the chat.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Who</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Magic Agent</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead._id}>
                  <TableCell className="max-w-56">
                    <div className="truncate font-medium">{lead.name ?? lead.email ?? lead.phone ?? "Anonymous"}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[lead.email, lead.phone, lead.company].filter((v) => v && v !== lead.name).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-80">
                    <div
                      className="line-clamp-2 text-sm whitespace-normal"
                      title={lead.fields.map((f) => `${f.key}: ${f.value}`).join("\n")}
                    >
                      {lead.source === "chat"
                        ? (lead.message ?? <span className="text-muted-foreground">Left their details</span>)
                        : (lead.message ?? lead.fields.map((f) => `${f.key}: ${f.value}`).join(" · "))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lead.source === "chat" ? <Badge variant="outline">Chat</Badge> : lead.path}
                  </TableCell>
                  <TableCell>
                    {lead.source === "chat" ? (
                      agentBase && lead.chatConversationId ? (
                        <a
                          className="text-sm underline-offset-4 hover:underline"
                          href={`${agentBase}/conversations?c=${lead.chatConversationId}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open chat →
                        </a>
                      ) : (
                        <Badge variant="secondary">In Magic Agent</Badge>
                      )
                    ) : (
                      <Badge variant={lead.delivery === "failed" ? "destructive" : "secondary"} title={lead.deliveryError}>
                        {lead.delivery === "sent" ? "Sent" : lead.delivery === "failed" ? "Failed" : "Waiting"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                    {formatDistanceToNow(lead.createdAt, { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

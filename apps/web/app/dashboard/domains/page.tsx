"use client"

import { useAction, useMutation, useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"

import {
  CopiedIcon,
  CopyIcon,
  DeleteIcon,
  ExternalLinkIcon,
  GlobeIcon,
  RefreshIcon,
} from "@/components/icons"
import { errorText } from "@/components/dashboard/lib"
import { PageHeader } from "@/components/dashboard/shell"
import { dnsRecords } from "@/components/editor/domains-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Filter = "all" | "custom" | "subdomain"

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label="Copy value"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard unavailable; the value is still selectable.
        }
      }}
    >
      {copied ? <CopiedIcon /> : <CopyIcon />}
    </Button>
  )
}

function AddDomain() {
  const projects = useQuery(api.projects.list)
  const add = useMutation(api.domains.addCustom)
  const [projectId, setProjectId] = useState<Id<"projects"> | null>(null)
  const [hostname, setHostname] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const items = (projects ?? []).map((p) => ({ value: p._id, label: p.name }))

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!projectId) return
    setBusy(true)
    setError(null)
    try {
      await add({ projectId, hostname })
      setHostname("")
    } catch (err) {
      setError(errorText(err, "Couldn't add that domain."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect a domain</CardTitle>
        <CardDescription>
          Pick a project and enter a hostname you own. We&apos;ll show the DNS records to add, then issue HTTPS once they
          check out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Select items={items} value={projectId} onValueChange={(v) => setProjectId(v)}>
            <SelectTrigger className="sm:w-52" aria-label="Project">
              <SelectValue placeholder="Choose a project" />
            </SelectTrigger>
            <SelectContent>
              {items.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="www.yourdomain.com"
            className="flex-1"
            aria-label="Hostname"
          />
          <Button type="submit" disabled={busy || !projectId || !hostname.trim()}>
            {busy && <Spinner />}
            Connect
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

export default function DomainsPage() {
  const domains = useQuery(api.dashboard.domains)
  const refresh = useAction(api.domains.refresh)
  const remove = useMutation(api.domains.remove)
  const [filter, setFilter] = useState<Filter>("all")
  const [refreshing, setRefreshing] = useState<string | null>(null)

  const visible = (domains ?? []).filter((d) => filter === "all" || d.kind === filter)

  async function onRefresh(domainId: Id<"domains">) {
    setRefreshing(domainId)
    try {
      await refresh({ domainId })
    } finally {
      setRefreshing(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Domains"
        description="Every project is live on its own subdomain. Connect your own domains here."
      />
      <AddDomain />

      <div className="flex flex-col gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
            <TabsTrigger value="subdomain">Platform</TabsTrigger>
          </TabsList>
        </Tabs>

        {domains === undefined ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No domains here yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {visible.map((domain) => {
              const records = dnsRecords(domain)
              return (
                <li key={domain._id} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
                    <a
                      href={`https://${domain.hostname}`}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate font-medium hover:underline"
                    >
                      {domain.hostname}
                    </a>
                    <Badge
                      variant={
                        domain.status === "active" ? "default" : domain.status === "failed" ? "destructive" : "secondary"
                      }
                    >
                      {domain.status === "pending" ? "Waiting for DNS" : domain.status === "active" ? "Active" : "Failed"}
                    </Badge>
                    <Badge variant="outline">{domain.kind === "custom" ? "Custom" : "Platform"}</Badge>
                    <div className="ml-auto flex items-center gap-1">
                      <span className="mr-2 hidden text-xs text-muted-foreground sm:inline">
                        <Link href={`/projects/${domain.projectId}`} className="hover:underline">
                          {domain.projectName}
                        </Link>{" "}
                        · {formatDistanceToNow(domain.createdAt, { addSuffix: true })}
                      </span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        nativeButton={false}
                        render={<a href={`https://${domain.hostname}`} target="_blank" rel="noreferrer" />}
                        aria-label="Open"
                      >
                        <ExternalLinkIcon />
                      </Button>
                      {domain.kind === "custom" && (
                        <>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Check status"
                            disabled={refreshing === domain._id}
                            onClick={() => onRefresh(domain._id)}
                          >
                            {refreshing === domain._id ? <Spinner /> : <RefreshIcon />}
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Remove domain"
                            onClick={() => {
                              if (confirm(`Disconnect ${domain.hostname}?`)) remove({ domainId: domain._id })
                            }}
                          >
                            <DeleteIcon />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {domain.error && <p className="text-xs text-destructive">{domain.error}</p>}
                  {domain.kind === "custom" && domain.status !== "active" && records.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border bg-muted/30">
                      <table className="w-full text-left font-mono text-xs">
                        <thead className="text-muted-foreground">
                          <tr className="border-b">
                            <th className="px-3 py-2 font-medium">Type</th>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {records.map((r, i) => (
                            <tr key={i} className="align-middle not-last:border-b">
                              <td className="px-3 py-1.5">{r.type}</td>
                              <td className="px-3 py-1.5 break-all">
                                {r.name} <CopyValue value={r.name} />
                              </td>
                              <td className="px-3 py-1.5 break-all">
                                {r.value} <CopyValue value={r.value} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

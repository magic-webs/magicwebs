"use client"

import { useAction, useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { Globe, RefreshCw, Trash2 } from "lucide-react"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Doc, Id } from "@magicwebs/backend/convex/_generated/dataModel"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type DnsRecord = { type: string; name: string; value: string }

function dnsRecords(domain: Doc<"domains">): DnsRecord[] {
  const v = domain.verification as
    | { cname?: { name: string; value: string }; ownership?: { name: string; value: string }; ssl?: { name: string; value: string } }
    | undefined
  if (!v) return []
  return [
    v.cname && { type: "CNAME", ...v.cname },
    v.ownership && { type: "TXT", ...v.ownership },
    v.ssl && { type: "TXT", ...v.ssl },
  ].filter(Boolean) as DnsRecord[]
}

export function DomainsDialog({ projectId }: { projectId: Id<"projects"> }) {
  const domains = useQuery(api.domains.list, { projectId })
  const add = useMutation(api.domains.addCustom)
  const remove = useMutation(api.domains.remove)
  const refresh = useAction(api.domains.refresh)
  const [hostname, setHostname] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function onAdd(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await add({ projectId, hostname })
      setHostname("")
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "Couldn't add that domain.")
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <Globe />
        Domains
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Domains</DialogTitle>
          <DialogDescription>
            Your page is always available on its platform subdomain. Connect your own domain by adding the DNS records
            shown below.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-3">
          {domains?.map((domain) => (
            <li key={domain._id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{domain.hostname}</span>
                <Badge variant={domain.status === "active" ? "default" : domain.status === "failed" ? "destructive" : "secondary"}>
                  {domain.status}
                </Badge>
                {domain.kind === "custom" && (
                  <>
                    <Button size="icon-sm" variant="ghost" aria-label="Check status" onClick={() => refresh({ domainId: domain._id })}>
                      <RefreshCw />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Remove domain" onClick={() => remove({ domainId: domain._id })}>
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
              {domain.error && <p className="text-xs text-destructive">{domain.error}</p>}
              {domain.kind === "custom" && domain.status !== "active" && dnsRecords(domain).length > 0 && (
                <table className="w-full table-fixed text-left font-mono text-xs">
                  <tbody>
                    {dnsRecords(domain).map((r, i) => (
                      <tr key={i} className="align-top">
                        <td className="w-14 py-1 text-muted-foreground">{r.type}</td>
                        <td className="truncate py-1 pr-2" title={r.name}>
                          {r.name}
                        </td>
                        <td className="py-1 break-all">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={onAdd} className="flex gap-2">
          <Input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="www.yourdomain.com" />
          <Button type="submit" disabled={!hostname.trim()}>
            Connect
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}

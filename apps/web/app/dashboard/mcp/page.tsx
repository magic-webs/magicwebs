"use client"

import { useAction, useMutation, useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import { useState } from "react"

import { api } from "@magicwebs/backend/convex/_generated/api"
import type { Id } from "@magicwebs/backend/convex/_generated/dataModel"
import { OP_DEFINITIONS } from "@magicwebs/page-schema"

import {
  CopiedIcon,
  CopyIcon,
  DeleteIcon,
  KeyIcon,
  ServerIcon,
  ShieldCheckIcon,
} from "@/components/icons"
import { errorText, MCP_URL } from "@/components/dashboard/lib"
import { PageHeader } from "@/components/dashboard/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const KEY_VAR = "MAGICWEBS_API_KEY"

const jsonConfig = (root: "mcpServers" | "servers") =>
  JSON.stringify(
    { [root]: { magicwebs: { type: "http", url: MCP_URL, headers: { Authorization: `Bearer \${${KEY_VAR}}` } } } },
    null,
    2,
  )

const CLIENTS = [
  {
    id: "claude",
    label: "Claude Code",
    steps: [
      { label: "Run in your project", code: `claude mcp add --transport http magicwebs ${MCP_URL} --header "Authorization: Bearer $${KEY_VAR}"` },
      { label: "Or commit it to .mcp.json", code: jsonConfig("mcpServers") },
    ],
  },
  { id: "cursor", label: "Cursor", steps: [{ label: ".cursor/mcp.json", code: jsonConfig("mcpServers") }] },
  { id: "vscode", label: "VS Code", steps: [{ label: ".vscode/mcp.json", code: jsonConfig("servers") }] },
  {
    id: "windsurf",
    label: "Windsurf",
    steps: [{ label: "~/.codeium/windsurf/mcp_config.json", code: jsonConfig("mcpServers") }],
  },
  {
    id: "other",
    label: "Other clients",
    steps: [
      {
        label: "Any client that speaks Streamable HTTP",
        code: `URL:     ${MCP_URL}\nHeader:  Authorization: Bearer <your key>`,
      },
    ],
  },
]

const CORE_TOOLS = [
  { name: "list_projects", description: "List projects with their ids, status and live hostname." },
  { name: "clone_landing_page", description: "Clone a public URL into a new editable project. Runs in the background." },
  { name: "get_rebuild_brief", description: "Screenshots and structure of a page too large to copy, for your agent to rebuild." },
  { name: "submit_rebuilt_page", description: "Save the page your agent rebuilt from a brief." },
  { name: "get_page_outline", description: "The page's sections with their ids and types." },
  { name: "get_section", description: "The full JSON of one section, including props and style." },
  { name: "get_theme_and_meta", description: "Global theme (colors, fonts, radius, width) and SEO metadata." },
  { name: "search_page_css", description: "Search the stylesheet of an exact clone." },
  { name: "apply_operations", description: "Apply several edit operations atomically." },
  { name: "publish_page", description: "Publish the current draft so it goes live." },
  { name: "list_versions", description: "Published versions, newest first." },
  { name: "rollback_to_version", description: "Make an earlier version live again and load it into the draft." },
]

const EDIT_TOOLS = Object.entries(OP_DEFINITIONS).map(([name, def]) => ({
  name,
  // The first sentence is enough for a catalogue.
  description: def.description.split(/(?<=\.)\s/)[0],
}))

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative rounded-lg bg-zinc-950 text-zinc-100 dark:bg-zinc-900">
      <pre className="overflow-x-auto p-4 pr-12 font-mono text-xs leading-relaxed">{code}</pre>
      <Button
        size="icon-sm"
        variant="ghost"
        className="absolute top-2 right-2 text-zinc-300 hover:bg-white/10 hover:text-white"
        aria-label="Copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            // Clipboard unavailable; the code is still selectable.
          }
        }}
      >
        {copied ? <CopiedIcon /> : <CopyIcon />}
      </Button>
    </div>
  )
}

function ToolList({ tools }: { tools: { name: string; description: string }[] }) {
  return (
    <ul className="grid gap-x-6 sm:grid-cols-2">
      {tools.map((tool) => (
        <li key={tool.name} className="flex flex-col gap-0.5 border-b py-2.5">
          <code className="font-mono text-xs font-medium">{tool.name}</code>
          <span className="text-xs text-muted-foreground">{tool.description}</span>
        </li>
      ))}
    </ul>
  )
}

function ApiKeys() {
  const keys = useQuery(api.apiKeys.list)
  const create = useAction(api.apiKeys.create)
  const revoke = useMutation(api.apiKeys.revoke)
  const [name, setName] = useState("")
  const [created, setCreated] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCreate(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const { key } = await create({ name })
      setCreated(key)
      setName("")
    } catch (err) {
      setError(errorText(err))
    } finally {
      setPending(false)
    }
  }

  async function onRevoke(keyId: Id<"apiKeys">) {
    setError(null)
    try {
      await revoke({ keyId })
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
        <CardDescription>
          Each key acts as you and can reach only your projects. Make one per agent or machine, so you can revoke it on
          its own. Revoking takes effect immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={onCreate} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name, e.g. Claude Code on my laptop"
            aria-label="Key name"
            maxLength={60}
            required
          />
          <Button type="submit" disabled={pending || !name.trim()}>
            <KeyIcon />
            Create key
          </Button>
        </form>
        {created && (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium">Copy your new key now. It won&apos;t be shown again.</p>
            <CodeBlock code={created} />
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setCreated(null)}>
              I&apos;ve saved it
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {keys && keys.length > 0 && (
          <ul className="flex flex-col">
            {keys.map((key) => (
              <li key={key._id} className="flex items-center gap-3 border-b py-2.5 last:border-0">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{key.name}</span>
                  <span className="text-xs text-muted-foreground">
                    <code className="font-mono">{key.prefix}…</code> · created{" "}
                    {formatDistanceToNow(key.createdAt, { addSuffix: true })} ·{" "}
                    {key.lastUsedAt ? `last used ${formatDistanceToNow(key.lastUsedAt, { addSuffix: true })}` : "never used"}
                  </span>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Revoke ${key.name}`} onClick={() => onRevoke(key._id)}>
                  <DeleteIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {keys?.length === 0 && !created && <p className="text-sm text-muted-foreground">No keys yet.</p>}
      </CardContent>
    </Card>
  )
}

export default function McpPage() {
  return (
    <>
      <PageHeader
        title="MCP & API"
        description="Let Claude Code, Cursor or any MCP client clone, edit, publish and roll back your pages. Agents send the same operations as the visual editor, so every change is validated and shows up live. They run on their own model: nothing an agent does uses Magicwebs' AI."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <ServerIcon solid className="size-3.5" /> Endpoint
            </CardDescription>
            <CardTitle className="font-mono text-sm break-all">{MCP_URL}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <KeyIcon solid className="size-3.5" /> Authentication
            </CardDescription>
            <CardTitle className="text-sm font-normal">Bearer token: a personal API key you create below.</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <ShieldCheckIcon solid className="size-3.5" /> Transport
            </CardDescription>
            <CardTitle className="text-sm font-normal">Streamable HTTP · {CORE_TOOLS.length + EDIT_TOOLS.length} tools</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <ApiKeys />

      <Card>
        <CardHeader>
          <CardTitle>Connect your client</CardTitle>
          <CardDescription>
            Keep the key in the <code className="font-mono">{KEY_VAR}</code> environment variable so it never lands in
            a prompt or in your repo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="claude" className="gap-4">
            <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CLIENTS.map((c) => (
                <TabsTrigger key={c.id} value={c.id}>
                  {c.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {CLIENTS.map((c) => (
              <TabsContent key={c.id} value={c.id} className="flex flex-col gap-4">
                {c.steps.map((step) => (
                  <div key={step.label} className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">{step.label}</p>
                    <CodeBlock code={step.code} />
                  </div>
                ))}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Tools <Badge variant="secondary">{CORE_TOOLS.length + EDIT_TOOLS.length}</Badge>
          </CardTitle>
          <CardDescription>
            Edit tools take a <code className="font-mono">projectId</code>. Ask your agent to call{" "}
            <code className="font-mono">get_page_outline</code> first so it knows the section ids. A page too large to
            copy exactly isn&apos;t rebuilt with Magicwebs&apos; AI when an agent clones it: the agent rebuilds it with{" "}
            <code className="font-mono">get_rebuild_brief</code> and <code className="font-mono">submit_rebuilt_page</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="core" className="gap-2">
            <TabsList>
              <TabsTrigger value="core">Projects & publishing</TabsTrigger>
              <TabsTrigger value="edit">Edit operations</TabsTrigger>
            </TabsList>
            <TabsContent value="core">
              <ToolList tools={CORE_TOOLS} />
            </TabsContent>
            <TabsContent value="edit">
              <ToolList tools={EDIT_TOOLS} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  )
}

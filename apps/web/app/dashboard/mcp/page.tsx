"use client"

import { Check, Copy, KeyRound, Plug, ShieldCheck } from "lucide-react"
import { useState } from "react"

import { OP_DEFINITIONS } from "@magicwebs/page-schema"

import { MCP_URL } from "@/components/dashboard/lib"
import { PageHeader } from "@/components/dashboard/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
        {copied ? <Check /> : <Copy />}
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

export default function McpPage() {
  return (
    <>
      <PageHeader
        title="MCP & API"
        description="Let Claude Code, Cursor or any MCP client clone, edit, publish and roll back your pages. Agents send the same operations as the visual editor, so every change is validated and shows up live."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Plug className="size-3.5" /> Endpoint
            </CardDescription>
            <CardTitle className="font-mono text-sm break-all">{MCP_URL}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <KeyRound className="size-3.5" /> Authentication
            </CardDescription>
            <CardTitle className="text-sm font-normal">
              Bearer token. The key is the <code className="font-mono">MCP_API_KEY</code> set on the API server.
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" /> Transport
            </CardDescription>
            <CardTitle className="text-sm font-normal">Streamable HTTP · {CORE_TOOLS.length + EDIT_TOOLS.length} tools</CardTitle>
          </CardHeader>
        </Card>
      </div>

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
            <TabsList className="max-w-full overflow-x-auto">
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
            <code className="font-mono">get_page_outline</code> first so it knows the section ids.
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

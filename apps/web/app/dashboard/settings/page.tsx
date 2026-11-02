"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"

import { API_URL, EFFORTS, MCP_URL, MODELS, useProjectDefaults } from "@/components/dashboard/lib"
import { PageHeader } from "@/components/dashboard/shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Kbd } from "@/components/ui/kbd"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const MODEL_ITEMS = MODELS.map((m) => ({ value: m.value, label: `${m.label} · ${m.hint}` }))

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b py-4 last:border-0 last:pb-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const [defaults, setDefaults] = useProjectDefaults()
  const { theme, setTheme } = useTheme()
  // The theme is only known in the browser.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  const info = [
    { label: "API", value: API_URL },
    { label: "MCP endpoint", value: MCP_URL },
    { label: "Convex", value: process.env.NEXT_PUBLIC_CONVEX_URL ?? "Not set" },
  ]

  return (
    <>
      <PageHeader title="Settings" description="Preferences for this browser and details about this workspace." />

      <Card>
        <CardHeader>
          <CardTitle>New projects</CardTitle>
          <CardDescription>What a new project starts with. You can still change it each time.</CardDescription>
        </CardHeader>
        <CardContent>
          <Row title="AI model" description="Used when a page is too big to copy exactly and has to be rebuilt.">
            <Select items={MODEL_ITEMS} value={defaults.model} onValueChange={(v) => v && setDefaults({ model: v })}>
              <SelectTrigger className="sm:w-56" aria-label="Default AI model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_ITEMS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row title="Effort" description="Higher effort thinks longer and costs more per rebuild.">
            <Select items={EFFORTS} value={defaults.effort} onValueChange={(v) => v && setDefaults({ effort: v })}>
              <SelectTrigger className="sm:w-56" aria-label="Default effort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EFFORTS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Light is the default. Press <Kbd>D</Kbd> anywhere outside a text field to switch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Row title="Theme" description="Applies to the dashboard and the editor.">
            <ToggleGroup
              variant="outline"
              value={mounted && theme ? [theme] : []}
              onValueChange={(v) => v[0] && setTheme(v[0] as string)}
            >
              {THEMES.map(({ value, label, icon: Icon }) => (
                <ToggleGroupItem key={value} value={value} aria-label={label} className="gap-1.5 px-3">
                  <Icon />
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Where this dashboard sends requests. Set them in the web app&apos;s environment.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col">
            {info.map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-1 border-b py-3 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:justify-between">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="font-mono text-sm break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  )
}

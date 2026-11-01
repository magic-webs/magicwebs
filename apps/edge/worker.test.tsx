import { expect, test } from "bun:test"
import { applyOps, emptyPageDoc, SECTION_TEMPLATES, SECTION_TYPES } from "@magicwebs/page-schema"

const store = new Map<string, Response>()
;(globalThis as any).caches = {
  default: {
    match: async (r: Request) => store.get(r.url)?.clone(),
    put: async (r: Request, res: Response) => void store.set(r.url, res),
  },
}
const { default: worker } = await import("./src/index")

const { doc } = applyOps(emptyPageDoc("Edge test"), SECTION_TYPES.map((t) => ({ op: "add_section" as const, section: SECTION_TEMPLATES[t] })))
const kv: Record<string, string> = {
  "host:acme.magicwebs.site": "p1",
  "site:p1": JSON.stringify({ version: 4, publishedAt: Date.now(), doc }),
}
const env = { SITES: { get: async (k: string, o?: any) => (k in kv ? (o?.type === "json" ? JSON.parse(kv[k]) : kv[k]) : null) } }
const waits: Promise<unknown>[] = []
const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} }
const get = (url: string) => worker.fetch(new Request(url), env as any, ctx as any)

test("renders published page with all section types", async () => {
  const res = await get("https://acme.magicwebs.site/")
  expect(res.status).toBe(200)
  expect(res.headers.get("cache-control")).toContain("s-maxage")
  const html = await res.text()
  for (const t of SECTION_TYPES) expect(html).toContain(`data-section-type="${t}"`)
  expect(html).toContain("<title>Edge test</title>")
  expect(html).toContain('rel="canonical" href="https://acme.magicwebs.site/"')
  await Promise.all(waits)
  expect(store.size).toBe(1)
  expect((await get("https://acme.magicwebs.site/")).status).toBe(200)
})

test("unknown host, sitemap, robots, methods", async () => {
  expect((await get("https://other.example/")).status).toBe(404)
  expect(await (await get("https://acme.magicwebs.site/sitemap.xml")).text()).toContain("<loc>https://acme.magicwebs.site/</loc>")
  expect((await get("https://acme.magicwebs.site/robots.txt")).status).toBe(200)
  expect((await worker.fetch(new Request("https://acme.magicwebs.site/", { method: "POST" }), env as any, ctx as any)).status).toBe(405)
})

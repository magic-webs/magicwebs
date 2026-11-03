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
const env = { SITES: { get: async (k: string, o?: any) => (k in kv ? (o === "json" || o?.type === "json" ? JSON.parse(kv[k]) : kv[k]) : null) } }
const waits: Promise<unknown>[] = []
const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} }
const get = (url: string) => worker.fetch(new Request(url), env as any, ctx as any)

test("renders published page with all section types", async () => {
  const res = await get("https://acme.magicwebs.site/")
  expect(res.status).toBe(200)
  expect(res.headers.get("cache-control")).toContain("must-revalidate")
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

test("multi-page site: routes by path, links between pages, sitemap", async () => {
  const link = (href: string) => ({
    ...emptyPageDoc("Page"),
    sections: [{ id: "h1", type: "html" as const, props: { html: `<a href="${href}">next</a>` } }],
  })
  kv["host:multi.magicwebs.site"] = "p2"
  kv["site:p2"] = JSON.stringify({
    version: 2,
    publishedAt: Date.now(),
    pages: [
      { path: "/", title: "Home", source: "https://www.shop.example/" },
      { path: "/about", title: "About", source: "https://shop.example/about-us/" },
    ],
    doc: link("https://shop.example/about-us/#team"),
  })
  kv["page:p2:/about"] = JSON.stringify({ version: 2, doc: link("https://shop.example/blog") })

  const home = await (await get("https://multi.magicwebs.site/")).text()
  expect(home).toContain('href="/about#team"')
  const about = await get("https://multi.magicwebs.site/about")
  expect(about.status).toBe(200)
  // Pages that weren't cloned keep linking to the original site.
  expect(await about.text()).toContain('href="https://shop.example/blog"')
  const slash = await get("https://multi.magicwebs.site/about/")
  expect(slash.status).toBe(301)
  expect(slash.headers.get("location")).toBe("https://multi.magicwebs.site/about")
  expect((await get("https://multi.magicwebs.site/missing")).status).toBe(404)
  const sitemap = await (await get("https://multi.magicwebs.site/sitemap.xml")).text()
  expect(sitemap).toContain("<loc>https://multi.magicwebs.site/about</loc>")
})

import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"

import { applyOps, emptyPageDoc } from "@magicwebs/page-schema"

import { collectKit, KIT_PATH, renderKit } from "../../scripts/build-export-kit"
import { buildNextProject } from "./src/index"

test("the embedded renderer and schema match their source", () => {
  // Fails after editing packages/renderer or packages/page-schema: run `bun run export-kit`.
  expect(readFileSync(KIT_PATH, "utf8").replace(/\r\n/g, "\n")).toBe(renderKit(collectKit()))
})

test("buildNextProject writes a page per path with links pointing at the export", () => {
  const home = applyOps(emptyPageDoc("Home"), [
    {
      op: "add_section",
      section: { type: "cta", props: { heading: "Hi", primaryCta: { label: "About", href: "https://www.acme.test/about-us/" } } },
    },
  ]).doc
  const files = buildNextProject({
    name: "Acme Inc!",
    pages: [
      { path: "/", title: "Home", sourceUrl: "https://acme.test/", doc: home },
      { path: "/about-us", title: "About", sourceUrl: "https://acme.test/about-us", doc: emptyPageDoc("About") },
    ],
  })
  expect(JSON.parse(files["package.json"]!).name).toBe("acme-inc")
  expect(JSON.parse(files["content/site.json"]!).pages).toEqual([
    { path: "/", title: "Home", file: "index.json" },
    { path: "/about-us", title: "About", file: "about-us.json" },
  ])
  expect(files["content/pages/index.json"]).toContain('"href": "/about-us"')
  expect(files["app/[[...slug]]/page.tsx"]).toContain("generateStaticParams")
  expect(files["lib/magicwebs/renderer/sections.tsx"]).toContain("SECTION_COMPONENTS")
  expect(files["lib/magicwebs/renderer/server.tsx"]).toBeUndefined()
  expect(() => buildNextProject({ name: "x", pages: [] })).toThrow()
})

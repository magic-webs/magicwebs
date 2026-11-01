import { expect, test } from "bun:test"
import { applyOps, emptyPageDoc, OpSchema } from "@magicwebs/page-schema"
import { renderPage } from "./src/server"

test("ops + render", async () => {
  let { doc, results } = applyOps(emptyPageDoc("Acme"), [
    { op: "add_section", section: { type: "hero", props: { layout: "centered", heading: "Hello <world>", primaryCta: { label: "Go", href: "javascript:alert(1)" } } } },
    { op: "add_section", section: { type: "footer", props: { columns: [], copyright: "© Acme" } } },
    { op: "add_section", section: { type: "faq", props: { items: [{ question: "Q?", answer: "A" }] } } },
    { op: "update_theme", colors: { primary: "red</style><script>" } },
  ])
  expect(doc.sections.map((s) => s.type)).toEqual(["hero", "faq", "footer"])
  const heroId = doc.sections[0].id
  ;({ doc } = applyOps(doc, [{ op: "set_field", sectionId: heroId, path: "props.heading", value: "Changed" }]))
  expect(() => applyOps(doc, [{ op: "set_field", sectionId: heroId, path: "props.layout", value: "nope" }])).toThrow()
  expect(OpSchema.safeParse({ op: "remove_section", sectionId: "x" }).success).toBe(true)
  const html = await new Response(await renderPage(doc, { url: "https://acme.test/" })).text()
  expect(html).toContain("Changed")
  expect(html).not.toContain("javascript:")
  expect(html).not.toContain("red</style>")

})

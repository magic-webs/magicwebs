import { expect, test } from "bun:test"

import {
  applyOps,
  applyTemplate,
  DESIGN_TEMPLATES,
  emptyPageDoc,
  getTemplate,
  PageDocSchema,
  revampRules,
  TEMPLATE_IDS,
  type PageDoc,
} from "@magicwebs/page-schema"

import { ICON_NAMES, iconFor } from "@magicwebs/page-schema"

import { ICON_NODES } from "./src/icons.generated"
import { documentCss } from "./src/index"
import { renderPage } from "./src/server"

function typedPage(): PageDoc {
  return applyOps(emptyPageDoc("Acme"), [
    { op: "add_section", section: { type: "navbar", props: { brand: "Acme", links: [] } } },
    {
      op: "add_section",
      section: { type: "hero", props: { layout: "centered", heading: "Hello **world**" }, style: { background: "#ff0000", color: "#00ff00", align: "center" } },
    },
    { op: "add_section", section: { type: "features", props: { columns: 3, variant: "cards", items: [] }, style: { background: "#123456" } } },
    { op: "add_section", section: { type: "testimonials", props: { items: [] } } },
    { op: "add_section", section: { type: "faq", props: { items: [] } } },
    { op: "add_section", section: { type: "cta", props: { heading: "Go" } } },
    { op: "add_section", section: { type: "footer", props: { columns: [] } } },
  ]).doc
}

test("every template id has a definition and CSS", () => {
  expect(DESIGN_TEMPLATES.map((t) => t.id)).toEqual([...TEMPLATE_IDS])
  for (const template of DESIGN_TEMPLATES) {
    expect(template.theme.template).toBe(template.id)
    const doc = { ...emptyPageDoc(), theme: template.theme }
    expect(documentCss(doc)).toContain("[data-ink]")
    expect(revampRules(template)).toContain(template.name)
  }
  expect(documentCss(emptyPageDoc())).not.toContain("[data-ink]")
})

test("applyTemplate replaces the old design and keeps content and layout choices", () => {
  const editorial = getTemplate("editorial")!
  const doc = applyTemplate(typedPage(), editorial)
  expect(PageDocSchema.safeParse(doc).success).toBe(true)
  expect(doc.theme).toEqual(editorial.theme)
  const [nav, hero, features, testimonials, faq, cta] = doc.sections
  expect(hero.style).toEqual({ align: "center", paddingY: editorial.rhythm.paddingY })
  expect(hero.props).toMatchObject({ heading: "Hello **world**" })
  expect(hero.animation).toBe("none")
  expect(features.style?.background).toBeUndefined()
  // Editorial alternates content and testimonials; cta is a dark band.
  expect(testimonials.style?.background).toBe(editorial.theme.colors.muted)
  expect(faq.style?.background).toBeUndefined()
  expect(cta.style).toMatchObject(editorial.rhythm.invertedStyle)
  expect(nav.type === "navbar" && nav.props.sticky).toBe(false)
})

test("apply_template restyles a typed page and leaves exact clones' markup alone", async () => {
  const { doc, results } = applyOps(typedPage(), [{ op: "apply_template", template: "midnight" }])
  expect(results).toEqual(["Applied the Midnight template"])
  expect(doc.theme.template).toBe("midnight")
  const html = await new Response(await renderPage(doc, { url: "https://acme.test/" })).text()
  expect(html).toContain("Space+Grotesk")
  expect(html).toContain("background-clip:text")

  const exact = applyOps(
    { ...emptyPageDoc(), styles: { css: ".a{}" } },
    [
      { op: "add_section", section: { type: "html", props: { html: "<div class=a>x</div>" } } },
      { op: "apply_template", template: "playful" },
    ],
  ).doc
  expect(exact.styles?.css).toBe(".a{}")
  expect(exact.sections[0]).toMatchObject({ type: "html", props: { html: "<div class=a>x</div>" } })
  expect(() => applyOps(typedPage(), [{ op: "apply_template", template: "nope" } as never])).toThrow()
})

test("feature icons are line icons, and templates replace emojis with them", async () => {
  // Fails after changing ICON_NAMES: run `bun run icons`.
  expect(Object.keys(ICON_NODES).sort()).toEqual([...ICON_NAMES].sort())
  expect(iconFor("🚀")).toBe("rocket")
  expect(iconFor("🛡️")).toBe("shield-check")
  expect(iconFor("🛡")).toBe("shield-check")
  expect(iconFor("🦄")).toBe("sparkles")
  expect(iconFor("zap")).toBe("zap")
  expect(iconFor("01")).toBe("01")

  const page = applyOps(emptyPageDoc(), [
    {
      op: "add_section",
      section: { type: "features", props: { columns: 2, variant: "cards", items: [{ icon: "📊", title: "A", body: "" }, { icon: "🦄", title: "B", body: "" }] } },
    },
  ]).doc
  for (const template of DESIGN_TEMPLATES) {
    const doc = applyTemplate(page, template)
    const features = doc.sections[0]!
    expect(features.type === "features" && features.props.items.map((i) => i.icon)).toEqual(["chart-bar", "sparkles"])
    const html = await new Response(await renderPage(doc, { url: "https://acme.test/" })).text()
    expect(html.match(/<svg[^>]*viewBox="0 0 24 24"/g)?.length).toBe(2)
    expect(html).not.toContain("📊")
  }
})

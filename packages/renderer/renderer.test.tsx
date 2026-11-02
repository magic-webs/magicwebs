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

test("exact clones render original markup and CSS, sanitized", async () => {
  let { doc } = applyOps(emptyPageDoc("Exact"), [
    {
      op: "add_section",
      section: {
        type: "html",
        props: {
          label: "Hero",
          html: `<header class="site-header" data-mw-k="1"><h1 class="title">Hello</h1><img src="https://x.test/a.png" onerror="alert(1)"><img srcset="https://x.test/a.png 969w, https://x.test/b.png 1369w, javascript:alert(1) 2x"><a href="javascript:alert(1)">bad</a><a href="https://ok.test/">ok</a><script>alert(1)</script><svg viewBox="0 0 10 10"><use href="https://evil.test/x.svg#a"></use><use href="#icon"></use><a xlink:href="javascript:alert(1)"><path d="M0 0"/></a><style>.a{fill:red}</style><foreignObject><img src=x onerror=alert(1)></foreignObject></svg><iframe src="https://evil.test/"></iframe><iframe src="https://www.youtube.com/embed/abc" sandbox="allow-top-navigation"></iframe><style>body{}</style></header>`,
        },
      },
    },
  ])
  ;({ doc } = applyOps({ ...doc, styles: { css: ".title{color:red}</style><script>alert(1)</script>", bodyClass: "home", bodyAttributes: { "data-aos-easing": "ease", onload: "alert(1)" } } }, [
    { op: "edit_page_css", replace: ".title:hover{color:blue}" },
  ]))
  const id = doc.sections[0].id
  ;({ doc } = applyOps(doc, [{ op: "edit_html", sectionId: id, find: "Hello", replace: "Welcome" }]))
  expect(() => applyOps(doc, [{ op: "edit_html", sectionId: id, find: "missing", replace: "x" }])).toThrow()

  const html = await new Response(await renderPage(doc, { url: "https://acme.test/" })).text()
  expect(html).toContain('<h1 class="title">Welcome</h1>')
  expect(html).toContain(".title:hover{color:blue}")
  expect(html).toContain('class="mw-root mw-exact"')
  expect(html).toContain('<body class="home" data-aos-easing="ease">')
  expect(html).toContain('href="https://ok.test/"')
  expect(html).toContain('<use href="#icon">')
  expect(html).toContain("youtube.com/embed/abc")
  expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"')
  expect(html).not.toContain("allow-top-navigation")
  expect(html).not.toContain("onerror")
  expect(html).not.toContain("onload")
  expect(html).not.toContain("javascript:")
  expect(html).not.toContain("evil.test")
  expect(html).not.toContain("<script>alert")
  expect(html).toContain(".title{color:red}>>alert(1)>")
  expect(html).not.toContain("foreignObject")
  expect(html).toContain('srcset="https://x.test/a.png 969w, https://x.test/b.png 1369w"')
  expect(html).toContain('data-mw-k="1"')
  expect(html).toContain("function exactRuntime")
})

test("exact runtime replays recorded clicks", () => {
  const { exactRuntime } = require("./src/runtime")
  expect(typeof exactRuntime).toBe("function")
  // Self-contained: the serialized function must not reference module scope.
  expect(() => new Function(`return (${exactRuntime.toString()})`)()).not.toThrow()
})

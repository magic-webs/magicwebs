import { describe, expect, test } from "bun:test"

import { emptyPageDoc, type PageDoc, type Section } from "@magicwebs/page-schema"

import { blogIndexHtml, blogPostHtml, blogShell } from "./blog"

function page(sections: Section[]): PageDoc {
  return { ...emptyPageDoc("Acme"), sections }
}

const navbar: Section = { id: "nav", type: "navbar", props: { brand: "Acme", links: [] } }
const hero: Section = { id: "hero", type: "hero", props: { layout: "centered", heading: "Hi" } }
const footer: Section = { id: "foot", type: "footer", props: { columns: [] } }

describe("blogShell", () => {
  test("keeps the home page's header and footer and puts the blog between them", () => {
    const { doc, after } = blogShell(page([navbar, hero, footer]), { title: "Blog · Acme", description: "News" })
    expect(doc.sections.map((s) => s.id)).toEqual(["nav", "foot"])
    expect(after).toBe(1)
    expect(doc.meta.title).toBe("Blog · Acme")
    expect(doc.script).toBeUndefined()
  })

  test("finds a copied header and footer by their markup", () => {
    const header: Section = { id: "h", type: "html", props: { html: "<header><nav>…</nav></header>" } }
    const body: Section = { id: "b", type: "html", props: { html: "<section>…</section>" } }
    const foot: Section = { id: "f", type: "html", props: { html: "<div><footer>©</footer></div>" } }
    const { doc, after } = blogShell(page([header, body, foot]), { title: "t", description: "d" })
    expect(doc.sections.map((s) => s.id)).toEqual(["h", "f"])
    expect(after).toBe(1)
  })

  test("a page without either gets the blog alone", () => {
    const { doc, after } = blogShell(page([hero]), { title: "t", description: "d" })
    expect(doc.sections).toEqual([])
    expect(after).toBe(0)
  })
})

describe("blog markup", () => {
  test("escapes what writers type", () => {
    const html = blogIndexHtml(
      [{ slug: "a b", title: "<script>x</script>", excerpt: 'Say "hi"', tags: ["News"], publishedAt: Date.UTC(2026, 0, 2) }],
      { title: "Blog & news" },
    )
    expect(html).toContain("Blog &amp; news")
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;")
    expect(html).toContain("Say &quot;hi&quot;")
    expect(html).toContain('href="/blog/a%20b"')
  })

  test("places the body after the title", () => {
    const html = blogPostHtml({ slug: "a", title: "Hello", tags: [], publishedAt: 0, html: "<p>Body</p>" })
    expect(html.indexOf("Hello")).toBeLessThan(html.indexOf("<p>Body</p>"))
  })
})

describe("Latest posts section", async () => {
  const { renderToString } = await import("react-dom/server")
  const { PageRenderer } = await import("./index")
  const doc = page([{ id: "p", type: "posts", props: { heading: "Latest", count: 2 } }])
  const post = (slug: string, title: string) => ({ slug, title, tags: [], publishedAt: Date.UTC(2026, 10, 1) })

  test("shows the newest posts up to its count, with a link to the blog", () => {
    const html = renderToString(<PageRenderer doc={doc} posts={{ posts: [post("a", "First"), post("b", "Second"), post("c", "Third")], preview: false }} />)
    expect(html).toContain('href="/blog/a"')
    expect(html).toContain("Second")
    expect(html).not.toContain("Third")
    expect(html).toContain('href="/blog"')
  })

  test("shows nothing on the site without posts, and a placeholder in the editor", () => {
    expect(renderToString(<PageRenderer doc={doc} posts={{ posts: [], preview: false }} />)).not.toContain("Latest")
    expect(renderToString(<PageRenderer doc={doc} posts={{ posts: [], preview: true }} />)).toContain("appear here")
  })
})

import { describe, expect, test } from "bun:test"

import { addBlogToPage } from "./blog"
import { parseSiteDetails } from "./details"
import { emptyPageDoc, type PageDoc, type Section } from "./schema"

const page = (sections: Section[]): PageDoc => ({ ...emptyPageDoc("Acme"), sections })

describe("addBlogToPage", () => {
  const navbar: Section = { id: "nav", type: "navbar", props: { links: [{ label: "About", href: "/about" }] } }
  const footer: Section = { id: "foot", type: "footer", props: { columns: [] } }

  test("adds a Blog link and, on the home page, a Latest posts section before the footer", () => {
    const next = addBlogToPage(page([navbar, footer]), { home: true })!
    const nav = next.sections[0]!
    expect(nav.type === "navbar" && nav.props.links.at(-1)).toEqual({ label: "Blog", href: "/blog" })
    expect(next.sections.map((s) => s.type)).toEqual(["navbar", "posts", "footer"])
  })

  test("other pages get the link only, and a second run changes nothing", () => {
    const once = addBlogToPage(page([navbar, footer]), { home: false })!
    expect(once.sections.map((s) => s.type)).toEqual(["navbar", "footer"])
    expect(addBlogToPage(once, { home: false })).toBeNull()
  })

  test("copies the last item of a copied header's menu, classes and all", () => {
    const html =
      '<header class="top"><nav><ul class="menu"><li class="item active"><a class="link" href="https://acme.in/">Home</a></li><li class="item"><a class="link" href="https://acme.in/contact"><span>Contact</span></a></li></ul></nav></header>'
    const next = addBlogToPage(page([{ id: "h", type: "html", props: { html } }]), { home: false })!
    const out = next.sections[0]!
    expect(out.type === "html" && out.props.html).toContain('<li class="item"><a class="link" href="/blog"><span>Blog</span></a></li></ul>')
  })

  test("leaves a header that already links the blog", () => {
    const html = '<nav><a href="/blog">Blog</a></nav>'
    expect(addBlogToPage(page([{ id: "h", type: "html", props: { html } }]), { home: false })).toBeNull()
  })
})

describe("parseSiteDetails", () => {
  test("reads the business's own structured data, icons and social profiles", () => {
    const html = `<html><head>
      <meta name="description" content="Fallback description">
      <link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple.png">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
        {"@type":"WebSite","name":"Acme site"},
        {"@type":"ProfessionalService","name":"Acme Studio","logo":{"@type":"ImageObject","url":"/logo.png"},
         "telephone":"+91 98765 43210","email":"mailto:hi@acme.in",
         "address":{"@type":"PostalAddress","streetAddress":"12 MG Road","addressLocality":"Pune","postalCode":"411001","addressCountry":"IN"},
         "openingHoursSpecification":[{"dayOfWeek":["Monday","Friday"],"opens":"09:00:00","closes":"18:00:00"}],
         "sameAs":["https://www.instagram.com/acme"],"priceRange":"₹₹"}
      ]}</script></head>
      <body><a href="https://facebook.com/sharer/sharer.php?u=x">Share</a><a href="https://www.linkedin.com/company/acme">In</a></body></html>`
    expect(parseSiteDetails(html, "https://acme.in/")).toEqual({
      name: "Acme Studio",
      description: "Fallback description",
      logo: "https://acme.in/logo.png",
      industry: "Professional service",
      address: "12 MG Road, Pune, 411001, IN",
      phone: "+91 98765 43210",
      email: "hi@acme.in",
      openingHours: "Monday, Friday 09:00–18:00",
      priceRange: "₹₹",
      areaServed: undefined,
      foundingDate: undefined,
      socials: { Instagram: "https://www.instagram.com/acme", LinkedIn: "https://www.linkedin.com/company/acme" },
    })
  })

  test("a site without structured data still gives its description and icon", () => {
    const details = parseSiteDetails('<meta property="og:description" content="Hi"><link rel="icon" href="/i.png">', "https://a.co")
    expect(details.description).toBe("Hi")
    expect(details.logo).toBe("https://a.co/i.png")
    expect(details.industry).toBeUndefined()
  })
})

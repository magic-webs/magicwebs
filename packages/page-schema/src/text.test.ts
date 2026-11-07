import { describe, expect, test } from "bun:test"

import { emptyPageDoc, type PageDoc, type Section } from "./schema"
import { htmlText, pageText, siteProfile } from "./text"

function page(sections: Section[], meta: Partial<PageDoc["meta"]> = {}): PageDoc {
  const doc = emptyPageDoc("Acme")
  return { ...doc, meta: { ...doc.meta, ...meta }, sections }
}

describe("htmlText", () => {
  test("keeps the words and drops markup, scripts and styles", () => {
    expect(
      htmlText('<style>.a{}</style><h2>Our <b>services</b></h2><p>Web &amp; app design</p><script>x()</script><a href="/x">More</a>'),
    ).toBe("Our services\nWeb & app design\nMore")
  })
})

describe("pageText", () => {
  test("reads typed sections without links or styling, and FAQs as questions and answers", () => {
    const text = pageText(
      page(
        [
          { id: "h", type: "hero", props: { layout: "centered", heading: "We build **websites**", primaryCta: { label: "Start", href: "https://x.y" } } },
          { id: "f", type: "faq", props: { heading: "FAQ", items: [{ question: "How long?", answer: "Two weeks." }] } },
        ],
        { description: "A studio." },
      ),
    )
    expect(text).toContain("We build websites")
    expect(text).toContain("Start")
    expect(text).not.toContain("https://x.y")
    expect(text).toContain("Q: How long?\nA: Two weeks.")
    expect(text).toContain("A studio.")
  })
})

describe("siteProfile", () => {
  test("finds the pitch, tagline, email and phone", () => {
    const home = page(
      [
        { id: "h", type: "hero", props: { layout: "centered", heading: "Web & App **Solutions**" } },
        { id: "c", type: "html", props: { html: '<footer><a href="mailto:hi@acme.in">Mail</a><a href="tel:+919876543210">Call</a></footer>' } },
      ],
      { description: "We bring ideas online." },
    )
    expect(siteProfile(home, [home])).toEqual({
      description: "We bring ideas online.",
      tagline: "Web & App Solutions",
      supportEmail: "hi@acme.in",
      supportPhone: "+919876543210",
    })
  })
})

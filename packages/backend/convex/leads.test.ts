import { describe, expect, test } from "bun:test"

import { leadDetails } from "./leads"

const pairs = (o: Record<string, string>) => Object.entries(o).map(([key, value]) => ({ key, value }))

describe("leadDetails", () => {
  test("reads the usual names", () => {
    expect(
      leadDetails(pairs({ name: "Asha Rao", email: "asha@example.com", phone: "+91 98765 43210", company: "Rao & Co", message: "Need a quote" })),
    ).toEqual({ name: "Asha Rao", email: "asha@example.com", phone: "+91 98765 43210", company: "Rao & Co", message: "Need a quote" })
  })

  test("reads names copied forms use", () => {
    expect(
      leadDetails(
        pairs({ "your-name": "Asha", "your-email": "a@b.co", "mobile_number": "999", "Your Enquiry": "Hi", "business name": "Acme" }),
      ),
    ).toEqual({ name: "Asha", email: "a@b.co", phone: "999", message: "Hi", company: "Acme" })
  })

  test("joins first and last names, and finds an unnamed email by its value", () => {
    expect(leadDetails(pairs({ first_name: "Asha", last_name: "Rao", input_3: "asha@example.com" }))).toEqual({
      name: "Asha Rao",
      email: "asha@example.com",
    })
  })
})

import { markdownToHtml } from "./posts"

describe("markdownToHtml", () => {
  test("renders headings, emphasis, links and lists", () => {
    const html = markdownToHtml("## Title\n\nSome **bold** and a [link](https://example.com).\n\n- one\n- two")
    expect(html).toContain("<h2>Title</h2>")
    expect(html).toContain("<strong>bold</strong>")
    expect(html).toContain('<a href="https://example.com">link</a>')
    expect(html).toContain("<li>one</li>")
  })
})

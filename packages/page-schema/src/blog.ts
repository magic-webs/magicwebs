import { newSectionId } from "./ops"
import type { PageDoc, Section } from "./schema"

// When a site publishes its first blog post, its pages link to the blog: a
// "Blog" link in the navbar of every page, and a "Latest posts" section on the
// home page before its footer. Doing it twice changes nothing.

const BLOG_HREF = "/blog"
const LINKS_BLOG = /href\s*=\s*["']\/blog\/?["']/i

/** The copied header's last menu item, repeated for the blog: same markup and classes, so it looks like the rest. */
function addHtmlLink(html: string): string | null {
  if (LINKS_BLOG.test(html)) return null
  const nav = html.match(/<nav\b[\s\S]*?<\/nav>/i) ?? html.match(/<header\b[\s\S]*?<\/header>/i)
  if (!nav || nav.index === undefined) return null
  const region = nav[0]
  const isMenuLink = (markup: string) => {
    const href = markup.match(/href\s*=\s*["']([^"']*)["']/i)?.[1] ?? ""
    return !/^(mailto:|tel:|javascript:)/i.test(href) && /<a\b/i.test(markup) && />[^<]*[^<\s][^<]*</.test(markup)
  }
  const items = [...region.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)].filter((m) => isMenuLink(m[0]))
  const anchors = [...region.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].filter((m) => isMenuLink(m[0]))
  const last = items.at(-1) ?? anchors.at(-1)
  if (!last || last.index === undefined) return null

  let copy = last[0].replace(/(<a\b[^>]*?href\s*=\s*)(["'])[^"']*\2/i, `$1"${BLOG_HREF}"`)
  // The visible label is the last run of text in the item.
  const texts = [...copy.matchAll(/>([^<]*[^<\s][^<]*)</g)]
  const label = texts.at(-1)
  if (!label || label.index === undefined) return null
  const at = label.index + 1
  copy = copy.slice(0, at) + "Blog" + copy.slice(at + label[1]!.length)
  // An item marked as the current page would claim to be the blog page too.
  copy = copy.replace(/\s(aria-current)\s*=\s*["'][^"']*["']/gi, "").replace(/\b(active|current|is-active|current-menu-item)\b/g, "")

  const end = nav.index + last.index + last[0].length
  return html.slice(0, end) + copy + html.slice(end)
}

function isFooter(section: Section): boolean {
  return section.type === "footer" || (section.type === "html" && /<footer\b/i.test(section.props.html))
}

/** The page with its blog link and, on the home page, its latest-posts section; null when it has them already. */
export function addBlogToPage(doc: PageDoc, options: { home: boolean }): PageDoc | null {
  let changed = false
  const sections = doc.sections.map((section, index) => {
    if (section.type === "navbar") {
      if (section.props.links.some((link) => link.href.replace(/\/$/, "") === BLOG_HREF)) return section
      changed = true
      return { ...section, props: { ...section.props, links: [...section.props.links, { label: "Blog", href: BLOG_HREF }] } }
    }
    // A copied header is the first section that holds the site's navigation.
    if (section.type === "html" && index === doc.sections.findIndex((s) => s.type === "html" && /<(nav|header)\b/i.test(s.props.html))) {
      const html = addHtmlLink(section.props.html)
      if (!html) return section
      changed = true
      return { ...section, props: { ...section.props, html } }
    }
    return section
  })

  if (options.home && !sections.some((s) => s.type === "posts")) {
    const footer = sections.findLastIndex((s) => !s.hidden && isFooter(s))
    const posts: Section = {
      id: newSectionId(),
      type: "posts",
      props: { heading: "Latest from the blog", count: 3, linkLabel: "All posts" },
    }
    sections.splice(footer < 0 ? sections.length : footer, 0, posts)
    changed = true
  }
  return changed ? { ...doc, sections } : null
}

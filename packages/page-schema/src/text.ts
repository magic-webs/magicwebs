import type { PageDoc, Section } from "./schema"

// The words of a page, for the knowledge base of the site's Magic Agent
// workspace: what a visitor reads, without markup, links or styling.

/** Props that hold addresses, names of things or styling rather than words. */
const SKIP_KEYS = new Set(["href", "src", "icon", "image", "logo", "style", "mobileStyle", "css", "id", "type", "layout", "variant", "name"])

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " }

/** Text of copied markup: tags, scripts and styles dropped, entities decoded, one block per line. */
export function htmlText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/tr|\/blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (match, name: string) => ENTITIES[name] ?? (name.startsWith("#") ? String.fromCharCode(Number(name.slice(1)) || 32) : match))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
}

function collect(value: unknown, key: string | null, out: string[]) {
  if (key && SKIP_KEYS.has(key)) return
  if (typeof value === "string") {
    const text = value.replace(/\*\*/g, "").trim()
    if (text && !/^(https?:|mailto:|tel:|#|\/)/i.test(text)) out.push(text)
  } else if (Array.isArray(value)) {
    for (const item of value) collect(item, null, out)
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collect(v, k, out)
  }
}

function sectionText(section: Section): string {
  if (section.type === "html") return htmlText(section.props.html)
  if (section.type === "faq") {
    const p = section.props
    return [p.heading, ...p.items.map((item) => `Q: ${item.question}\nA: ${item.answer}`)].filter(Boolean).join("\n")
  }
  if (section.type === "form") return ""
  const out: string[] = []
  collect(section.props, null, out)
  return out.join("\n")
}

/** A page's readable text, section by section, with its title and description first. */
export function pageText(doc: PageDoc): string {
  const parts = [doc.meta.title, doc.meta.description, ...doc.sections.filter((s) => !s.hidden).map(sectionText)]
  return [...new Set(parts.map((p) => p?.trim()).filter(Boolean))].join("\n\n")
}

/** Every link target on a page, for finding its contact details. */
function linksOf(doc: PageDoc): string[] {
  const links: string[] = []
  for (const section of doc.sections) {
    if (section.type === "html") {
      for (const match of section.props.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) links.push(match[1]!)
    } else {
      const walk = (value: unknown, key: string | null) => {
        if (key === "href" && typeof value === "string") links.push(value)
        else if (Array.isArray(value)) value.forEach((item) => walk(item, null))
        else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => walk(v, k))
      }
      walk(section.props, null)
    }
  }
  return links
}

/** The logo the page shows: a typed navbar's, or an image marked as a logo in a copied header. */
function logoOf(home: PageDoc): string | undefined {
  for (const section of home.sections.slice(0, 2)) {
    if (section.type === "navbar" && section.props.logo?.src) return section.props.logo.src
    if (section.type === "html") {
      for (const img of section.props.html.matchAll(/<img[^>]*>/gi)) {
        if (/logo/i.test(img[0])) {
          const src = img[0].match(/\ssrc\s*=\s*["']([^"']+)["']/i)?.[1]
          if (src && /^https:\/\//i.test(src)) return src
        }
      }
    }
  }
  return undefined
}

/** The company details a site states: its pitch, tagline, logo, email and phone. */
export function siteProfile(home: PageDoc, pages: PageDoc[]): {
  description?: string
  tagline?: string
  logo?: string
  supportEmail?: string
  supportPhone?: string
} {
  const links = pages.flatMap(linksOf)
  const text = pages.map(pageText).join("\n")
  const mail = links.find((l) => /^mailto:/i.test(l))?.replace(/^mailto:/i, "").split("?")[0]
  const tel = links.find((l) => /^tel:/i.test(l))?.replace(/^tel:/i, "")
  const hero = home.sections.find((s) => s.type === "hero")
  const heading =
    hero?.type === "hero"
      ? hero.props.heading
      : home.sections
          .filter((s) => s.type === "html")
          .map((s) => (s.type === "html" ? s.props.html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] : undefined))
          .find(Boolean)
  const tagline = heading ? htmlText(heading.replace(/\*\*/g, "")).replace(/\n/g, " ").slice(0, 160) : undefined
  return {
    description: home.meta.description?.trim() || undefined,
    tagline: tagline || undefined,
    logo: logoOf(home),
    supportEmail: decodeURIComponent(mail ?? "") || text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0],
    supportPhone: decodeURIComponent(tel ?? "").trim() || text.match(/\+?\d[\d\s().-]{8,}\d/)?.[0]?.trim(),
  }
}

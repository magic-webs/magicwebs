import * as cheerio from "cheerio"

export type HtmlFacts = {
  meta: {
    title?: string
    description?: string
    favicon?: string
    ogImage?: string
    lang?: string
  }
  googleFonts: string[]
  /** Visible text structure with scripts, styles and SVG paths removed. */
  outline: string
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined
  try {
    return new URL(href, base).href
  } catch {
    return undefined
  }
}

/** Static facts that are easier to read from markup than from the live DOM. */
export function extractFromHtml(html: string, baseUrl: string): HtmlFacts {
  const $ = cheerio.load(html)

  const meta = {
    title: $("title").first().text().trim() || $('meta[property="og:title"]').attr("content"),
    description:
      $('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content"),
    favicon: absolute(
      $('link[rel="icon"]').attr("href") ?? $('link[rel="shortcut icon"]').attr("href") ?? "/favicon.ico",
      baseUrl,
    ),
    ogImage: absolute($('meta[property="og:image"]').attr("content"), baseUrl),
    lang: $("html").attr("lang"),
  }

  const googleFonts = new Set<string>()
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr("href") ?? ""
    for (const match of href.matchAll(/family=([^:&]+)/g)) {
      googleFonts.add(decodeURIComponent(match[1].replace(/\+/g, " ")))
    }
  })

  $("script,style,noscript,template,iframe,svg path,link,meta").remove()
  const lines: string[] = []
  $("body")
    .find("h1,h2,h3,h4,p,li,a,button,img,blockquote,summary")
    .each((_, el) => {
      const node = $(el)
      const tag = el.tagName.toLowerCase()
      if (tag === "img") {
        lines.push(`<img alt="${node.attr("alt") ?? ""}">`)
        return
      }
      const text = node.text().replace(/\s+/g, " ").trim()
      if (text && text.length < 400) lines.push(`<${tag}> ${text}`)
    })

  return {
    meta,
    googleFonts: [...googleFonts],
    outline: [...new Set(lines)].join("\n").slice(0, 20000),
  }
}

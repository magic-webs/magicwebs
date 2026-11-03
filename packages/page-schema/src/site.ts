import type { PageDoc } from "./schema"

// A project is a site: one page document per path ("/", "/about", ...).
// These helpers are shared by the backend (discovery, cloning), the edge
// worker (routing, links) and the editor, so all of them agree on what a
// page's path is.

/** Most pages one project can hold. */
export const MAX_SITE_PAGES = 10

export const HOME_PATH = "/"

/**
 * The canonical path of a page URL: no query or hash, no trailing slash,
 * `index.html` folded into its folder. The home page is "/".
 */
export function pagePath(url: string | URL): string {
  const parsed = typeof url === "string" ? new URL(url, "https://x.invalid") : url
  let path = parsed.pathname.replace(/\/{2,}/g, "/")
  path = path.replace(/\/index\.(html?|php|aspx?)$/i, "/")
  if (path.length > 1) path = path.replace(/\/+$/, "")
  return path || HOME_PATH
}

/** A hostname without its leading "www.", so www and bare domains count as one site. */
export function siteHost(url: string | URL): string {
  const parsed = typeof url === "string" ? new URL(url) : url
  return parsed.hostname.toLowerCase().replace(/^www\./, "")
}

export function isSameSite(a: string | URL, b: string | URL): boolean {
  try {
    return siteHost(a) === siteHost(b)
  } catch {
    return false
  }
}

/** A readable page name from its path, e.g. "/about-us" -> "About us". */
export function titleFromPath(path: string): string {
  if (path === HOME_PATH) return "Home"
  const last = decodeSafe(path.split("/").filter(Boolean).at(-1) ?? "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_+]+/g, " ")
    .trim()
  return last ? last[0]!.toUpperCase() + last.slice(1) : path
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** One cloned page of a site: where it came from and where the clone serves it. */
export type SitePage = { path: string; source: string }

function mapStrings(node: unknown, fn: (value: string) => string): unknown {
  if (typeof node === "string") return fn(node)
  if (Array.isArray(node)) return node.map((n) => mapStrings(n, fn))
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, mapStrings(v, fn)]))
  }
  return node
}

/**
 * Point links between a site's cloned pages at the clone's own paths, so
 * "https://example.com/about" becomes "/about" when /about was cloned too.
 * Links to pages that weren't cloned keep pointing at the original site, and
 * links with a query string are left alone (the clone has one page per path).
 */
export function rewriteSiteLinks(doc: PageDoc, pages: SitePage[]): PageDoc {
  const bySource = new Map<string, string>()
  let host: string | null = null
  for (const page of pages) {
    try {
      host ??= siteHost(page.source)
      bySource.set(pagePath(page.source), page.path)
    } catch {
      // A page without a parseable source can't be linked to.
    }
  }
  if (!host || bySource.size === 0) return doc

  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`https?:\\/\\/(?:www\\.)?${escaped}(?::\\d+)?(\\/[^\\s"'<>()\\\\]*)?`, "gi")
  return mapStrings(doc, (value) =>
    value.includes(host!)
      ? value.replace(pattern, (match, rest: string | undefined) => {
          const tail = rest ?? "/"
          const hashAt = tail.indexOf("#")
          const beforeHash = hashAt < 0 ? tail : tail.slice(0, hashAt)
          if (beforeHash.includes("?")) return match
          const target = bySource.get(pagePath(beforeHash))
          if (!target) return match
          return target + (hashAt < 0 ? "" : tail.slice(hashAt))
        })
      : value,
  ) as PageDoc
}

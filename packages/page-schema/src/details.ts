// What a business says about itself on its own website, read from the
// original site's HTML: the structured data it publishes for search engines
// (schema.org JSON-LD), its meta tags and icons, and links to its social
// profiles. Only what the site states is taken; nothing is guessed.

export type SiteDetails = {
  name?: string
  description?: string
  logo?: string
  /** The business type it declares, e.g. "Professional service". */
  industry?: string
  address?: string
  phone?: string
  email?: string
  openingHours?: string
  priceRange?: string
  areaServed?: string
  foundingDate?: string
  socials: Partial<Record<"Facebook" | "Instagram" | "LinkedIn" | "X" | "YouTube" | "WhatsApp" | "Pinterest", string>>
}

/** schema.org types that say nothing about the line of business. */
const GENERIC_TYPES = new Set(["Thing", "Organization", "Corporation", "WebSite", "WebPage", "LocalBusiness", "Place", "Brand", "Person", "SiteNavigationElement", "BreadcrumbList", "ImageObject"])

const SOCIAL_HOSTS: [keyof SiteDetails["socials"], RegExp][] = [
  ["Facebook", /(^|\.)facebook\.com$|(^|\.)fb\.com$/],
  ["Instagram", /(^|\.)instagram\.com$/],
  ["LinkedIn", /(^|\.)linkedin\.com$/],
  ["X", /(^|\.)(twitter|x)\.com$/],
  ["YouTube", /(^|\.)youtube\.com$|^youtu\.be$/],
  ["WhatsApp", /^wa\.me$|(^|\.)whatsapp\.com$/],
  ["Pinterest", /(^|\.)pinterest\.[a-z.]+$/],
]

const decode = (text: string) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim()

function absolute(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined
  try {
    const resolved = new URL(decode(url), base)
    return resolved.protocol === "https:" || resolved.protocol === "http:" ? resolved.href.replace(/^http:/, "https:") : undefined
  } catch {
    return undefined
  }
}

const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined)

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

function textOf(value: unknown): string | undefined {
  const one = first(value)
  if (typeof one === "string") return str(one)
  if (one && typeof one === "object") {
    const o = one as Record<string, unknown>
    return str(o.name) ?? str(o.url) ?? str(o["@id"])
  }
  return undefined
}

function addressOf(value: unknown): string | undefined {
  const one = first(value)
  if (typeof one === "string") return str(one)
  if (!one || typeof one !== "object") return undefined
  const a = one as Record<string, unknown>
  const country = textOf(a.addressCountry)
  const parts = [str(a.streetAddress), str(a.addressLocality), str(a.addressRegion), str(a.postalCode), country].filter(Boolean)
  return parts.length ? parts.join(", ") : undefined
}

function hoursOf(entity: Record<string, unknown>): string | undefined {
  const plain = entity.openingHours
  if (typeof plain === "string") return str(plain)
  if (Array.isArray(plain) && plain.every((h) => typeof h === "string")) return plain.join("; ")
  const specs = entity.openingHoursSpecification
  const list = Array.isArray(specs) ? specs : specs ? [specs] : []
  const lines = list.flatMap((spec) => {
    if (!spec || typeof spec !== "object") return []
    const s = spec as Record<string, unknown>
    const days = (Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek])
      .map((d) => (typeof d === "string" ? d.replace(/^https?:\/\/schema\.org\//, "") : ""))
      .filter(Boolean)
    const opens = str(s.opens)
    const closes = str(s.closes)
    return days.length && opens && closes ? [`${days.join(", ")} ${opens.slice(0, 5)}–${closes.slice(0, 5)}`] : []
  })
  return lines.length ? lines.join("; ") : undefined
}

const humanType = (type: string) => {
  const words = type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Every JSON-LD object on the page, flattening @graph. */
function jsonLd(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = []
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]!.trim()) as unknown
      const stack = Array.isArray(data) ? [...data] : [data]
      while (stack.length) {
        const item = stack.pop()
        if (!item || typeof item !== "object") continue
        const obj = item as Record<string, unknown>
        if (Array.isArray(obj["@graph"])) stack.push(...(obj["@graph"] as unknown[]))
        found.push(obj)
      }
    } catch {
      // A broken block on the site: skip it.
    }
  }
  return found
}

const typesOf = (entity: Record<string, unknown>) =>
  (Array.isArray(entity["@type"]) ? entity["@type"] : [entity["@type"]]).filter((t): t is string => typeof t === "string")

function meta(html: string, name: string): string | undefined {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = tag[0]
    const key = attrs.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()
    if (key === name) return str(decode(attrs.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? ""))
  }
  return undefined
}

/** The business details the original site's HTML states. */
export function parseSiteDetails(html: string, baseUrl: string): SiteDetails {
  const entities = jsonLd(html)
  // The business: the entity with an address or logo, else any organisation.
  const business =
    entities.find((e) => typesOf(e).some((t) => !["WebSite", "WebPage", "BreadcrumbList", "ImageObject", "SiteNavigationElement"].includes(t)) && (e.address || e.logo || e.telephone)) ??
    entities.find((e) => typesOf(e).some((t) => /Organization|Business|Service|Store|Agency|Corporation/.test(t)))
  const b = business ?? {}

  const specific = typesOf(b).find((t) => !GENERIC_TYPES.has(t))
  const socials: SiteDetails["socials"] = {}
  const sameAs = (Array.isArray(b.sameAs) ? b.sameAs : [b.sameAs]).filter((s): s is string => typeof s === "string")
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => decode(m[1]!))
  for (const link of [...sameAs, ...hrefs]) {
    let host: string
    try {
      host = new URL(link).hostname.replace(/^www\./, "").toLowerCase()
    } catch {
      continue
    }
    const kind = SOCIAL_HOSTS.find(([, pattern]) => pattern.test(host))?.[0]
    // Share buttons point at a sharer, not at the business's own profile.
    if (kind && !socials[kind] && !/sharer|share\?|intent\/|\/share/i.test(link)) socials[kind] = link.replace(/^http:/, "https:")
  }

  const icon = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /rel\s*=\s*["'][^"']*(apple-touch-icon|icon)[^"']*["']/i.test(tag))
    .sort((a, b) => Number(/apple-touch-icon/i.test(b)) - Number(/apple-touch-icon/i.test(a)))[0]
    ?.match(/href\s*=\s*["']([^"']+)["']/i)?.[1]

  const email = str(b.email)?.replace(/^mailto:/i, "")
  return {
    name: str(b.name) ?? meta(html, "og:site_name"),
    description: str(b.description) ?? meta(html, "description") ?? meta(html, "og:description"),
    logo: absolute(textOf(b.logo) ?? textOf(b.image), baseUrl) ?? absolute(icon, baseUrl),
    industry: specific ? humanType(specific) : undefined,
    address: addressOf(b.address) ?? addressOf(first(b.location) && (first(b.location) as Record<string, unknown>).address),
    phone: str(b.telephone),
    email,
    openingHours: hoursOf(b),
    priceRange: str(b.priceRange),
    areaServed: Array.isArray(b.areaServed) ? b.areaServed.map(textOf).filter(Boolean).join(", ") || undefined : textOf(b.areaServed),
    foundingDate: str(b.foundingDate),
    socials,
  }
}

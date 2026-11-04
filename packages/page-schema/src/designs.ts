import type { PageDoc, Section, SectionStyle, SectionType, Theme } from "./schema"
import { SECTION_TYPES } from "./schema"
import { ICON_RULE, iconFor } from "./icons"

// Design templates for revamps. A revamp keeps a site's content (text, images,
// links) and rebuilds it as typed sections in one of these designs. A template
// is a theme (colors, fonts, radius), component styling (CSS in the renderer,
// keyed by the template id stored in `theme.template`), layout defaults, a
// background rhythm for its sections, and guidance for the model.

export const TEMPLATE_IDS = ["minimal", "glass", "corporate", "editorial", "luxe", "fresh", "playful"] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

/**
 * Templates that were removed, and the one that replaces each. Stored rows may
 * still name them until `migrations:retireTemplate` moves them over.
 */
export const RETIRED_TEMPLATES = { midnight: "glass" } as const satisfies Record<string, TemplateId>

export type DesignTemplate = {
  id: TemplateId
  name: string
  /** One line for the picker. */
  description: string
  /** Who it suits, shown under the description. */
  bestFor: string
  theme: Theme
  layout: {
    hero: "centered" | "split" | "split-reverse" | "image-background"
    features: "cards" | "plain" | "list"
    animation: "none" | "fade-up" | "fade-in" | "zoom-in"
    stickyNav: boolean
  }
  /**
   * Section backgrounds. `alternate` sections take turns between the page
   * background and `muted`; `inverted` sections use the dark band style.
   */
  rhythm: {
    alternate: SectionType[]
    inverted: SectionType[]
    invertedStyle: SectionStyle
    paddingY: number
  }
  /** What the design looks like, for the model choosing layouts. */
  guidance: string
}

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean white space, crisp type and quiet borders.",
    bestFor: "SaaS, agencies, portfolios",
    theme: {
      template: "minimal",
      colors: {
        background: "#ffffff",
        foreground: "#0a0a0a",
        primary: "#0a0a0a",
        primaryForeground: "#ffffff",
        muted: "#f5f5f5",
        mutedForeground: "#525252",
        accent: "#2563eb",
        highlight: "#2563eb",
        border: "#e5e5e5",
      },
      fonts: { heading: "Inter", body: "Inter", googleFonts: ["Inter"] },
      radius: 10,
      maxWidth: 1140,
    },
    layout: { hero: "centered", features: "plain", animation: "fade-up", stickyNav: true },
    rhythm: {
      alternate: ["features", "testimonials", "faq"],
      inverted: [],
      invertedStyle: {},
      paddingY: 112,
    },
    guidance:
      "Calm and spacious. Centered hero with one strong headline; image below it if the site has a product shot. Prefer few sections with plenty of air: plain feature grids, content sections alternating image left and right, a single closing CTA.",
  },
  {
    id: "glass",
    name: "Glass",
    description: "Frosted translucent panels floating over soft color glows.",
    bestFor: "Apps, tech products, startups",
    theme: {
      template: "glass",
      colors: {
        background: "#f5f5f7",
        foreground: "#1d1d1f",
        primary: "#0071e3",
        primaryForeground: "#ffffff",
        muted: "#ebebf0",
        mutedForeground: "#6e6e73",
        accent: "#8b5cf6",
        highlight: "#0071e3",
        border: "#d9d9e0",
      },
      fonts: { heading: "Inter Tight", body: "Inter", googleFonts: ["Inter Tight", "Inter"] },
      radius: 20,
      maxWidth: 1180,
    },
    layout: { hero: "centered", features: "cards", animation: "fade-up", stickyNav: true },
    // Sections stay transparent so the glows show through the glass.
    rhythm: { alternate: [], inverted: [], invertedStyle: {}, paddingY: 112 },
    guidance:
      "Polished and airy, like a premium product launch. Large centered hero with a short, confident headline and the product image beneath it. Feature cards in 3 columns, a stats row, testimonials as cards, and a closing CTA panel. Keep copy short and precise.",
  },
  {
    id: "corporate",
    name: "Corporate",
    description: "Navy and white, structured and trustworthy.",
    bestFor: "B2B, finance, law, consulting",
    theme: {
      template: "corporate",
      colors: {
        background: "#ffffff",
        foreground: "#0f172a",
        primary: "#1d4ed8",
        primaryForeground: "#ffffff",
        muted: "#f1f5f9",
        mutedForeground: "#475569",
        accent: "#0ea5e9",
        highlight: "#1d4ed8",
        border: "#e2e8f0",
      },
      fonts: { heading: "IBM Plex Sans", body: "IBM Plex Sans", googleFonts: ["IBM Plex Sans"] },
      radius: 6,
      maxWidth: 1200,
    },
    layout: { hero: "split", features: "cards", animation: "fade-up", stickyNav: true },
    rhythm: {
      alternate: ["features", "testimonials", "faq"],
      inverted: ["stats", "cta"],
      invertedStyle: { background: "#0b2a5b", color: "#ffffff" },
      paddingY: 104,
    },
    guidance:
      "Professional and reassuring. Split hero with a clear value proposition and a photo of people or the product. Show proof early: client logos and a navy stats band. Services as feature cards, then content sections explaining the approach, testimonials, FAQ and a navy closing CTA.",
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Serif headlines, warm paper tones, magazine rhythm.",
    bestFor: "Consultancies, studios, hospitality, real estate",
    theme: {
      template: "editorial",
      colors: {
        background: "#faf7f2",
        foreground: "#1c1917",
        primary: "#1c1917",
        primaryForeground: "#faf7f2",
        muted: "#f1ebe1",
        mutedForeground: "#57534e",
        accent: "#b45309",
        highlight: "#b45309",
        border: "#e2d9cb",
      },
      fonts: { heading: "Fraunces", body: "Source Sans 3", googleFonts: ["Fraunces", "Source Sans 3"] },
      radius: 2,
      maxWidth: 1160,
    },
    layout: { hero: "split", features: "plain", animation: "fade-in", stickyNav: false },
    rhythm: {
      alternate: ["content", "testimonials"],
      inverted: ["cta", "stats"],
      invertedStyle: { background: "#1c1917", color: "#faf7f2" },
      paddingY: 120,
    },
    guidance:
      "Considered and literary. Split hero with a large photograph. Tell the story in content sections with big images that alternate sides; features as plain numbered-feeling columns; testimonials as large quotes. Dark band for stats and the closing CTA.",
  },
  {
    id: "luxe",
    name: "Luxe",
    description: "Dark and refined, gold accents and elegant serif type.",
    bestFor: "Real estate, hotels, jewellery, fashion",
    theme: {
      template: "luxe",
      colors: {
        background: "#0e0d0b",
        foreground: "#f3efe6",
        primary: "#c9a96a",
        primaryForeground: "#0e0d0b",
        muted: "#17150f",
        mutedForeground: "#a59f92",
        accent: "#c9a96a",
        highlight: "#c9a96a",
        border: "#2b2720",
      },
      fonts: { heading: "Cormorant Garamond", body: "Jost", googleFonts: ["Cormorant Garamond", "Jost"] },
      radius: 0,
      maxWidth: 1160,
    },
    layout: { hero: "image-background", features: "plain", animation: "fade-in", stickyNav: false },
    rhythm: { alternate: ["features", "testimonials"], inverted: [], invertedStyle: {}, paddingY: 128 },
    guidance:
      "Quiet luxury. A full-bleed photographic hero (layout image-background) with a short, evocative headline. Generous spacing, few words per section. Content sections with large photographs alternating sides, amenities or services as plain features, testimonials as quotes, a gallery when there are many photos, and an understated closing CTA.",
  },
  {
    id: "fresh",
    name: "Fresh",
    description: "Soft greens, rounded shapes and a calm, natural feel.",
    bestFor: "Wellness, food, healthcare, NGOs",
    theme: {
      template: "fresh",
      colors: {
        background: "#f8faf5",
        foreground: "#1d2b1f",
        primary: "#2f6b3a",
        primaryForeground: "#ffffff",
        muted: "#ebf2e5",
        mutedForeground: "#55655a",
        accent: "#e39b3a",
        highlight: "#2f6b3a",
        border: "#d6e3cd",
      },
      fonts: { heading: "Outfit", body: "Nunito Sans", googleFonts: ["Outfit", "Nunito Sans"] },
      radius: 22,
      maxWidth: 1160,
    },
    layout: { hero: "split", features: "cards", animation: "fade-up", stickyNav: true },
    rhythm: {
      alternate: ["features", "testimonials", "faq"],
      inverted: ["cta"],
      invertedStyle: { background: "#2f6b3a", color: "#ffffff" },
      paddingY: 104,
    },
    guidance:
      "Warm and approachable. Split hero with a bright, natural photograph and a friendly headline. Services or benefits as soft feature cards, content sections with images alternating sides, stats, testimonials, FAQ and a green closing CTA.",
  },
  {
    id: "playful",
    name: "Playful",
    description: "Bright colors, chunky outlines and rounded shapes.",
    bestFor: "Consumer apps, education, local businesses",
    theme: {
      template: "playful",
      colors: {
        background: "#fffbf0",
        foreground: "#16161d",
        primary: "#ff5a36",
        primaryForeground: "#ffffff",
        muted: "#fff1d6",
        mutedForeground: "#4b4b57",
        accent: "#5b5bd6",
        highlight: "#ff5a36",
        border: "#16161d",
      },
      fonts: { heading: "Bricolage Grotesque", body: "DM Sans", googleFonts: ["Bricolage Grotesque", "DM Sans"] },
      radius: 18,
      maxWidth: 1180,
    },
    layout: { hero: "split", features: "cards", animation: "zoom-in", stickyNav: true },
    rhythm: {
      alternate: ["features", "testimonials", "faq"],
      inverted: ["cta"],
      invertedStyle: { background: "#5b5bd6", color: "#ffffff" },
      paddingY: 96,
    },
    guidance:
      "Friendly and energetic. Split hero with an image, short punchy headline with a **highlighted** word. Feature cards with emoji icons, stats as big numbers, testimonials as cards, FAQ, and a colorful closing CTA.",
  },
]

/** A template by id; a retired id gives the template that replaced it. */
export function getTemplate(id: string | undefined): DesignTemplate | undefined {
  const current = id && id in RETIRED_TEMPLATES ? RETIRED_TEMPLATES[id as keyof typeof RETIRED_TEMPLATES] : id
  return DESIGN_TEMPLATES.find((t) => t.id === current)
}

/**
 * How to revamp a captured page in a template. Used by the crawler with the
 * platform's AI and handed to agents (over MCP) that revamp with their own model.
 */
export function revampRules(template: DesignTemplate): string {
  return `You redesign web pages. You receive screenshots of an existing page (desktop slices from top to bottom, then one mobile screen), its visual blocks with computed styles, and its text outline. Rebuild its content as a fresh, modern page in the "${template.name}" design template, as structured JSON for a React component registry.

The design: ${template.description} ${template.guidance}

Content:
- Keep the original's message, wording, facts, prices, names, testimonials and links. You may shorten text that is too long for its slot (a hero subheading should be one or two sentences) and fix obvious typos, but never invent claims, numbers, testimonials, logos or prices.
- Use the exact image URLs from the extracted data, and only those. Keep the logo image in the navbar and footer (leave brand empty when the logo shows the name). Pick the strongest product or brand image for the hero.
- Drop cookie banners, popups, chat widgets, duplicate blocks and empty decoration.
- Links: keep absolute URLs from the extracted data, or "#" when unknown.

Structure:
- Section types: ${SECTION_TYPES.filter((t) => t !== "html" && t !== "custom").join(", ")}. Use only these typed sections: never "html" or "custom", and no top-level "styles".
- Start with a navbar (at most 6 links and one CTA) and a hero (layout "${template.layout.hero}" unless the content clearly suits another), end with a cta and a footer.
- Regroup the original's blocks into the section that presents them best, in a logical story: hero, social proof (logos, stats), features or services, deeper content sections, testimonials, pricing, FAQ, closing CTA. Merge scattered fragments; don't keep the original's layout when a typed section reads better.
- Features: variant "${template.layout.features}" unless the content needs another; 3 columns for 3, 6 or 9 items, 2 or 4 otherwise; an icon per item when there is no image.
- ${ICON_RULE}
- Content sections: alternate imagePosition right and left down the page.
- Wrap one or two key words of the hero heading in **double asterisks** to highlight them.
- Leave style and animation empty: the template sets section backgrounds, spacing and animation.
- Theme: copy exactly ${JSON.stringify(template.theme)}
- Section ids: short unique strings like "s_hero".
`
}

/**
 * Give a revamped page its template: theme, layout defaults, section
 * backgrounds and entrance animations. Runs after the model writes the page,
 * so every revamp in a template looks the same whatever the model chose, and
 * when switching an existing typed page to another template.
 */
export function applyTemplate(doc: PageDoc, template: DesignTemplate): PageDoc {
  const r = template.rhythm
  let alternate = false
  const sections = doc.sections.map((section): Section => {
    if (section.type === "html" || section.type === "custom") return section
    const next = structuredClone(section)
    // Colors chosen for the old design would clash with the new one; keep only
    // layout choices (alignment, full bleed) and background photos.
    const old = next.style ?? {}
    const style: SectionStyle = {}
    if (old.align) style.align = old.align
    if (old.fullBleed) style.fullBleed = old.fullBleed
    if (old.backgroundImage) {
      style.backgroundImage = old.backgroundImage
      style.overlay = old.overlay ?? "rgba(0,0,0,.5)"
      style.color = "#ffffff"
    }

    const type = next.type
    if (type !== "navbar" && type !== "footer") {
      if (r.inverted.includes(type)) {
        Object.assign(style, r.invertedStyle)
        alternate = false
      } else if (r.alternate.includes(type) && !style.backgroundImage) {
        alternate = !alternate
        if (alternate) style.background = template.theme.colors.muted
      } else {
        alternate = false
      }
      if (style.paddingY === undefined && type !== "logos") style.paddingY = r.paddingY
      next.animation = type === "hero" ? "none" : template.layout.animation
    }
    if (next.type === "navbar") next.props.sticky = template.layout.stickyNav
    if (next.type === "features") {
      // Templates draw line icons in their own colors; emojis would clash.
      for (const item of next.props.items) item.icon = iconFor(item.icon)
    }
    if (next.type === "hero" && next.props.layout === "image-background" && !next.props.image) {
      // A photo hero needs a photo; without one, use the template's own layout or a centered one.
      next.props.layout = template.layout.hero === "image-background" ? "centered" : template.layout.hero
    }
    next.style = Object.keys(style).length ? style : undefined
    return next
  })
  return { ...doc, theme: structuredClone(template.theme), styles: undefined, sections }
}

import type { PageDoc, Section, SectionStyle, SectionType, Theme } from "./schema"
import { SECTION_TYPES } from "./schema"
import { ICON_RULE, iconFor } from "./icons"

// Design templates for revamps. A revamp keeps a site's content (text, images,
// links) and rebuilds it as typed sections in one of these designs. A template
// is a theme (colors, fonts, radius), component styling (CSS in the renderer,
// keyed by the template id stored in `theme.template`), layout defaults, a
// background rhythm for its sections, and guidance for the model.

export const TEMPLATE_IDS = ["minimal", "midnight", "editorial", "playful"] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

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
    id: "midnight",
    name: "Midnight",
    description: "Dark, glowing gradients and glassy cards.",
    bestFor: "Tech, AI, developer tools",
    theme: {
      template: "midnight",
      colors: {
        background: "#07080f",
        foreground: "#f4f5fb",
        primary: "#7c5cff",
        primaryForeground: "#ffffff",
        muted: "#0f1120",
        mutedForeground: "#a3a8c3",
        accent: "#22d3ee",
        highlight: "#a78bfa",
        border: "#23263d",
      },
      fonts: { heading: "Space Grotesk", body: "Inter", googleFonts: ["Space Grotesk", "Inter"] },
      radius: 14,
      maxWidth: 1200,
    },
    layout: { hero: "centered", features: "cards", animation: "fade-up", stickyNav: true },
    rhythm: {
      alternate: ["logos", "stats", "pricing"],
      inverted: [],
      invertedStyle: {},
      paddingY: 104,
    },
    guidance:
      "Bold and technical. Big centered hero with an eyebrow and a **highlighted** key phrase; product screenshot under it. Feature cards in 3 columns, a stats band, testimonials as cards and a glowing closing CTA.",
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

export function getTemplate(id: string | undefined): DesignTemplate | undefined {
  return DESIGN_TEMPLATES.find((t) => t.id === id)
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
      next.props.layout = template.layout.hero
    }
    next.style = Object.keys(style).length ? style : undefined
    return next
  })
  return { ...doc, theme: structuredClone(template.theme), styles: undefined, sections }
}

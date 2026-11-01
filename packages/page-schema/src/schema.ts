import { z } from "zod"

// The page document is the single source of truth for a landing page. The
// editor, the AI tools, the MCP server and the edge renderer all read and
// write this shape. Keep it free of min/max/regex constraints: the schema is
// also sent to the model as a structured-output schema, and simple schemas are
// followed more reliably.

export const LinkSchema = z.object({
  label: z.string(),
  href: z.string(),
})

export const ImageSchema = z.object({
  src: z.string().describe("Absolute image URL"),
  alt: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
})

export const ThemeSchema = z.object({
  colors: z.object({
    background: z.string(),
    foreground: z.string(),
    primary: z.string(),
    primaryForeground: z.string(),
    muted: z.string().describe("Subtle surface color, e.g. alternating section background"),
    mutedForeground: z.string(),
    accent: z.string(),
    border: z.string(),
  }),
  fonts: z.object({
    heading: z.string().describe("CSS font-family name, e.g. Inter"),
    body: z.string(),
    googleFonts: z
      .array(z.string())
      .describe("Google Fonts family names to load, e.g. ['Inter', 'Playfair Display']"),
  }),
  radius: z.number().describe("Corner radius in px for buttons and cards"),
  maxWidth: z.number().describe("Content container max width in px"),
})

export const SectionStyleSchema = z.object({
  background: z.string().optional().describe("CSS color or gradient"),
  backgroundImage: z.string().optional().describe("Image URL used as a cover background"),
  overlay: z.string().optional().describe("CSS color laid over the background image"),
  color: z.string().optional().describe("Text color"),
  paddingY: z.number().optional().describe("Vertical padding in px on desktop"),
  align: z.enum(["left", "center", "right"]).optional(),
  fullBleed: z.boolean().optional().describe("Ignore the theme max width"),
})

export const AnimationSchema = z.enum(["none", "fade-up", "fade-in", "zoom-in", "slide-left", "slide-right"])

// Free-form elements for sections that the typed components cannot express.
// Depth is capped at three levels instead of using recursion, so the schema
// stays usable as a structured-output schema.
const ElementTag = z.enum([
  "div",
  "section",
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "span",
  "a",
  "img",
  "button",
  "ul",
  "li",
])

const elementFields = {
  tag: ElementTag,
  text: z.string().optional(),
  href: z.string().optional(),
  src: z.string().optional(),
  alt: z.string().optional(),
  style: z
    .record(z.string(), z.string())
    .optional()
    .describe("CSS properties in camelCase, e.g. { display: 'grid', gap: '24px' }"),
  mobileStyle: z
    .record(z.string(), z.string())
    .optional()
    .describe("CSS overrides applied below 768px"),
}

const Element3 = z.object(elementFields)
const Element2 = z.object({ ...elementFields, children: z.array(Element3).optional() })
export const ElementSchema = z.object({ ...elementFields, children: z.array(Element2).optional() })

const CtaFields = {
  primaryCta: LinkSchema.optional(),
  secondaryCta: LinkSchema.optional(),
}

export const SectionPropsSchemas = {
  navbar: z.object({
    brand: z.string().optional(),
    logo: ImageSchema.optional(),
    links: z.array(LinkSchema),
    cta: LinkSchema.optional(),
    sticky: z.boolean().optional(),
  }),
  hero: z.object({
    layout: z.enum(["centered", "split", "split-reverse", "image-background"]),
    eyebrow: z.string().optional(),
    heading: z.string(),
    subheading: z.string().optional(),
    ...CtaFields,
    image: ImageSchema.optional(),
  }),
  logos: z.object({
    title: z.string().optional(),
    logos: z.array(ImageSchema),
  }),
  features: z.object({
    eyebrow: z.string().optional(),
    heading: z.string().optional(),
    subheading: z.string().optional(),
    columns: z.number().describe("2, 3 or 4"),
    variant: z.enum(["cards", "plain", "list"]),
    items: z.array(
      z.object({
        icon: z.string().optional().describe("An emoji or a short symbol"),
        image: ImageSchema.optional(),
        title: z.string(),
        body: z.string(),
      }),
    ),
  }),
  content: z.object({
    eyebrow: z.string().optional(),
    heading: z.string(),
    body: z.string(),
    bullets: z.array(z.string()).optional(),
    image: ImageSchema.optional(),
    imagePosition: z.enum(["left", "right"]),
    cta: LinkSchema.optional(),
  }),
  stats: z.object({
    heading: z.string().optional(),
    items: z.array(z.object({ value: z.string(), label: z.string() })),
  }),
  testimonials: z.object({
    heading: z.string().optional(),
    subheading: z.string().optional(),
    items: z.array(
      z.object({
        quote: z.string(),
        author: z.string(),
        role: z.string().optional(),
        avatar: ImageSchema.optional(),
      }),
    ),
  }),
  pricing: z.object({
    heading: z.string().optional(),
    subheading: z.string().optional(),
    plans: z.array(
      z.object({
        name: z.string(),
        price: z.string(),
        period: z.string().optional(),
        description: z.string().optional(),
        features: z.array(z.string()),
        cta: LinkSchema,
        highlighted: z.boolean().optional(),
      }),
    ),
  }),
  faq: z.object({
    heading: z.string().optional(),
    items: z.array(z.object({ question: z.string(), answer: z.string() })),
  }),
  gallery: z.object({
    heading: z.string().optional(),
    columns: z.number(),
    images: z.array(ImageSchema),
  }),
  cta: z.object({
    heading: z.string(),
    subheading: z.string().optional(),
    ...CtaFields,
  }),
  footer: z.object({
    brand: z.string().optional(),
    logo: ImageSchema.optional(),
    tagline: z.string().optional(),
    columns: z.array(z.object({ title: z.string(), links: z.array(LinkSchema) })),
    copyright: z.string().optional(),
  }),
  custom: z.object({
    elements: z.array(ElementSchema),
  }),
} as const

export type SectionType = keyof typeof SectionPropsSchemas
export const SECTION_TYPES = Object.keys(SectionPropsSchemas) as SectionType[]

const sectionBase = {
  id: z.string(),
  style: SectionStyleSchema.optional(),
  animation: AnimationSchema.optional(),
  hidden: z.boolean().optional(),
}

function sectionVariant<T extends SectionType>(type: T) {
  return z.object({ ...sectionBase, type: z.literal(type), props: SectionPropsSchemas[type] })
}

export const SectionSchema = z.discriminatedUnion("type", [
  sectionVariant("navbar"),
  sectionVariant("hero"),
  sectionVariant("logos"),
  sectionVariant("features"),
  sectionVariant("content"),
  sectionVariant("stats"),
  sectionVariant("testimonials"),
  sectionVariant("pricing"),
  sectionVariant("faq"),
  sectionVariant("gallery"),
  sectionVariant("cta"),
  sectionVariant("footer"),
  sectionVariant("custom"),
])

export const MetaSchema = z.object({
  title: z.string(),
  description: z.string(),
  favicon: z.string().optional(),
  ogImage: z.string().optional(),
  lang: z.string().optional(),
})

export const PageDocSchema = z.object({
  schemaVersion: z.literal(1),
  meta: MetaSchema,
  theme: ThemeSchema,
  sections: z.array(SectionSchema),
})

export type Link = z.infer<typeof LinkSchema>
export type Image = z.infer<typeof ImageSchema>
export type Theme = z.infer<typeof ThemeSchema>
export type SectionStyle = z.infer<typeof SectionStyleSchema>
export type Animation = z.infer<typeof AnimationSchema>
export type Element = z.infer<typeof ElementSchema>
export type Section = z.infer<typeof SectionSchema>
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>
export type PageMeta = z.infer<typeof MetaSchema>
export type PageDoc = z.infer<typeof PageDocSchema>

export const DEFAULT_THEME: Theme = {
  colors: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    primary: "#111827",
    primaryForeground: "#ffffff",
    muted: "#f4f4f5",
    mutedForeground: "#52525b",
    accent: "#6366f1",
    border: "#e4e4e7",
  },
  fonts: { heading: "Inter", body: "Inter", googleFonts: ["Inter"] },
  radius: 8,
  maxWidth: 1200,
}

export function emptyPageDoc(title = "Untitled page"): PageDoc {
  return {
    schemaVersion: 1,
    meta: { title, description: "" },
    theme: DEFAULT_THEME,
    sections: [],
  }
}

import { z } from "zod"

import {
  AnimationSchema,
  MetaSchema,
  PageDocSchema,
  SectionPropsSchemas,
  SectionStyleSchema,
  ThemeSchema,
  type PageDoc,
  type Section,
  type SectionType,
} from "./schema"
import { applyTemplate, DESIGN_TEMPLATES, getTemplate, TEMPLATE_IDS } from "./designs"

// Edit operations are the only way a draft changes. Every editing surface (the
// visual inspector, the AI chat, external MCP clients) produces these, and the
// Convex mutation applies them with `applyOps`, so validation and history live
// in one place.

function newSectionVariant<T extends SectionType>(type: T) {
  return z.object({
    type: z.literal(type),
    props: SectionPropsSchemas[type],
    style: SectionStyleSchema.optional(),
    animation: AnimationSchema.optional(),
  })
}

export const NewSectionSchema = z.discriminatedUnion("type", [
  newSectionVariant("navbar"),
  newSectionVariant("hero"),
  newSectionVariant("logos"),
  newSectionVariant("features"),
  newSectionVariant("content"),
  newSectionVariant("stats"),
  newSectionVariant("testimonials"),
  newSectionVariant("pricing"),
  newSectionVariant("faq"),
  newSectionVariant("gallery"),
  newSectionVariant("form"),
  newSectionVariant("cta"),
  newSectionVariant("footer"),
  newSectionVariant("custom"),
  newSectionVariant("html"),
])
export type NewSection = z.infer<typeof NewSectionSchema>

const PartialTheme = z.object({
  colors: ThemeSchema.shape.colors.partial().optional(),
  fonts: ThemeSchema.shape.fonts.partial().optional(),
  radius: z.number().optional(),
  maxWidth: z.number().optional(),
})

export const OP_DEFINITIONS = {
  set_field: {
    description:
      "Set one value inside a section by path, e.g. path 'props.heading', 'props.items.2.title', 'props.image.src' or 'style.background'. Use for precise text, link, image and style edits.",
    input: z.object({
      sectionId: z.string(),
      path: z.string().describe("Dot path relative to the section, starting with props. or style."),
      value: z.any().describe("New value: a string, number, boolean, object or array"),
    }),
  },
  update_section_props: {
    description:
      "Shallow-merge new top-level props into a section. Arrays are replaced wholesale, so pass the full array.",
    input: z.object({
      sectionId: z.string(),
      props: z.record(z.string(), z.any()),
    }),
  },
  update_section_style: {
    description: "Merge style overrides (background, text color, padding, alignment) into a section.",
    input: z.object({ sectionId: z.string(), style: SectionStyleSchema }),
  },
  set_section_animation: {
    description: "Set the entrance animation of a section.",
    input: z.object({ sectionId: z.string(), animation: AnimationSchema }),
  },
  set_section_visibility: {
    description: "Hide or show a section without deleting it.",
    input: z.object({ sectionId: z.string(), hidden: z.boolean() }),
  },
  add_section: {
    description: "Insert a new section. Omit index to append at the end (before the footer if there is one).",
    input: z.object({ section: NewSectionSchema, index: z.number().optional() }),
  },
  replace_section: {
    description:
      "Replace a section entirely, keeping its id and position. Use when changing a section's type or layout.",
    input: z.object({ sectionId: z.string(), section: NewSectionSchema }),
  },
  remove_section: {
    description: "Delete a section.",
    input: z.object({ sectionId: z.string() }),
  },
  move_section: {
    description: "Move a section to a new zero-based index.",
    input: z.object({ sectionId: z.string(), toIndex: z.number() }),
  },
  duplicate_section: {
    description: "Duplicate a section and insert the copy right after it.",
    input: z.object({ sectionId: z.string() }),
  },
  update_theme: {
    description:
      "Change global design tokens: colors, fonts (also list new fonts in googleFonts), corner radius or max width.",
    input: PartialTheme,
  },
  apply_template: {
    description: `Restyle the page in a design template: replaces the theme (colors, fonts, radius) and section backgrounds, spacing and animations, and keeps all content. Only typed sections change; html sections of exact clones keep their original look. Templates: ${DESIGN_TEMPLATES.map((t) => `${t.id} (${t.description})`).join("; ")}`,
    input: z.object({ template: z.enum(TEMPLATE_IDS) }),
  },
  update_meta: {
    description: "Change SEO metadata: title, description, favicon, social image, language.",
    input: MetaSchema.partial(),
  },
  edit_html: {
    description:
      "Edit the markup of an html section (an exact copy of the original page) by replacing an exact snippet of its props.html. Copy `find` verbatim from get_section; it must match exactly once unless replaceAll is true. Keep the existing classes so the page CSS still styles it.",
    input: z.object({
      sectionId: z.string(),
      find: z.string(),
      replace: z.string(),
      replaceAll: z.boolean().optional(),
    }),
  },
  edit_page_css: {
    description:
      "Edit the page stylesheet of an exact clone (styles.css). With `find`, replace that exact snippet (it must match once); without it, append `replace` as new rules. Use for colors, fonts, spacing, hover effects and animations of html sections.",
    input: z.object({ find: z.string().optional(), replace: z.string() }),
  },
  edit_page_js: {
    description:
      "Edit the page's custom JavaScript (sliders, tabs, menus, counters, form behavior, tracking). Markup <script> tags and inline on* handlers are stripped, so all behavior goes here: plain browser JS that runs once at the end of <body>, after the page markup exists; select elements with querySelector and attach listeners with addEventListener. With `find`, replace that exact snippet (it must match once; an empty `replace` removes it); without it, append `replace`. The script runs only on the published site, not in the editor preview, so tell the user to publish to see it.",
    input: z.object({ find: z.string().optional(), replace: z.string() }),
  },
} as const

export type OpName = keyof typeof OP_DEFINITIONS
export const OP_NAMES = Object.keys(OP_DEFINITIONS) as OpName[]

export type Op = {
  [K in OpName]: { op: K } & z.infer<(typeof OP_DEFINITIONS)[K]["input"]>
}[OpName]

export const OpSchema = z.discriminatedUnion(
  "op",
  OP_NAMES.map((name) => OP_DEFINITIONS[name].input.extend({ op: z.literal(name) })) as unknown as [
    z.ZodObject<{ op: z.ZodLiteral<OpName> }>,
    ...z.ZodObject<{ op: z.ZodLiteral<OpName> }>[],
  ],
)

export class OpError extends Error {}

export function newSectionId(): string {
  return "s_" + Math.random().toString(36).slice(2, 10)
}

function findIndex(doc: PageDoc, sectionId: string): number {
  const index = doc.sections.findIndex((s) => s.id === sectionId)
  if (index === -1) {
    throw new OpError(`No section with id "${sectionId}"`)
  }
  return index
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".").filter(Boolean)
  if (keys.length < 2 || (keys[0] !== "props" && keys[0] !== "style")) {
    throw new OpError(`Path must start with "props." or "style.", got "${path}"`)
  }
  let node: Record<string, unknown> = target
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const nextIsIndex = /^\d+$/.test(keys[i + 1])
    if (node[key] === undefined || node[key] === null) {
      node[key] = nextIsIndex ? [] : {}
    }
    if (typeof node[key] !== "object") {
      throw new OpError(`Cannot descend into "${keys.slice(0, i + 1).join(".")}"`)
    }
    node = node[key] as Record<string, unknown>
  }
  const last = keys[keys.length - 1]
  if (value === null) {
    if (Array.isArray(node)) node.splice(Number(last), 1)
    else delete node[last]
  } else {
    node[last] = value
  }
}

function materialize(section: NewSection, id = newSectionId()): Section {
  return { id, ...section } as Section
}

function applyOne(doc: PageDoc, op: Op): string {
  switch (op.op) {
    case "set_field": {
      const section = doc.sections[findIndex(doc, op.sectionId)] as unknown as Record<string, unknown>
      setPath(section, op.path, op.value)
      return `Set ${op.path} on ${op.sectionId}`
    }
    case "update_section_props": {
      const section = doc.sections[findIndex(doc, op.sectionId)]
      section.props = { ...section.props, ...op.props } as never
      return `Updated props on ${op.sectionId}`
    }
    case "update_section_style": {
      const section = doc.sections[findIndex(doc, op.sectionId)]
      section.style = { ...section.style, ...op.style }
      return `Updated style on ${op.sectionId}`
    }
    case "set_section_animation": {
      doc.sections[findIndex(doc, op.sectionId)].animation = op.animation
      return `Animation on ${op.sectionId} set to ${op.animation}`
    }
    case "set_section_visibility": {
      doc.sections[findIndex(doc, op.sectionId)].hidden = op.hidden
      return `${op.hidden ? "Hid" : "Showed"} ${op.sectionId}`
    }
    case "add_section": {
      const section = materialize(op.section)
      let index = op.index ?? doc.sections.length
      if (op.index === undefined && doc.sections.at(-1)?.type === "footer") {
        index = doc.sections.length - 1
      }
      doc.sections.splice(Math.max(0, Math.min(index, doc.sections.length)), 0, section)
      return `Added ${section.type} section ${section.id}`
    }
    case "replace_section": {
      const index = findIndex(doc, op.sectionId)
      doc.sections[index] = materialize(op.section, op.sectionId)
      return `Replaced ${op.sectionId} with a ${op.section.type} section`
    }
    case "remove_section": {
      doc.sections.splice(findIndex(doc, op.sectionId), 1)
      return `Removed ${op.sectionId}`
    }
    case "move_section": {
      const [section] = doc.sections.splice(findIndex(doc, op.sectionId), 1)
      const to = Math.max(0, Math.min(op.toIndex, doc.sections.length))
      doc.sections.splice(to, 0, section)
      return `Moved ${op.sectionId} to index ${to}`
    }
    case "duplicate_section": {
      const index = findIndex(doc, op.sectionId)
      const copy = { ...structuredClone(doc.sections[index]), id: newSectionId() }
      doc.sections.splice(index + 1, 0, copy)
      return `Duplicated ${op.sectionId} as ${copy.id}`
    }
    case "update_theme": {
      doc.theme = {
        ...doc.theme,
        ...op,
        colors: { ...doc.theme.colors, ...op.colors },
        fonts: { ...doc.theme.fonts, ...op.fonts },
      }
      delete (doc.theme as Record<string, unknown>).op
      return "Updated theme"
    }
    case "apply_template": {
      const template = getTemplate(op.template)
      if (!template) throw new OpError(`No template "${op.template}"`)
      const styled = applyTemplate(doc, template)
      doc.theme = styled.theme
      doc.sections = styled.sections
      return `Applied the ${template.name} template`
    }
    case "update_meta": {
      const { op: _op, ...meta } = op
      doc.meta = { ...doc.meta, ...meta }
      return "Updated page metadata"
    }
    case "edit_html": {
      const section = doc.sections[findIndex(doc, op.sectionId)]
      if (section.type !== "html") throw new OpError(`Section "${op.sectionId}" is a ${section.type} section, not html`)
      section.props.html = replaceSnippet(section.props.html, op.find, op.replace, op.replaceAll, `section ${op.sectionId}`)
      return `Edited the markup of ${op.sectionId}`
    }
    case "edit_page_css": {
      const css = doc.styles?.css ?? ""
      const next = op.find ? replaceSnippet(css, op.find, op.replace, false, "the page CSS") : `${css}
${op.replace}`
      doc.styles = { ...doc.styles, css: next }
      return op.find ? "Edited the page CSS" : "Added rules to the page CSS"
    }
    case "edit_page_js": {
      const js = doc.script ?? ""
      const next = op.find ? replaceSnippet(js, op.find, op.replace, false, "the page JavaScript") : js ? `${js}\n${op.replace}` : op.replace
      if (next.trim()) doc.script = next
      else delete doc.script
      return op.find
        ? "Edited the page JavaScript (it runs on the published site after publishing)"
        : "Added to the page JavaScript (it runs on the published site after publishing)"
    }
  }
}

function replaceSnippet(text: string, find: string, replace: string, all: boolean | undefined, where: string): string {
  if (!find) throw new OpError("`find` can't be empty")
  const count = text.split(find).length - 1
  if (count === 0) throw new OpError(`The snippet to replace was not found in ${where}; copy it exactly from the current content`)
  if (count > 1 && !all) {
    throw new OpError(`The snippet appears ${count} times in ${where}; include more surrounding text or set replaceAll`)
  }
  return all ? text.split(find).join(replace) : text.replace(find, () => replace)
}

/**
 * Apply edit operations to a copy of `doc`. Throws `OpError` if an operation
 * targets a missing section or leaves the document invalid; the input is
 * never mutated, so a failed batch changes nothing.
 */
export function applyOps(doc: PageDoc, ops: Op[]): { doc: PageDoc; results: string[] } {
  const next = structuredClone(doc)
  const results = ops.map((op) => applyOne(next, op))
  const parsed = PageDocSchema.safeParse(next)
  if (!parsed.success) {
    throw new OpError(`Edit would make the page invalid: ${z.prettifyError(parsed.error)}`)
  }
  return { doc: parsed.data, results }
}

/** A compact outline of the page for prompts and tool results. */
export function outline(doc: PageDoc): string {
  return doc.sections
    .map((s, i) => {
      const props = s.props as Record<string, unknown>
      const label = props.heading ?? props.brand ?? props.title ?? props.label ?? ""
      return `${i}. [${s.id}] ${s.type}${s.hidden ? " (hidden)" : ""}${label ? ` — ${String(label).slice(0, 60)}` : ""}`
    })
    .join("\n")
}

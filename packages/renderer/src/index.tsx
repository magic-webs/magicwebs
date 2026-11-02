import type { ReactNode } from "react"

import { sanitizeCss, type PageDoc, type Section } from "@magicwebs/page-schema"

import { EXACT_CSS, pageCss } from "./css"
import { cleanHtml, SECTION_COMPONENTS } from "./sections"

export { ANIMATION_SCRIPT, EXACT_CSS, fontHref, pageCss } from "./css"
export { exactRuntime, EXACT_RUNTIME_SCRIPT, syncMediaClasses } from "./runtime"
export { SECTION_COMPONENTS, safeHref, safeSrc } from "./sections"

/** True for pages that carry original markup (exact clones). */
export function isExact(doc: PageDoc): boolean {
  return !!doc.styles || doc.sections.some((s) => s.type === "html")
}

/** Every stylesheet a page needs: theme rules, then the original CSS of exact clones. */
export function documentCss(doc: PageDoc): string {
  if (!isExact(doc)) return `html,body{margin:0}${pageCss(doc.theme)}`
  return pageCss(doc.theme) + sanitizeCss(doc.styles?.css ?? "") + EXACT_CSS
}

/** The data-* attributes an exact clone expects on <html> or <body>. */
export function rootAttributes(doc: PageDoc, element: "html" | "body"): Record<string, string> {
  const attributes = element === "html" ? doc.styles?.htmlAttributes : doc.styles?.bodyAttributes
  return Object.fromEntries(
    Object.entries(attributes ?? {}).filter(([name]) => /^data-[a-z0-9-]+$/.test(name) && (!name.startsWith("data-mw") || name === "data-mw-scroll")),
  )
}

export function SectionView({ section }: { section: Section }): ReactNode {
  const Component = SECTION_COMPONENTS[section.type] as ((props: { section: Section }) => ReactNode) | undefined
  // A page saved by newer code than this renderer: skip what it can't draw
  // rather than failing the whole page.
  return Component ? <Component section={section} /> : null
}

/**
 * Renders a page document. Stylesheets are not included here: the editor
 * injects `pageCss` into its preview frame and the edge worker writes it into
 * the document head.
 */
export function PageRenderer({ doc }: { doc: PageDoc }) {
  return (
    <div className={doc.styles ? "mw-root mw-exact" : "mw-root"}>
      {doc.styles?.defs && (
        <div
          aria-hidden="true"
          style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
          dangerouslySetInnerHTML={{ __html: cleanHtml(doc.styles.defs) }}
        />
      )}
      {doc.sections
        .filter((s) => !s.hidden)
        .map((section) => (
          <SectionView key={section.id} section={section} />
        ))}
    </div>
  )
}

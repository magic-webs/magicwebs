import type { ReactNode } from "react"

import type { PageDoc, Section } from "@magicwebs/page-schema"

import { SECTION_COMPONENTS } from "./sections"

export { ANIMATION_SCRIPT, fontHref, pageCss } from "./css"
export { SECTION_COMPONENTS, safeHref, safeSrc } from "./sections"

export function SectionView({ section }: { section: Section }): ReactNode {
  const Component = SECTION_COMPONENTS[section.type] as (props: { section: Section }) => ReactNode
  return <Component section={section} />
}

/**
 * Renders a page document. Stylesheets are not included here: the editor
 * injects `pageCss` into its preview frame and the edge worker writes it into
 * the document head.
 */
export function PageRenderer({ doc }: { doc: PageDoc }) {
  return (
    <div className="mw-root">
      {doc.sections
        .filter((s) => !s.hidden)
        .map((section) => (
          <SectionView key={section.id} section={section} />
        ))}
    </div>
  )
}

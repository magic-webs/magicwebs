import { createElement } from "react"

import { ICON_NODES } from "./icons.generated"

/** A line icon by name (see ICON_NAMES), 1em square in the current text color; null for unknown names. */
export function Icon({ name }: { name: string }) {
  const node = ICON_NODES[name]
  if (!node) return null
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {node.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}

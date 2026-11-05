import { useId } from "react"

/**
 * The Magicwebs mark: a browser window with a sparkle on its corner.
 *
 * Drawn in `currentColor`, with the greys as opacities of it and the window's
 * interior cut out, so it sits on any background and follows light and dark
 * mode from the surrounding text colour. The static copies live in
 * `public/logo*.svg` and `app/icon.svg`; keep the paths in sync.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  const mask = useId()
  return (
    <svg
      viewBox="0 0 64 64"
      fill="currentColor"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <mask id={mask}>
        <rect width="64" height="64" fill="#fff" />
        <rect x="9" y="22" width="36" height="29" rx="4" fill="#000" />
        <circle cx="11" cy="18" r="1.7" fill="#000" />
        <circle cx="16" cy="18" r="1.7" fill="#000" />
        <circle cx="21" cy="18" r="1.7" fill="#000" />
        <path d={SPARKLE} fill="#000" stroke="#000" strokeWidth="6" strokeLinejoin="round" />
      </mask>
      <rect x="4" y="13" width="46" height="43" rx="9" mask={`url(#${mask})`} />
      <rect x="13" y="26" width="28" height="8" rx="2" opacity="0.32" />
      <rect x="13" y="37.5" width="22" height="3.5" rx="1.75" opacity="0.6" />
      <rect x="13" y="44" width="16" height="3.5" rx="1.75" opacity="0.6" />
      <path d={SPARKLE} opacity="0.6" />
    </svg>
  )
}

const SPARKLE =
  "M50 2.5C51.4 9.6 54.4 12.6 61.5 14C54.4 15.4 51.4 18.4 50 25.5C48.6 18.4 45.6 15.4 38.5 14C45.6 12.6 48.6 9.6 50 2.5Z"

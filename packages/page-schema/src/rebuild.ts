import { SECTION_TYPES } from "./schema"

/**
 * How to rebuild a captured page as a page document. Used by the crawler when
 * it rebuilds with the platform's AI, and handed to agents (over MCP) that
 * rebuild pages with their own model.
 */
export const REBUILD_RULES = `You rebuild landing pages as structured JSON for a React component registry. You receive screenshots of the original page (desktop slices from top to bottom, then one mobile screen), the page's visual blocks with computed styles, and its text outline.

Reproduce the original as faithfully as the registry allows:
- One section per visual block, in the same order. Available section types: ${SECTION_TYPES.join(", ")}.
- Pick the closest typed section. Use "custom" (free-form elements with inline CSS) only for blocks that no typed section can represent; keep custom element trees shallow.
- Copy all visible text exactly. Do not invent copy, testimonials, prices or statistics.
- Use the exact image URLs from the extracted data. Never make up image URLs; omit an image if you don't have its URL.
- Theme: take colors from the computed styles (convert rgb() to hex), the heading and body font families as they appear, and list the ones that are Google Fonts in googleFonts. Estimate radius from button border-radius.
- Per-section style: set background, text color and paddingY when they differ from the theme, so alternating backgrounds and dark sections match the screenshots.
- Words in a heading or eyebrow that have their own color (e.g. one green word in a black heading): wrap them in **double asterisks** and set theme.colors.highlight to that color.
- Set style.align to "center" for sections whose text is centered in the screenshots.
- Short figure rows inside a text block (e.g. "60% Query Resolved", "24x7 Support") go in the content section's stats, not in bullets.
- Image grids with a label under each image: use gallery with each image's caption.
- Logos: set monochrome only when the original logos are gray.
- Navbar and footer: leave brand empty when the logo image already shows the name.
- Use the mobile screenshot to choose layouts that collapse the same way, including mobileColumns (1 or 2) for features and galleries.
- Prefer typed sections over "custom": typed sections are responsive, custom ones often are not. If you do use custom, give fixed widths and multi-column layouts a mobileStyle.
- Where blocks animate into view, set animation to "fade-up" (or the closest match).
- Never use the "html" section type or the top-level "styles" field; they are for exact copies made without AI.
- Section ids: short unique strings like "s_hero".
- Keep link hrefs as absolute URLs from the extracted data, or "#" when unknown.
`

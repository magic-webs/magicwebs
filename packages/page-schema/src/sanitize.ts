import { Parser } from "htmlparser2"

// Exact clones carry the original site's markup and CSS. That content is
// untrusted (crawled pages, AI edits, MCP clients) and is rendered into the
// editor's same-origin preview frame and onto published sites, so it goes
// through this allowlist sanitizer every time it is rendered. Nothing that can
// run script survives: no <script>, no event handler attributes, no
// javascript: URLs, no raw-text containers that could smuggle markup.

/** Elements dropped together with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  "script",
  "noscript",
  "template",
  "title",
  "xmp",
  "plaintext",
  "noembed",
  "noframes",
  "object",
  "embed",
  "applet",
  "frame",
  "frameset",
  "portal",
  "foreignobject",
  "set",
  "handler",
  "listener",
])

/** Elements dropped while keeping their children. */
const UNWRAP = new Set(["html", "head", "body", "base", "link", "meta", "param", "basefont"])

const VOID = new Set(["area", "br", "col", "hr", "img", "input", "source", "track", "wbr"])

const URL_ATTRS = new Set(["href", "src", "action", "formaction", "poster", "xlink:href", "background", "cite", "longdesc"])

/** Attributes that may hold an image (or other media) data URL. */
const MEDIA_ATTRS = new Set(["src", "poster", "xlink:href", "href"])

const DROP_ATTRS = new Set(["srcdoc", "ping", "nonce", "integrity", "codebase", "dynsrc", "lowsrc"])

/** Hosts whose embeds are allowed in iframes (video, maps, audio, booking). */
const IFRAME_HOSTS = [
  /^(www\.)?youtube(-nocookie)?\.com$/,
  /^player\.vimeo\.com$/,
  /^(www\.)?google\.com$/,
  /^maps\.google\.com$/,
  /^open\.spotify\.com$/,
  /^w\.soundcloud\.com$/,
  /^(www\.)?loom\.com$/,
  /^calendly\.com$/,
  /^fast\.wistia\.(net|com)$/,
]

const ATTR_NAME = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/
const TAG_NAME = /^[a-zA-Z][a-zA-Z0-9-]*$/

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Collapse what browsers ignore when they read a URL scheme. */
function schemeOf(url: string): string {
  // eslint-disable-next-line no-control-regex
  const compact = url.replace(/[\u0000- \u007f-\u009f]+/g, "").toLowerCase()
  const match = compact.match(/^([a-z][a-z0-9+.-]*):/)
  return match ? match[1] : ""
}

function safeUrl(url: string, media: boolean): string | null {
  const scheme = schemeOf(url)
  if (!scheme) return url
  if (scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel" || scheme === "sms") return url
  if (media && scheme === "data" && /^\s*data:(image\/(png|jpe?g|gif|webp|avif|svg\+xml)|video\/(mp4|webm))[;,]/i.test(url)) {
    return url
  }
  return null
}

function safeSrcset(value: string): string | null {
  const parts = value.split(/,\s+/)
  const kept = parts.map((p) => p.trim()).filter((p) => p && safeUrl(p.split(/\s+/)[0], true) !== null)
  return kept.length ? kept.join(", ") : null
}

function iframeAllowed(src: string): boolean {
  try {
    const url = new URL(src)
    return url.protocol === "https:" && IFRAME_HOSTS.some((host) => host.test(url.hostname))
  } catch {
    return false
  }
}

/**
 * Make CSS safe to place inside a <style> element or a style attribute:
 * nothing can close the element, and the legacy script-running CSS features
 * are removed.
 */
export function sanitizeCss(css: string): string {
  return css
    .replace(/<\/?(style|script)/gi, "")
    .replace(/</g, "\\3c ")
    .replace(/@import\b[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "(")
    .replace(/-moz-binding\s*:/gi, "-x-binding:")
    .replace(/behavior\s*:/gi, "-x-behavior:")
    .replace(/url\(\s*(['"]?)\s*(javascript|vbscript):[^)]*\)/gi, "url()")
}

/**
 * Sanitize an HTML fragment. Unknown or custom elements are kept (they are
 * inert without script); scripts, handlers and dangerous URLs are not.
 */
export function sanitizeHtml(html: string): string {
  const out: string[] = []
  // Depth inside a dropped element, and the tag names open on our side.
  let dropping = 0
  const stack: { name: string; emitted: boolean }[] = []
  let svgDepth = 0
  let inSvgStyle = false

  const parser = new Parser(
    {
      onopentag(rawName, attribs) {
        const name = rawName.toLowerCase()
        if (dropping > 0) {
          dropping++
          stack.push({ name, emitted: false })
          return
        }
        if (DROP_WITH_CONTENT.has(name) || !TAG_NAME.test(rawName) || (name === "style" && svgDepth === 0)) {
          dropping = 1
          stack.push({ name, emitted: false })
          return
        }
        if (/^animate/.test(name) && /href/i.test(attribs.attributeName ?? attribs.attributename ?? "")) {
          dropping = 1
          stack.push({ name, emitted: false })
          return
        }
        if (name === "iframe" && !iframeAllowed(attribs.src ?? "")) {
          dropping = 1
          stack.push({ name, emitted: false })
          return
        }
        if (UNWRAP.has(name)) {
          stack.push({ name, emitted: false })
          return
        }
        if (name === "svg") svgDepth++
        if (name === "style") inSvgStyle = true

        let tag = `<${rawName}`
        for (const [rawAttr, rawValue] of Object.entries(attribs)) {
          const attr = rawAttr.toLowerCase()
          if (!ATTR_NAME.test(rawAttr) || attr.startsWith("on") || DROP_ATTRS.has(attr)) continue
          if (name === "iframe" && (attr === "sandbox" || attr === "loading")) continue
          let value: string | null = rawValue
          if (attr === "style") value = sanitizeCss(rawValue)
          else if (attr === "srcset" || attr === "imagesrcset") value = safeSrcset(rawValue)
          else if (URL_ATTRS.has(attr)) {
            if (name === "use" || (svgDepth > 0 && name !== "a" && name !== "image" && attr.endsWith("href"))) {
              // SVG references must stay inside the page.
              value = rawValue.trim().startsWith("#") ? rawValue : null
            } else {
              value = safeUrl(rawValue, MEDIA_ATTRS.has(attr) && name !== "a" && name !== "area")
            }
          } else if (/^(values|to|from|by)$/.test(attr) && schemeOf(rawValue) === "javascript") {
            value = null
          }
          if (value === null) continue
          tag += value === "" ? ` ${rawAttr}` : ` ${rawAttr}="${escapeAttr(value)}"`
        }
        if (name === "iframe") tag += ` sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" loading="lazy"`
        out.push(tag + ">")
        stack.push({ name, emitted: true })
      },
      ontext(text) {
        if (dropping > 0) return
        const open = stack.at(-1)?.name
        if (inSvgStyle) out.push(sanitizeCss(text).replace(/[<&]/g, ""))
        else if (open !== "iframe") out.push(escapeText(text))
      },
      onclosetag(rawName) {
        const entry = stack.pop()
        if (!entry) return
        if (dropping > 0) {
          dropping--
          return
        }
        if (entry.name === "svg") svgDepth = Math.max(0, svgDepth - 1)
        if (entry.name === "style") inSvgStyle = false
        if (entry.emitted && !VOID.has(entry.name)) out.push(`</${rawName}>`)
      },
    },
    { decodeEntities: true, lowerCaseTags: false, lowerCaseAttributeNames: false, recognizeSelfClosing: true },
  )
  parser.write(html)
  parser.end()
  return out.join("")
}

import { DEFAULT_THEME, PageDocSchema, newSectionId, type PageDoc, type Theme } from "@magicwebs/page-schema"

import { extractInPage, getBrowser, USER_AGENT } from "./capture"
import { extractFromHtml } from "./extract"
import { isPublicUrl } from "./safety"

// Exact cloning: instead of asking a model to rebuild the page from
// screenshots, copy the page itself. Each visual block becomes an html section
// holding its real markup, the stylesheet is the original CSS pruned to what
// the markup uses (hover rules, keyframes, media queries and fonts included),
// and what the site's JavaScript did is recorded as data for the renderer's
// runtime to replay: scroll reveals, counters, AOS / WOW animations, menus,
// accordions, tabs, header changes on scroll and carousels.

/**
 * Long strings are stored outside the draft document (see the backend's
 * lib.ts), so the limit is what the editor can comfortably load and the job
 * mutation can receive, not Convex's 1 MiB per document.
 */
const MAX_DOC_BYTES = 4_000_000
/** Inline SVGs above this size become images when a page is over budget. */
const SVG_INLINE_LIMIT = 6_000

export class PageTooLargeError extends Error {}

type InPageSection = { label: string; html: string }

type InPageResult = {
  sections: InPageSection[]
  css: string
  defs: string
  htmlClass: string
  bodyClass: string
  htmlAttributes: Record<string, string>
  bodyAttributes: Record<string, string>
  stats: Record<string, number>
}

export type ExactProgress = (step: string) => Promise<unknown>

export async function cloneExact(
  url: string,
  progress: ExactProgress,
  maxBytes = MAX_DOC_BYTES,
): Promise<{ doc: PageDoc; stats: Record<string, number> }> {
  if (!(await isPublicUrl(url))) throw new Error("That URL points to a private or unreachable address")

  const b = await getBrowser()
  const context = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, userAgent: USER_AGENT })
  try {
    const page = await context.newPage()
    let locked = false
    // Stylesheets as served, for the cross-origin ones whose rules the page can't read.
    const sheets: Record<string, string> = {}
    const reads: Promise<unknown>[] = []
    page.on("response", (response) => {
      if (response.request().resourceType() !== "stylesheet" || !response.ok()) return
      reads.push(
        response
          .text()
          .then((text) => (sheets[response.url()] = text))
          .catch(() => {}),
      )
    })
    await page.route("**/*", async (route) => {
      const request = route.request()
      // While interactions are recorded, clicks must not leave the page.
      if (locked && request.isNavigationRequest() && request.frame() === page.mainFrame()) return route.abort("aborted")
      if (await isPublicUrl(request.url())) await route.continue()
      else await route.abort("blockedbyclient")
    })
    context.on("page", (popup) => {
      if (locked) void popup.close()
    })
    await page.addInitScript(observeInit)
    // Lets the in-page recorder resize the window to capture responsive markup.
    await page.exposeFunction("__mwResize", (width: number) => page.setViewportSize({ width, height: width < 768 ? 844 : 900 }))

    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })
    if (!response || response.status() >= 400) {
      throw new Error(`The page responded with HTTP ${response?.status() ?? "no response"}`)
    }
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(800)

    await progress("Recording scroll animations")
    await page.evaluate(scrollAndScan)
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {})

    const facts = extractFromHtml(await page.content(), page.url())
    const { globals, blocks } = await page.evaluate(extractInPage)
    const finalUrl = page.url()

    await progress("Recording menus, tabs and accordions")
    await Promise.all(reads)
    locked = true
    const prepared = await page.evaluate(prepareInPage, { sheets, maxTriggers: 36, budgetMs: 70_000 })

    await progress("Copying markup and styles")
    let result = await page.evaluate(serializeInPage, { svgInlineLimit: 0 })
    let doc = buildDoc(result, facts, globals, blocks, finalUrl)
    if (docBytes(doc) > maxBytes) {
      result = await page.evaluate(serializeInPage, { svgInlineLimit: SVG_INLINE_LIMIT })
      doc = buildDoc(result, facts, globals, blocks, finalUrl)
    }
    const bytes = docBytes(doc)
    if (bytes > maxBytes) {
      const kb = (n: number) => `${Math.round(n / 1024)} KB`
      throw new PageTooLargeError(
        `Exact copy is ${kb(bytes)} (markup ${kb(result.stats.htmlBytes)}, CSS ${kb(result.css.length)}), over the ${kb(maxBytes)} limit`,
      )
    }
    return { doc, stats: { ...prepared, ...result.stats, bytes } }
  } finally {
    await context.close()
  }
}

export function docBytes(doc: PageDoc): number {
  return new TextEncoder().encode(JSON.stringify(doc)).byteLength
}

function buildDoc(
  result: InPageResult,
  facts: ReturnType<typeof extractFromHtml>,
  globals: unknown,
  blocks: unknown[],
  finalUrl: string,
): PageDoc {
  const doc: PageDoc = {
    schemaVersion: 1,
    meta: {
      title: facts.meta.title || new URL(finalUrl).hostname,
      description: facts.meta.description ?? "",
      favicon: facts.meta.favicon,
      ogImage: facts.meta.ogImage,
      lang: facts.meta.lang,
    },
    theme: deriveTheme(globals as Globals, blocks as Block[]),
    styles: {
      css: result.css,
      htmlClass: result.htmlClass || undefined,
      htmlAttributes: Object.keys(result.htmlAttributes).length ? result.htmlAttributes : undefined,
      bodyClass: result.bodyClass || undefined,
      bodyAttributes: Object.keys(result.bodyAttributes).length ? result.bodyAttributes : undefined,
      defs: result.defs || undefined,
    },
    sections: result.sections.map((s) => ({ id: newSectionId(), type: "html" as const, props: { label: s.label, html: s.html } })),
  }
  return PageDocSchema.parse(JSON.parse(JSON.stringify(doc)))
}

// Theme ----------------------------------------------------------------------
// Exact sections are styled by the original CSS; the theme only styles typed
// sections added later, so take it from the page's dominant colors and fonts.

type Globals = {
  bodyBackground: string
  bodyColor: string
  fontUsage: Record<string, number>
  colorUsage: Record<string, number>
}
type Block = { links?: { button?: { radius?: string } }[] }

function toHex(color: string | undefined): string | undefined {
  const m = color?.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/)
  if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return undefined
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function top(usage: Record<string, number>, prefix: string): string | undefined {
  return Object.entries(usage)
    .filter(([key]) => key.startsWith(prefix))
    .sort((a, b) => b[1] - a[1])[0]?.[0]
    .slice(prefix.length)
}

export function deriveTheme(globals: Globals | undefined, blocks: Block[] | undefined): Theme {
  if (!globals) return DEFAULT_THEME
  const background = toHex(globals.bodyBackground) ?? "#ffffff"
  const foreground = toHex(globals.bodyColor) ?? DEFAULT_THEME.colors.foreground
  const primary = toHex(top(globals.colorUsage, "button:")) ?? foreground
  const dark = luminance(background) < 0.5
  const radius = blocks
    ?.flatMap((b) => b.links ?? [])
    .map((l) => parseFloat(l.button?.radius ?? ""))
    .find((r) => Number.isFinite(r))
  const heading = top(globals.fontUsage, "heading:") || DEFAULT_THEME.fonts.heading
  const body = top(globals.fontUsage, "body:") || heading
  return {
    colors: {
      background,
      foreground,
      primary,
      primaryForeground: luminance(primary) > 0.6 ? "#0a0a0a" : "#ffffff",
      muted: dark ? "#1f1f23" : "#f4f4f5",
      mutedForeground: dark ? "#a1a1aa" : "#52525b",
      accent: primary,
      border: dark ? "#2e2e33" : "#e4e4e7",
    },
    // The fonts are already loaded by the page CSS's @font-face rules.
    fonts: { heading, body, googleFonts: [] },
    radius: Math.min(radius ?? 8, 999),
    maxWidth: 1200,
  }
}

// In-page code ---------------------------------------------------------------
// Everything below runs inside the crawled page through page.evaluate or
// addInitScript, so each function must be self-contained.

/**
 * Init script: from the first moment of the page, remember the most hidden
 * state each element is seen in (opacity, visibility, transform) and the
 * first text of short numeric leaves. Comparing that with the final state
 * shows which elements the site animates in and which numbers count up.
 */
function observeInit() {
  if (window.top !== window) return
  type Rec = { o: number; t: string; score: number }
  const rec = new WeakMap<Element, Rec>()
  const texts = new WeakMap<Element, string>()
  const scan = () => {
    if (!document.body) return
    const all = document.body.getElementsByTagName("*")
    const n = Math.min(all.length, 8000)
    for (let i = 0; i < n; i++) {
      const el = all[i]
      const s = getComputedStyle(el)
      // Visibility is inherited: only the element that hides itself counts.
      const hidden = s.visibility === "hidden" && (!el.parentElement || getComputedStyle(el.parentElement).visibility !== "hidden")
      const o = hidden ? 0 : parseFloat(s.opacity)
      const score = 1 - o + (s.transform !== "none" ? 0.25 : 0)
      const prev = rec.get(el)
      if (!prev) rec.set(el, { o, t: s.transform, score })
      else if (score > prev.score + 0.01) {
        prev.o = o
        prev.t = s.transform
        prev.score = score
      }
      if (el.childElementCount === 0 && !texts.has(el)) {
        const text = (el.textContent ?? "").trim()
        if (text && text.length <= 24 && /\d/.test(text)) texts.set(el, text)
      }
    }
  }
  const w = window as unknown as Record<string, unknown>
  w.__mwScan = scan
  w.__mwRec = rec
  w.__mwTexts = texts
  document.addEventListener("DOMContentLoaded", scan)
  let ticks = 0
  const timer = setInterval(() => {
    scan()
    if (++ticks > 25) clearInterval(timer)
  }, 150)
}

/** Scroll slowly through the page so lazy content loads and reveals fire, scanning as it goes. */
async function scrollAndScan() {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const scan = ((window as unknown as Record<string, unknown>).__mwScan as () => void) ?? (() => {})
  scan()
  const step = Math.max(240, window.innerHeight * 0.45)
  for (let y = 0, i = 0; y < document.documentElement.scrollHeight && y < 40000 && i < 220; i++) {
    scan()
    y += step
    window.scrollTo(0, y)
    await wait(180)
  }
  await wait(1500)
  window.scrollTo(0, 0)
  await wait(1200)
}

type PrepareArgs = { sheets: Record<string, string>; maxTriggers: number; budgetMs: number }

/**
 * Find the blocks, record behaviour, restore the initial state, convert
 * carousels and collect the CSS. Leaves a serializer on window for
 * serializeInPage, which may run more than once.
 */
async function prepareInPage({ sheets, maxTriggers, budgetMs }: PrepareArgs) {
  const started = performance.now()
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const w = window as unknown as Record<string, unknown>
  const body = document.body
  const html = document.documentElement
  const vh = window.innerHeight
  const stats: Record<string, number> = {}
  const CAROUSEL = ".swiper,.swiper-container,.slick-slider,.splide,.owl-carousel,.flickity-enabled,.glide,.keen-slider,.embla"
  const OVERLAY = /cookie|consent|gdpr|onetrust|(^|\s)(cmp|cky|cc)-|termly|usercentrics|didomi|truste|klaro/i

  const visible = (el: Element) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden"
  }
  const nameOf = (el: Element) => `${el.id} ${typeof el.className === "string" ? el.className : ""}`

  // Blocks: every visible child, descending through single wrappers and
  // splitting tall wrappers whose rows are full width -------------------------
  const candidate = (el: Element) => {
    if (/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|DIALOG)$/.test(el.tagName) || el.getAttribute("role") === "dialog") return false
    if (!visible(el) || OVERLAY.test(nameOf(el))) return false
    const r = el.getBoundingClientRect()
    if (r.height < 24) return false
    // Fixed elements other than a header bar are floats, captured separately.
    return getComputedStyle(el).position !== "fixed" || (r.top < vh * 0.5 && r.width >= window.innerWidth * 0.9)
  }
  const fullWidth = (el: Element, parent: Element) =>
    el.getBoundingClientRect().width >= (parent === body ? window.innerWidth : parent.getBoundingClientRect().width) * 0.9
  const blocksOf = (el: Element, depth: number): Element[] => {
    const kids = [...el.children].filter(candidate)
    if (depth > 10 || kids.length === 0) return [el]
    if (kids.length === 1) return blocksOf(kids[0], depth + 1)
    return kids.flatMap((k) => {
      const rows = [...k.children].filter((c) => candidate(c) && fullWidth(c, k))
      return rows.length >= 2 && k.getBoundingClientRect().height > vh * 1.5 ? blocksOf(k, depth + 1) : [k]
    })
  }
  let blocks = blocksOf(body, 0)
  if (blocks.length === 1 && blocks[0] === body) blocks = [...body.children].filter(candidate)
  blocks = blocks.slice(0, 80)
  const inside = (el: Node, roots: Element[]) => roots.some((r) => r === el || r.contains(el))

  // Small fixed elements outside the blocks: WhatsApp / chat / back-to-top buttons.
  const floats: Element[] = []
  for (const el of [...body.getElementsByTagName("*")].slice(0, 8000)) {
    if (inside(el, blocks) || inside(el, floats) || blocks.some((b) => el.contains(b))) continue
    const s = getComputedStyle(el)
    if (s.position !== "fixed" || !visible(el) || OVERLAY.test(nameOf(el))) continue
    const r = el.getBoundingClientRect()
    if (r.width * r.height > window.innerWidth * vh * 0.4) continue
    floats.push(el)
  }

  // Scroll reveals, counters, AOS and WOW -----------------------------------
  const rec = w.__mwRec as WeakMap<Element, { o: number; t: string }> | undefined
  const texts = w.__mwTexts as WeakMap<Element, string> | undefined
  const parseT = (t: string) => {
    const m = t.match(/matrix(3d)?\(([^)]+)\)/)
    if (!m) return { tx: 0, ty: 0, sc: 1 }
    const v = m[2].split(",").map(Number)
    return m[1] ? { tx: v[12], ty: v[13], sc: Math.hypot(v[0], v[1]) } : { tx: v[4], ty: v[5], sc: Math.hypot(v[0], v[1]) }
  }
  const num = (t: string) => parseFloat(t.replace(/[^\d.]/g, "")) || 0
  let reveals = 0
  let counters = 0
  const everything = [...body.getElementsByTagName("*")].slice(0, 12000)
  for (const el of everything) {
    if (!(el instanceof HTMLElement)) continue
    if (el.closest(CAROUSEL)) continue
    if (texts?.has(el) && el.childElementCount === 0) {
      const first = texts.get(el) ?? ""
      const final = (el.textContent ?? "").trim()
      if (first !== final && /\d/.test(final) && num(first) < num(final) && final.length <= 24) {
        el.setAttribute("data-mw-count", final)
        counters++
      }
    }
    const r = rec?.get(el)
    if (!r || reveals >= 600 || el.hasAttribute("data-aos") || el.classList.contains("wow")) continue
    // animate.css entrances started by script (Elementor, WOW-likes): replay them in view.
    if (r.o <= 0.2 && (el.classList.contains("animated") || el.classList.contains("animate__animated"))) {
      el.classList.add("wow")
      reveals++
      continue
    }
    const s = getComputedStyle(el)
    if (s.visibility === "hidden" || parseFloat(s.opacity) < 0.9 || s.animationName !== "none") continue
    const fin = parseT(s.transform)
    const from = parseT(r.t)
    const fadeIn = r.o <= 0.2
    const identity = Math.abs(fin.tx) < 2 && Math.abs(fin.ty) < 2 && Math.abs(fin.sc - 1) < 0.02
    const moveIn =
      r.t !== "none" && identity && (Math.hypot(from.tx - fin.tx, from.ty - fin.ty) >= 10 || Math.abs(from.sc - fin.sc) >= 0.04)
    if (!fadeIn && !moveIn) continue
    el.setAttribute("data-mw-reveal", "")
    el.style.setProperty("--mw-o", String(fadeIn ? Math.max(0, r.o) : 1))
    el.style.setProperty("--mw-t", moveIn ? r.t : s.transform)
    reveals++
  }
  stats.reveals = reveals
  stats.counters = counters

  // Header classes that change once the page scrolls ---------------------------
  const scrollWatch = [html, body, ...everything.filter((el) => {
    const p = getComputedStyle(el).position
    return p === "fixed" || p === "sticky"
  })].slice(0, 300)
  const watchSet = new Set<Element>()
  for (const el of scrollWatch) {
    watchSet.add(el)
    if (el !== html && el !== body) for (const d of [...el.getElementsByTagName("*")].slice(0, 80)) watchSet.add(d)
  }
  const watched = [...watchSet].slice(0, 1500)
  const classes = () => watched.map((el) => el.getAttribute("class") ?? "")
  window.scrollTo(0, 0)
  await wait(400)
  const atTop = classes()
  window.scrollTo(0, 500)
  await wait(600)
  const scrolledDown = classes()
  const changed = watched.map((_, i) => i).filter((i) => atTop[i] !== scrolledDown[i])
  const stateTokens = new Set<string>(["aos-animate", "animated", "animate__animated"])
  const stateAttrs = new Set<string>()
  const tokenize = (v: string | null) => (v ?? "").split(/\s+/).filter(Boolean)
  if (changed.length) {
    const threshold = new Map<number, number>()
    for (const y of [10, 40, 80, 150, 250, 400]) {
      window.scrollTo(0, y)
      await wait(250)
      const now = classes()
      for (const i of changed) if (!threshold.has(i) && now[i] === scrolledDown[i]) threshold.set(i, y)
    }
    for (const i of changed) {
      const before = tokenize(atTop[i])
      const after = tokenize(scrolledDown[i])
      const b = before.filter((t) => !after.includes(t))
      const a = after.filter((t) => !before.includes(t))
      b.concat(a).forEach((t) => stateTokens.add(t))
      watched[i].setAttribute("data-mw-scroll", JSON.stringify({ y: threshold.get(i) ?? 100, b, a }))
    }
  }
  window.scrollTo(0, 0)
  await wait(500)
  changed.forEach((i) => {
    if (watched[i].getAttribute("class") !== atTop[i]) watched[i].setAttribute("class", atTop[i])
  })
  stats.scrollStates = changed.length

  // Responsive markup ----------------------------------------------------------
  // Many sites build their mobile header with script on resize (a cloned
  // logo, a "mobile" class on the menu). Shrink the window step by step and
  // record which elements appear, disappear or change class at which width.
  const resize = w.__mwResize as ((width: number) => Promise<void>) | undefined
  const STEPS = [1199, 1023, 991, 767, 390]
  let width = window.innerWidth
  type Seen = { width: number; parent: Node; next: Node | null }
  const appeared = new Map<Element, Seen>()
  const vanished = new Map<Element, Seen>()
  const classAtDesktop = new Map<Element, string | null>()
  const classWidth = new Map<Element, number>()
  const resizeLog = (records: MutationRecord[]) => {
    for (const r of records) {
      if (r.type === "attributes") {
        const el = r.target as Element
        if (!classAtDesktop.has(el)) classAtDesktop.set(el, r.oldValue)
        if (!classWidth.has(el)) classWidth.set(el, width)
        continue
      }
      for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue
        if (vanished.has(n)) vanished.delete(n)
        else if (!appeared.has(n)) appeared.set(n, { width, parent: r.target, next: r.nextSibling })
      }
      for (const n of r.removedNodes) {
        if (!(n instanceof Element)) continue
        if (appeared.has(n)) appeared.get(n)!.next = r.nextSibling
        else if (!vanished.has(n)) vanished.set(n, { width, parent: r.target, next: r.nextSibling })
      }
    }
  }
  const resizeObserver = new MutationObserver(resizeLog)
  if (resize) {
    resizeObserver.observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true })
    for (const step of STEPS) {
      width = step
      await resize(step)
      await wait(600)
      resizeLog(resizeObserver.takeRecords())
    }
    resizeObserver.disconnect()
  }
  const classAtMobile = new Map([...classAtDesktop.keys()].map((el) => [el, el.getAttribute("class")] as const))

  // Clicks: menus, accordions, tabs, dropdowns -----------------------------
  // Recorded at phone width, where menus hide behind a toggle.
  // Each trigger is clicked while a MutationObserver records what changes.
  // Triggers whose second click undoes the first are toggles; the rest (tabs)
  // are grouped by the elements they touch and recorded as absolute states.
  window.open = () => null
  document.addEventListener("submit", (e) => e.preventDefault(), true)
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.("a[href]")
      const href = a?.getAttribute("href") ?? ""
      if (a && href && !href.startsWith("#")) e.preventDefault()
    },
    true,
  )
  const ATTR_OK = /^(class|style|hidden|open|checked|selected|aria-[a-z-]+|data-(?!mw-)[a-z0-9-]+)$/
  type Pair = { el: Element; attr: string }
  const initialAttr = new Map<Element, Map<string, string | null>>()
  const seen = new Map<Element, Map<string, Set<string | null>>>()
  const nodeInitial = new Map<Element, boolean>()
  const nodePos = new Map<Element, { parent: Node; next: Node | null }>()
  const noisy = new Set<Element>()
  let log: MutationRecord[] = []
  const observer = new MutationObserver((records) => log.push(...records))
  observer.observe(body, { subtree: true, attributes: true, attributeOldValue: true, childList: true })
  const note = (el: Element, attr: string, value: string | null) => {
    if (!seen.has(el)) seen.set(el, new Map())
    const m = seen.get(el)!
    if (!m.has(attr)) m.set(attr, new Set())
    m.get(attr)!.add(value)
  }
  const flush = () => {
    log.push(...observer.takeRecords())
    const records = log
    log = []
    return records
  }
  await wait(1200)
  for (const r of flush()) if (r.type === "attributes") noisy.add(r.target as Element)
  const autoplay = new Set<Element>()
  for (const el of noisy) {
    const root = el.closest(CAROUSEL)
    if (root) autoplay.add(root)
  }

  type Effect = { pairs: Pair[]; nodes: Element[]; before: Map<Element, Map<string, string | null>>; nodeBefore: Map<Element, boolean> }
  const digest = (records: MutationRecord[]): Effect => {
    const pairs = new Map<string, Pair>()
    const ids = new Map<Element, number>()
    const id = (el: Element) => {
      if (!ids.has(el)) ids.set(el, ids.size)
      return ids.get(el)!
    }
    const before = new Map<Element, Map<string, string | null>>()
    const nodeBefore = new Map<Element, boolean>()
    for (const r of records) {
      if (r.type === "attributes") {
        const el = r.target as Element
        const attr = r.attributeName ?? ""
        if (!ATTR_OK.test(attr) || noisy.has(el) || el.closest(CAROUSEL)) continue
        if (!initialAttr.has(el)) initialAttr.set(el, new Map())
        if (!initialAttr.get(el)!.has(attr)) initialAttr.get(el)!.set(attr, r.oldValue)
        if (!before.has(el)) before.set(el, new Map())
        if (!before.get(el)!.has(attr)) before.get(el)!.set(attr, r.oldValue)
        note(el, attr, r.oldValue)
        pairs.set(`${id(el)}:${attr}`, { el, attr })
      } else if (r.type === "childList") {
        for (const [list, present] of [
          [r.addedNodes, false],
          [r.removedNodes, true],
        ] as const) {
          for (const n of list) {
            if (!(n instanceof Element) || n.closest?.(CAROUSEL)) continue
            if (!nodeInitial.has(n)) nodeInitial.set(n, present)
            if (!nodeBefore.has(n)) nodeBefore.set(n, present)
            nodePos.set(n, { parent: r.target, next: r.nextSibling })
          }
        }
      }
    }
    const nodes = [...nodeBefore.keys()].filter((n) => nodeBefore.get(n) !== n.isConnected)
    return { pairs: [...pairs.values()], nodes, before, nodeBefore }
  }
  const valueOf = (p: Pair) => p.el.getAttribute(p.attr)
  const sameAs = (effect: Effect) =>
    effect.pairs.every((p) => valueOf(p) === effect.before.get(p.el)?.get(p.attr)) &&
    effect.nodes.every((n) => n.isConnected === effect.nodeBefore.get(n))

  const roots = [...blocks, ...floats]
  const TRIGGERS =
    'button,[role="button"],[role="tab"],[aria-expanded],[aria-controls],[aria-haspopup],[data-toggle],[data-bs-toggle],[data-target],[data-bs-target],[class*="toggle"],[class*="burger"],[class*="menu-btn"],[class*="menu-button"],[class*="nav-btn"],[class*="menu-icon"],[class*="accordion-title"],[class*="accordion-header"],[class*="tab-title"],[class*="faq-question"],[class*="close-button"],[class*="close-btn"],[class*="btn-close"],[class*="menu-close"],[class*="nav-close"]'
  const priority = (el: Element) =>
    el.matches('[aria-expanded],[aria-controls],[role="tab"],[data-toggle],[data-bs-toggle]')
      ? 3
      : /burger|hamburger|toggle|menu|nav-btn|navbar-btn|mobile/i.test(nameOf(el) + (el.getAttribute("aria-label") ?? ""))
        ? 2
        : 1
  const triggers = [...document.querySelectorAll(TRIGGERS)]
    .filter((el) => inside(el, roots) && !el.closest(CAROUSEL) && !el.parentElement?.closest('button,a,[role="button"],[role="tab"]'))
    .filter((el) => !(el instanceof HTMLButtonElement && (el.disabled || (el.type === "submit" && el.form))))
    .map((el, order) => ({ el, order, p: priority(el) }))
    .sort((a, b) => b.p - a.p || a.order - b.order)
    .slice(0, maxTriggers)
    .sort((a, b) => a.order - b.order)
    .map((t) => t.el as HTMLElement)

  const method = new Map<Element, "click" | "pointer">()
  const press = (el: HTMLElement, how: "click" | "pointer") => {
    if (how === "click") return el.click()
    const init = { bubbles: true, cancelable: true, composed: true, button: 0, view: window }
    el.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerType: "mouse", isPrimary: true }))
    el.dispatchEvent(new MouseEvent("mousedown", init))
    el.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerType: "mouse", isPrimary: true }))
    el.dispatchEvent(new MouseEvent("mouseup", init))
  }
  const pressAndRecord = async (el: HTMLElement) => {
    flush()
    let how = method.get(el) ?? "click"
    press(el, how)
    await wait(380)
    if (window.scrollY !== 0) window.scrollTo(0, 0)
    let effect = digest(flush())
    if (!method.has(el) && effect.pairs.length === 0 && effect.nodes.length === 0) {
      how = "pointer"
      press(el, how)
      await wait(380)
      effect = digest(flush())
    }
    if (effect.pairs.length || effect.nodes.length) method.set(el, how)
    return effect
  }
  const overBudget = () => performance.now() - started > budgetMs

  type Recorded = { el: HTMLElement; toggle: boolean; effect: Effect; after: Map<Pair, string | null>; nodeAfter: Map<Element, boolean> }
  const recorded: Recorded[] = []
  const quiet: HTMLElement[] = []
  for (const el of triggers) {
    if (overBudget()) break
    const effect = await pressAndRecord(el)
    if (!effect.pairs.length && !effect.nodes.length) {
      quiet.push(el)
      continue
    }
    const after = new Map(effect.pairs.map((p) => [p, valueOf(p)] as const))
    const nodeAfter = new Map(effect.nodes.map((n) => [n, n.isConnected] as const))
    after.forEach((v, p) => note(p.el, p.attr, v))
    await pressAndRecord(el)
    recorded.push({ el, toggle: sameAs(effect), effect, after, nodeAfter })
  }
  // A tab that was already active did nothing the first time; now that other
  // tabs were clicked, clicking it shows what it controls. A close button
  // inside a menu does nothing while the menu is shut, so open the toggle that
  // shows it first; its recipe then records the closed state.
  const openers = [...recorded]
  for (const el of quiet) {
    if (overBudget()) break
    const opener = openers.find((t) => t.effect.pairs.some((p) => p.el.contains(el)) || t.effect.nodes.some((n) => n.contains(el)))
    if (opener) await pressAndRecord(opener.el)
    const effect = await pressAndRecord(el)
    if (!effect.pairs.length && !effect.nodes.length) continue
    const after = new Map(effect.pairs.map((p) => [p, valueOf(p)] as const))
    effect.pairs.forEach((p) => note(p.el, p.attr, valueOf(p)))
    recorded.push({ el, toggle: false, effect, after, nodeAfter: new Map(effect.nodes.map((n) => [n, n.isConnected] as const)) })
  }

  // Group set-style triggers (tabs) by the elements they share, then record the
  // full state of each group after each of its triggers.
  const sets = recorded.filter((r) => !r.toggle)
  const groupOf = new Map<Recorded, number>()
  sets.forEach((r, i) => groupOf.set(r, i))
  const touches = (r: Recorded) => new Set<Element>([...r.effect.pairs.map((p) => p.el), ...r.effect.nodes])
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const a = touches(sets[i])
      if ([...touches(sets[j])].some((el) => a.has(el))) {
        const from = groupOf.get(sets[j])!
        const to = groupOf.get(sets[i])!
        sets.forEach((r) => groupOf.get(r) === from && groupOf.set(r, to))
      }
    }
  }
  const absolute = new Map<Recorded, { pairs: Map<Pair, string | null>; nodes: Map<Element, boolean> }>()
  for (const g of new Set(groupOf.values())) {
    const members = sets.filter((r) => groupOf.get(r) === g)
    const byElement = new Map<Element, Map<string, Pair>>()
    const nodes = new Set<Element>()
    members.forEach((r) => {
      r.effect.pairs.forEach((p) => {
        if (!byElement.has(p.el)) byElement.set(p.el, new Map())
        byElement.get(p.el)!.set(p.attr, p)
      })
      r.effect.nodes.forEach((n) => nodes.add(n))
    })
    const pairs = [...byElement.values()].flatMap((m) => [...m.values()])
    for (const r of members) {
      if (performance.now() - started > budgetMs + 20_000) break
      await pressAndRecord(r.el)
      const state = new Map(pairs.map((p) => [p, valueOf(p)] as const))
      state.forEach((v, p) => note(p.el, p.attr, v))
      absolute.set(r, { pairs: state, nodes: new Map([...nodes].map((n) => [n, n.isConnected] as const)) })
    }
  }
  flush()
  observer.disconnect()

  // Back to the page as it first appeared. Elements that only exist in some
  // state stay in the DOM, hidden with data-mw-off, so they can be shown.
  initialAttr.forEach((attrs, el) =>
    attrs.forEach((value, attr) => (value === null ? el.removeAttribute(attr) : el.setAttribute(attr, value))),
  )
  const reinsert = (n: Element) => {
    const pos = nodePos.get(n)
    if (!pos || n.isConnected) return
    const next = pos.next && pos.next.parentNode === pos.parent ? pos.next : null
    if (pos.parent.isConnected) pos.parent.insertBefore(n, next)
  }
  nodeInitial.forEach((present, n) => {
    if (present) reinsert(n)
  })
  nodeInitial.forEach((present, n) => {
    if (present) return
    reinsert(n)
    n.setAttribute("data-mw-off", "")
  })

  // Back to desktop width. Elements that exist only on phones (or only on
  // desktop) stay in the markup and are switched by media queries; class
  // changes are replayed by the runtime at the recorded width.
  const mobileOnly = [...appeared].filter(([n]) => n.isConnected)
  const desktopOnly = [...vanished].filter(([n]) => !n.isConnected)
  if (resize) {
    for (const step of [...STEPS].reverse().slice(1).concat(1440)) {
      await resize(step)
      await wait(400)
    }
  }
  const place = (n: Element, s: Seen) => {
    if (n.isConnected || !s.parent.isConnected) return
    s.parent.insertBefore(n, s.next && s.next.parentNode === s.parent ? s.next : null)
  }
  const responsiveRules = new Set<string>()
  for (const [n, s] of mobileOnly) {
    place(n, s)
    n.setAttribute("data-mw-below", String(s.width))
    responsiveRules.add(`@media (min-width:${s.width + 1}px){[data-mw-below="${s.width}"]{display:none!important}}`)
  }
  for (const [n, s] of desktopOnly) {
    place(n, s)
    n.setAttribute("data-mw-above", String(s.width))
    responsiveRules.add(`@media (max-width:${s.width}px){[data-mw-above="${s.width}"]{display:none!important}}`)
  }
  let mediaClasses = 0
  classAtDesktop.forEach((desktop, el) => {
    const d = tokenize(desktop)
    const m = tokenize(classAtMobile.get(el) ?? null)
    const a = m.filter((t) => !d.includes(t))
    const b = d.filter((t) => !m.includes(t))
    if (desktop === null) el.removeAttribute("class")
    else el.setAttribute("class", desktop)
    if ((!a.length && !b.length) || el.closest(CAROUSEL)) return
    a.concat(b).forEach((t) => stateTokens.add(t))
    el.setAttribute("data-mw-media", JSON.stringify({ max: classWidth.get(el) ?? 767, a, b }))
    mediaClasses++
  })
  stats.responsive = mobileOnly.length + desktopOnly.length + mediaClasses

  // Recipes ----------------------------------------------------------------
  let nextKey = 1
  const keyOf = (el: Element) => {
    if (el === body) return "b"
    if (el === html) return "h"
    let k = el.getAttribute("data-mw-k")
    if (!k) {
      k = String(nextKey++)
      el.setAttribute("data-mw-k", k)
    }
    return k
  }
  const styleMap = (v: string | null) => {
    const probe = document.createElement("div")
    probe.setAttribute("style", v ?? "")
    const map: Record<string, string> = {}
    for (let i = 0; i < probe.style.length; i++) map[probe.style[i]] = probe.style.getPropertyValue(probe.style[i])
    return map
  }
  const stateful = (el: Element, attr: string) => {
    const values = [...(seen.get(el)?.get(attr) ?? [])]
    if (attr === "class") {
      const sets = values.map((v) => new Set(tokenize(v)))
      const all = new Set(sets.flatMap((s) => [...s]))
      return new Set([...all].filter((t) => !sets.every((s) => s.has(t))))
    }
    const maps = values.map(styleMap)
    const props = new Set(maps.flatMap((m) => Object.keys(m)))
    return new Set([...props].filter((p) => !maps.every((m) => m[p] === maps[0][p])))
  }
  type Change = unknown[]
  const change = (el: Element, attr: string, before: string | null, after: string | null, toggle: boolean): Change | null => {
    const k = keyOf(el)
    if (attr === "class") {
      let b: string[]
      let a: string[]
      if (toggle) {
        const bt = tokenize(before)
        const at = tokenize(after)
        b = bt.filter((t) => !at.includes(t))
        a = at.filter((t) => !bt.includes(t))
      } else {
        const s = stateful(el, attr)
        const at = new Set(tokenize(after))
        a = [...s].filter((t) => at.has(t))
        b = [...s].filter((t) => !at.has(t))
      }
      b.concat(a).forEach((t) => stateTokens.add(t))
      return a.length || b.length ? [k, "c", b, a] : null
    }
    if (attr === "style") {
      const bm = styleMap(before)
      const am = styleMap(after)
      const props = toggle ? [...new Set([...Object.keys(bm), ...Object.keys(am)])].filter((p) => bm[p] !== am[p]) : [...stateful(el, attr)]
      if (!props.length) return null
      const pick = (m: Record<string, string>) => Object.fromEntries(props.map((p) => [p, m[p] ?? ""]))
      return [k, "s", toggle ? pick(bm) : {}, pick(am)]
    }
    stateAttrs.add(attr)
    return before === after && toggle ? null : [k, "a", attr, before, after]
  }
  const presence = (n: Element, before: boolean, after: boolean): Change => [keyOf(n), "a", "data-mw-off", before ? null : "", after ? null : ""]
  let interactions = 0
  for (const r of recorded) {
    const changes: (Change | null)[] = []
    const abs = absolute.get(r)
    if (r.toggle) {
      r.effect.pairs.forEach((p) => changes.push(change(p.el, p.attr, r.effect.before.get(p.el)?.get(p.attr) ?? null, r.after.get(p) ?? null, true)))
      r.effect.nodes.forEach((n) => changes.push(presence(n, r.effect.nodeBefore.get(n) ?? true, r.nodeAfter.get(n) ?? true)))
    } else if (abs) {
      abs.pairs.forEach((value, p) => changes.push(change(p.el, p.attr, null, value, false)))
      abs.nodes.forEach((present, n) => changes.push(presence(n, !present, present)))
    }
    const kept = changes.filter((c): c is Change => c !== null)
    if (!kept.length) continue
    r.el.setAttribute("data-mw-click", JSON.stringify({ m: r.toggle ? "t" : "s", c: kept }))
    interactions++
  }
  stats.interactions = interactions
  stats.triggers = triggers.length
  stats.recorded = recorded.length
  stats.quiet = quiet.length
  stats.toggles = recorded.filter((r) => r.toggle).length
  stats.absolute = absolute.size

  // Elements the recipes touch that live outside the blocks (drawers and
  // menus portaled to <body>) are captured as extra roots.
  const extras: Element[] = []
  for (const el of document.querySelectorAll("[data-mw-k]")) {
    if (inside(el, roots) || inside(el, extras) || roots.some((r) => el.contains(r))) continue
    // The largest subtree around it that holds no block, e.g. a drawer next to the header.
    let top: Element = el
    while (top.parentElement && top.parentElement !== body && !roots.some((r) => top.parentElement!.contains(r))) top = top.parentElement
    if (!inside(top, extras)) extras.push(top)
  }

  // Carousels become native scroll-snap strips --------------------------------
  const TRACK = ".swiper-wrapper,.slick-track,.splide__list,.owl-stage,.flickity-slider,.glide__slides,.embla__container"
  const NEXT = '.swiper-button-next,.slick-next,.splide__arrow--next,.owl-next,.glide__arrow--right,.next,[class*="arrow-next"],[class*="next-arrow"],[aria-label*="next" i]'
  const PREV = '.swiper-button-prev,.slick-prev,.splide__arrow--prev,.owl-prev,.glide__arrow--left,.prev,[class*="arrow-prev"],[class*="prev-arrow"],[aria-label*="prev" i]'
  let carousels = 0
  for (const root of document.querySelectorAll(CAROUSEL)) {
    if (!inside(root, [...roots, ...extras]) || root.parentElement?.closest(CAROUSEL)) continue
    const track = (root.matches(".keen-slider") ? root : root.querySelector(TRACK)) as HTMLElement | null
    if (!track) continue
    track.querySelectorAll(":scope > .swiper-slide-duplicate, :scope > .slick-cloned, :scope > .splide__slide--clone, :scope > .cloned").forEach((c) => c.remove())
    const slides = [...track.children] as HTMLElement[]
    if (slides.length < 2) continue
    const shown = slides.find(visible) ?? slides[0]
    const slideWidth = shown.getBoundingClientRect().width || 1
    const gap = parseFloat(getComputedStyle(shown).marginRight) || parseFloat(getComputedStyle(track).columnGap) || 0
    const perView = Math.max(1, Math.min(6, Math.round((root.getBoundingClientRect().width + gap) / (slideWidth + gap))))
    const id = `c${++carousels}`
    track.setAttribute("data-mw-carousel", id)
    if (autoplay.has(root)) track.setAttribute("data-mw-autoplay", "4000")
    for (const p of ["transform", "transition", "transition-duration", "width", "height", "left"]) track.style.removeProperty(p)
    track.style.setProperty("--mw-slide", perView > 1 ? `calc((100% - ${Math.round((perView - 1) * gap)}px) / ${perView})` : "100%")
    track.style.setProperty("--mw-slide-m", perView >= 3 ? "85%" : "100%")
    for (const s of slides) for (const p of ["width", "transform", "opacity", "left", "top", "position", "transition", "transition-duration", "visibility"]) s.style.removeProperty(p)
    const scope = root.parentElement ?? root
    scope.querySelectorAll(NEXT).forEach((a) => !track.contains(a) && a.setAttribute("data-mw-next", id))
    scope.querySelectorAll(PREV).forEach((a) => !track.contains(a) && a.setAttribute("data-mw-prev", id))
  }
  stats.carousels = carousels

  // CSS ----------------------------------------------------------------------
  const allRoots = [...blocks, ...extras, ...floats]
  const chainSet = new Set<Element>()
  for (const r of allRoots) for (let p = r.parentElement; p && p !== body; p = p.parentElement) chainSet.add(p)
  const captured = new Set<Element>([html, body, ...chainSet])
  for (const r of allRoots) {
    captured.add(r)
    for (const d of r.getElementsByTagName("*")) captured.add(d)
  }
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const tokenRe = stateTokens.size ? new RegExp(`\\.(?:${[...stateTokens].map(escapeRe).join("|")})(?![\\w-])`) : null
  const attrRe = stateAttrs.size ? new RegExp(`\\[(?:${[...stateAttrs].map(escapeRe).join("|")})(?![\\w-])`) : null
  const STATE =
    /::?(?:hover|focus-within|focus-visible|focus|active|visited|link|any-link|target|checked|disabled|enabled|invalid|valid|in-range|out-of-range|placeholder-shown|autofill|indeterminate|default|required|optional|read-only|read-write|user-invalid|user-valid|popover-open|fullscreen|modal|playing|paused|before|after|placeholder|selection|marker|first-line|first-letter|backdrop|file-selector-button|cue|-webkit-[\w-]+|-moz-[\w-]+)(?![\w-])(?:\([^()]*\))?/g
  const usedCache = new Map<string, boolean>()
  const used = (selector: string) => {
    if (usedCache.has(selector)) return usedCache.get(selector)!
    let keep = true
    if (!(tokenRe?.test(selector) || attrRe?.test(selector) || /\[data-mw-off|\[open|\[hidden/.test(selector))) {
      let test = selector.replace(STATE, "").trim()
      if (!test || /[>+~(,]$/.test(test)) test += "*"
      if (/^[>+~]/.test(test)) test = "* " + test
      try {
        keep = false
        for (const el of document.querySelectorAll(test)) {
          if (captured.has(el)) {
            keep = true
            break
          }
        }
      } catch {
        keep = true
      }
    }
    usedCache.set(selector, keep)
    return keep
  }
  const splitSelectors = (text: string) => {
    const out: string[] = []
    let depth = 0
    let quote = ""
    let cur = ""
    for (const ch of text) {
      if (quote) {
        if (ch === quote) quote = ""
      } else if (ch === '"' || ch === "'") quote = ch
      else if (ch === "(" || ch === "[") depth++
      else if (ch === ")" || ch === "]") depth--
      else if (ch === "," && depth === 0) {
        out.push(cur.trim())
        cur = ""
        continue
      }
      cur += ch
    }
    if (cur.trim()) out.push(cur.trim())
    return out
  }
  // Blocks sit inside the renderer's wrappers, so `body > x` must look through them.
  const throughWrappers = (selector: string) =>
    selector.replace(
      /(^|[\s>+~(,])((?:html[^\s>+~,]*\s*>\s*)?body(?:[.#[:][^\s>+~,]*)?)\s*>\s*/g,
      "$1$2 > :where(.mw-root) > :where(.mw-html) > ",
    )
  // Published pages are https, where http:// fonts are blocked as mixed content.
  const secure = (u: string) => (location.protocol === "https:" ? u.replace(/^http:\/\//i, "https://") : u)
  const absCss = (text: string, base: string) =>
    text.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, _q, raw: string) => {
      const u = raw.trim()
      if (/^(data:|#)/i.test(u)) return match
      try {
        return `url("${secure(new URL(u, base).href)}")`
      } catch {
        return match
      }
    })
  const fontFaces: { family: string; text: string }[] = []
  const keyframes: { name: string; text: string }[] = []
  const visited = new Set<string>()
  type RuleSource = { rules: CSSRuleList; base: string; imports: { url: string; media: string }[] }
  const readSheet = (sheet: CSSStyleSheet | null, href: string | null): RuleSource | null => {
    if (sheet) {
      try {
        return { rules: sheet.cssRules, base: sheet.href ?? location.href, imports: [] }
      } catch {
        // Cross-origin: use the text the crawler captured from the network.
      }
    }
    if (!href || visited.has(href)) return null
    visited.add(href)
    const text = sheets[href]
    if (text === undefined) return null
    const imports: { url: string; media: string }[] = []
    const stripped = text.replace(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?([^;]*);/gi, (_m, u: string, media: string) => {
      try {
        imports.push({ url: new URL(u, href).href, media: media.trim() })
      } catch {
        // Unresolvable import.
      }
      return ""
    })
    const parsed = new CSSStyleSheet()
    try {
      parsed.replaceSync(stripped)
    } catch {
      return null
    }
    return { rules: parsed.cssRules, base: href, imports }
  }
  const wrapMedia = (media: string | undefined, rules: string[], out: string[]) => {
    if (!rules.length) return
    if (media && media !== "all" && media.trim()) out.push(`@media ${media}{${rules.join("\n")}}`)
    else out.push(...rules)
  }
  const walkSheet = (sheet: CSSStyleSheet | null, href: string | null, out: string[]) => {
    const source = readSheet(sheet, href)
    if (!source) return
    for (const imp of source.imports) {
      const inner: string[] = []
      walkSheet(null, imp.url, inner)
      wrapMedia(imp.media, inner, out)
    }
    walk(source.rules, source.base, out)
  }
  const walk = (rules: CSSRuleList, base: string, out: string[]) => {
    for (const rule of rules) {
      try {
        visit(rule, base, out)
      } catch {
        // Skip rules the browser can't serialize.
      }
    }
  }
  const visit = (rule: CSSRule, base: string, out: string[]) => {
    if (rule instanceof CSSImportRule) {
      const media = rule.media?.mediaText
      if (/^\s*print\s*$/i.test(media ?? "")) return
      const inner: string[] = []
      let href: string | null = null
      try {
        href = new URL(rule.href, base).href
      } catch {
        // Unresolvable import.
      }
      walkSheet(rule.styleSheet, href, inner)
      wrapMedia(media, inner, out)
      return
    }
    if (rule instanceof CSSStyleRule) {
      const kept = splitSelectors(rule.selectorText).filter(used)
      if (!kept.length) return
      const nested = (rule as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules
      const declarations = nested && nested.length ? rule.cssText.slice(rule.cssText.indexOf("{")) : `{${rule.style.cssText}}`
      out.push(absCss(kept.map(throughWrappers).join(",") + declarations, base))
      return
    }
    if (rule instanceof CSSKeyframesRule) {
      keyframes.push({ name: rule.name, text: rule.cssText })
      return
    }
    if (rule instanceof CSSFontFaceRule) {
      fontFaces.push({ family: rule.style.getPropertyValue("font-family").replace(/["']/g, "").trim(), text: absCss(rule.cssText, base) })
      return
    }
    if (rule instanceof CSSPageRule) return
    if (rule instanceof CSSMediaRule && /^\s*print\s*$/i.test(rule.conditionText)) return
    const grouped = (rule as CSSRule & { cssRules?: CSSRuleList }).cssRules
    if (grouped) {
      const inner: string[] = []
      walk(grouped, base, inner)
      if (inner.length) out.push(`${rule.cssText.slice(0, rule.cssText.indexOf("{")).trim()}{${inner.join("\n")}}`)
      return
    }
    out.push(absCss(rule.cssText, base))
  }
  const rules: string[] = []
  for (const sheet of document.styleSheets) {
    if (sheet.disabled) continue
    const media = sheet.media?.mediaText
    if (/^\s*print\s*$/i.test(media ?? "")) continue
    const inner: string[] = []
    walkSheet(sheet, sheet.href, inner)
    wrapMedia(media, inner, rules)
  }
  for (const sheet of document.adoptedStyleSheets ?? []) walk(sheet.cssRules, location.href, rules)
  for (const [selector, el] of [["html", html], ["body", body]] as const) {
    const inline = el.getAttribute("style")
    if (inline) rules.push(`${selector}{${absCss(inline, location.href)}}`)
  }
  rules.push(...responsiveRules)
  const css = rules.join("\n")
  stats.cssRules = rules.length
  const usedData = new Set((css.match(/\[data-[\w-]+/g) ?? []).map((s) => s.slice(1).toLowerCase()))

  // Runtime-driven entrance classes start removed; the runtime adds them in view.
  for (const el of document.querySelectorAll("[data-aos]")) el.classList.remove("aos-animate")
  for (const el of document.querySelectorAll<HTMLElement>(".wow")) {
    const active = ["animated", "animate__animated"].filter((t) => el.classList.contains(t))
    el.setAttribute("data-mw-wow", active.join(" ") || "animated")
    active.forEach((t) => el.classList.remove(t))
    el.style.removeProperty("visibility")
    el.style.removeProperty("animation-name")
  }

  w.__mwPrepared = { roots: { blocks, extras, floats }, css, fontFaces, keyframes, usedData: [...usedData] }
  return { ...stats, blocks: blocks.length, floats: floats.length, extras: extras.length, ms: Math.round(performance.now() - started) }
}

/** Serialize the prepared page into sections, CSS and defs. */
function serializeInPage({ svgInlineLimit }: { svgInlineLimit: number }) {
  type Prepared = {
    roots: { blocks: Element[]; extras: Element[]; floats: Element[] }
    css: string
    fontFaces: { family: string; text: string }[]
    keyframes: { name: string; text: string }[]
    usedData: string[]
  }
  const prepared = (window as unknown as { __mwPrepared: Prepared }).__mwPrepared
  const body = document.body
  const html = document.documentElement
  const usedData = new Set(prepared.usedData)
  const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])
  const SKIP = new Set(["script", "noscript", "template", "style", "link", "meta", "base", "title", "object", "embed", "frame", "frameset", "portal"])
  const IFRAME_OK =
    /^https:\/\/((www\.)?youtube(-nocookie)?\.com|player\.vimeo\.com|(www\.)?google\.com\/maps|maps\.google\.com|open\.spotify\.com|w\.soundcloud\.com|(www\.)?loom\.com|calendly\.com|fast\.wistia\.(net|com))\//
  const KEEP_DATA = /^data-(mw-|aos|wow-)/
  const DROP_ATTR = /^(on|crossorigin$|integrity$|nonce$|jsaction$|jsname$|jscontroller$|jsmodel$|data-reactroot$)/
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  // JSON recipes are full of double quotes; single-quoting them stores far less.
  const quote = (s: string) => (s.includes('"') && !s.includes("'") ? `'${s.replace(/&/g, "&amp;")}'` : `"${escAttr(s)}"`)
  // Published pages are https, where http:// fonts and frames are blocked as mixed content.
  const abs = (u: string) => {
    try {
      const href = new URL(u, document.baseURI).href
      return location.protocol === "https:" ? href.replace(/^http:\/\//i, "https://") : href
    } catch {
      return u
    }
  }
  const absCss = (text: string) =>
    text.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, _q, raw: string) => {
      const u = raw.trim()
      if (/^(data:|#)/i.test(u)) return match
      return `url("${abs(u)}")`
    })
  const ids = new Set<string>()
  const refs = new Set<string>()
  const stats = { svgImages: 0, canvases: 0, images: 0, svgSymbols: 0 }

  // srcset: keep the candidate in use and the largest, which is plenty for
  // the browser to pick from and keeps the asset count sane.
  const trimSrcset = (value: string, current: string) => {
    const candidates = value
      .split(/,\s+(?=\S)/)
      .map((c) => c.trim().split(/\s+/))
      .filter((c) => c[0])
      .map(([url, d = "1x"]) => ({ url: abs(url), d, size: parseFloat(d) || 1 }))
    if (candidates.length <= 2) return candidates.map((c) => `${c.url} ${c.d}`).join(", ")
    const largest = candidates.reduce((a, b) => (b.size > a.size ? b : a))
    const inUse = candidates.find((c) => c.url === current)
    return [...new Set([inUse, largest].filter(Boolean))].map((c) => `${c!.url} ${c!.d}`).join(", ")
  }

  const attrs = (el: Element, extraStyle = "") => {
    const tag = el.localName.toLowerCase()
    let out = ""
    let styled = false
    const isImg = tag === "img"
    const lazyTag = /^(img|source|video|audio|iframe)$/.test(tag)
    let lazySrc: string | null = null
    if (lazyTag) {
      const src = el.getAttribute("src")
      const placeholder = !src || (src.startsWith("data:") && src.length < 800)
      const real = el.getAttribute("data-src") ?? el.getAttribute("data-lazy-src") ?? el.getAttribute("data-original") ?? el.getAttribute("data-lazy")
      const current = (el as HTMLImageElement).currentSrc
      if (placeholder) lazySrc = current && !current.startsWith("data:") ? current : real
      if (lazySrc) lazySrc = abs(lazySrc)
      if (isImg) stats.images++
    }
    for (const a of el.attributes) {
      const name = a.name
      const lower = name.toLowerCase()
      let value = a.value
      if (DROP_ATTR.test(lower)) continue
      if (lower.startsWith("data-") && !KEEP_DATA.test(lower) && !usedData.has(lower)) {
        if (!(lazyTag && /^data-(src|srcset)$/.test(lower))) continue
      }
      if (lower === "id") ids.add(value)
      if (lower === "style") {
        value = absCss(value)
        if (extraStyle) value = `${value}${value && !value.trim().endsWith(";") ? ";" : ""}${extraStyle}`
        styled = true
      } else if (lower === "src" || lower === "poster" || lower === "action" || lower === "formaction") {
        if (lower === "src" && lazySrc) value = lazySrc
        if (!value.startsWith("data:")) value = abs(value)
      } else if (lower === "srcset" || lower === "data-srcset") {
        if (lower === "data-srcset" && el.hasAttribute("srcset")) continue
        value = trimSrcset(value, (el as HTMLImageElement).currentSrc ?? "")
        out += ` srcset="${escAttr(value)}"`
        continue
      } else if (lower === "data-src") {
        continue
      } else if (lower === "href" || lower === "xlink:href") {
        if (value.startsWith("#")) {
          if (tag !== "a") refs.add(value.slice(1))
        } else if (!/^(mailto:|tel:|sms:|javascript:)/i.test(value)) value = abs(value)
      } else if (/^(fill|stroke|clip-path|mask|filter|marker-start|marker-mid|marker-end)$/.test(lower)) {
        const m = value.match(/url\(\s*["']?#([^)"']+)/)
        if (m) refs.add(m[1])
      }
      // Path coordinates beyond two decimals are invisible at any real size.
      if ((lower === "d" || lower === "points") && value.length > 200) value = value.replace(/(\.\d{2})\d+/g, "$1")
      out += value === "" ? ` ${name}` : ` ${name}=${quote(value)}`
    }
    if (lazySrc && !el.hasAttribute("src")) out += ` src="${escAttr(lazySrc)}"`
    if (extraStyle && !styled) out += ` style="${escAttr(extraStyle)}"`
    return out
  }

  const preCache = new Map<Element, boolean>()
  const preformatted = (el: Element) => {
    if (!preCache.has(el)) preCache.set(el, /^pre/.test(getComputedStyle(el).whiteSpace) || el.localName === "textarea")
    return preCache.get(el)!
  }

  const ser = (el: Element, out: string[], inSvg: boolean) => {
    const tag = el.localName
    const lower = tag.toLowerCase()
    if (SKIP.has(lower) && !(lower === "style" && inSvg)) return
    if (lower === "iframe") {
      const src = abs(el.getAttribute("src") || el.getAttribute("data-src") || "")
      if (!IFRAME_OK.test(src)) {
        // Keep the space an unsupported embed (form, widget) took up.
        const r = el.getBoundingClientRect()
        const cls = el.getAttribute("class")
        out.push(`<div${cls ? ` class="${escAttr(cls)}"` : ""} style="width:100%;max-width:${Math.round(r.width)}px;height:${Math.round(r.height)}px"></div>`)
        return
      }
    }
    if (lower === "canvas") {
      try {
        const data = (el as HTMLCanvasElement).toDataURL("image/png")
        if (data.length > 200 && data.length < 600_000) {
          const r = el.getBoundingClientRect()
          const cls = el.getAttribute("class")
          out.push(`<img${cls ? ` class="${escAttr(cls)}"` : ""} src="${data}" alt="" width="${Math.round(r.width)}" height="${Math.round(r.height)}">`)
          stats.canvases++
          return
        }
      } catch {
        // Tainted canvas: keep it empty.
      }
    }
    if (lower === "svg" && !inSvg && svgInlineLimit > 0) {
      const xml = new XMLSerializer().serializeToString(el)
      if (xml.length > svgInlineLimit && !/currentColor|<use[\s>]/i.test(xml) && !el.querySelector("[class]")) {
        const r = el.getBoundingClientRect()
        const cls = el.getAttribute("class")
        const style = el.getAttribute("style")
        const data = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`
        out.push(
          `<img${cls ? ` class="${escAttr(cls)}"` : ""}${style ? ` style="${escAttr(style)}"` : ""} src="${data}" alt="" width="${Math.round(r.width)}" height="${Math.round(r.height)}">`,
        )
        stats.svgImages++
        return
      }
    }
    out.push(`<${tag}${attrs(el)}>`)
    if (VOID.has(lower)) return
    const svg = inSvg || lower === "svg"
    if (lower === "style") out.push((el.textContent ?? "").replace(/[<&]/g, ""))
    else if (lower === "textarea") out.push(esc((el as HTMLTextAreaElement).value))
    else {
      for (const child of el.childNodes) {
        if (child.nodeType === 1) ser(child as Element, out, svg)
        else if (child.nodeType === 3) {
          const text = child.nodeValue ?? ""
          if (/\S/.test(text)) out.push(esc(preformatted(el) ? text : text.replace(/\s{2,}/g, " ")))
          else if (text) out.push(preformatted(el) ? text : " ")
        }
      }
    }
    out.push(`</${tag}>`)
  }

  // Each root is written inside copies of its ancestors, with hidden
  // placeholders for their other children, so selectors such as
  // `main > section:nth-child(2)` or `.hero + .features` still match.
  const { blocks, extras, floats } = prepared.roots
  const allRoots = [...blocks, ...extras, ...floats]
  const inFlow = allRoots.map((r) => !/^(fixed|absolute)$/.test(getComputedStyle(r).position))
  const rootsIn = new Map<Element, number[]>()
  allRoots.forEach((r, i) => {
    for (let p = r.parentElement; p && p !== body; p = p.parentElement) {
      if (!rootsIn.has(p)) rootsIn.set(p, [])
      rootsIn.get(p)!.push(i)
    }
  })
  // Placeholders hold their place for :nth-child counts and keep what sibling
  // selectors (`.a + .b`, `[data-header] ~ main`) look at: data attributes the
  // CSS uses, and the class unless it is a long utility string far away.
  const placeholder = (sib: Element, neighbour: boolean) => {
    const t = sib.localName.toLowerCase()
    const tag = SKIP.has(t) || t === "iframe" || !/^[a-z][a-z0-9-]*$/.test(t) ? "span" : t
    const cls = sib.getAttribute("class")
    let attrs = cls && (neighbour || cls.length <= 60) ? ` class=${quote(cls)}` : ""
    for (const a of sib.attributes) {
      if (a.name.startsWith("data-") && usedData.has(a.name.toLowerCase())) attrs += a.value ? ` ${a.name}=${quote(a.value)}` : ` ${a.name}`
    }
    return `<${tag}${attrs} data-mw-off>${VOID.has(tag) ? "" : `</${tag}>`}`
  }
  const wrapperStyle = (a: Element, i: number) => {
    const list = rootsIn.get(a)
    if (!list || list.length < 2) return ""
    const s = getComputedStyle(a)
    const px = (v: string) => parseFloat(v) || 0
    const plain =
      s.display === "block" &&
      px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth) === 0 &&
      (s.backgroundColor === "rgba(0, 0, 0, 0)" || s.backgroundColor === "transparent") &&
      s.backgroundImage === "none" &&
      s.boxShadow === "none" &&
      s.transform === "none" &&
      s.filter === "none" &&
      s.overflowX === "visible" &&
      s.overflowY === "visible"
    // A plain wrapper adds nothing visual, so it can step out of the layout and
    // let sticky headers and margins behave as in the original.
    if (plain) return "display:contents!important"
    // The wrapper's own top and bottom spacing belong to its first and last
    // in-flow roots; fixed or absolute roots (a fixed header) take no space,
    // so their copies of the wrapper collapse entirely.
    const flow = list.filter((j) => inFlow[j])
    let style = "min-height:0!important;"
    if (flow[0] !== i) {
      style += `margin-top:0!important;border-top-width:0!important;padding-top:${px(s.rowGap) > 0 && inFlow[i] ? s.rowGap : "0"}!important;`
    }
    if (flow[flow.length - 1] !== i) style += "margin-bottom:0!important;border-bottom-width:0!important;padding-bottom:0!important;"
    return style
  }
  const serRoot = (root: Element, index: number) => {
    const chain: Element[] = []
    for (let p = root.parentElement; p && p !== body && p !== html; p = p.parentElement) chain.unshift(p)
    const parents = [body, ...chain]
    const path = [...chain, root]
    const out: string[] = []
    const closers: { tag: string; after: Element[] }[] = []
    path.forEach((child, level) => {
      const siblings = [...parents[level].children]
      const at = siblings.indexOf(child)
      siblings.slice(0, at).forEach((s, j) => out.push(placeholder(s, j === at - 1)))
      if (level < path.length - 1) {
        out.push(`<${child.localName}${attrs(child, wrapperStyle(child, index))}>`)
        closers.push({ tag: child.localName, after: siblings.slice(at + 1) })
      } else {
        ser(root, out, false)
        siblings.slice(at + 1).forEach((s, j) => out.push(placeholder(s, j === 0)))
      }
    })
    for (let c = closers.length - 1; c >= 0; c--) {
      out.push(`</${closers[c].tag}>`)
      closers[c].after.forEach((s, j) => out.push(placeholder(s, j === 0)))
    }
    return out.join("")
  }
  const labelOf = (el: Element, index: number) => {
    const tag = el.localName
    if (tag === "header" || tag === "nav" || (index === 0 && el.querySelector("nav"))) return "Header"
    if (tag === "footer") return "Footer"
    const heading = el.querySelector("h1,h2,h3")?.textContent?.replace(/\s+/g, " ").trim()
    if (heading) return heading.slice(0, 60)
    const named = el.getAttribute("aria-label") || el.id || (typeof el.className === "string" ? el.className.split(/\s+/)[0] : "")
    return (named || tag).slice(0, 60)
  }

  const sections = blocks.map((b, i) => ({ label: labelOf(b, i), html: serRoot(b, i) }))
  const tail = [...extras, ...floats]
  if (tail.length) {
    sections.push({
      label: "Floating buttons and menus",
      html: tail.map((r, j) => serRoot(r, blocks.length + j)).join(""),
    })
  }

  // Symbols and gradients the markup references by id but which live elsewhere.
  const defs: string[] = []
  for (const id of refs) {
    if (ids.has(id)) continue
    const target = document.getElementById(id)
    if (target && target.closest("svg")) ser(target, defs, true)
  }

  // Repeated icons: identical SVGs without class-styled internals are drawn
  // once as a symbol and referenced with <use>, which keeps currentColor.
  const SVG = /<svg(\s[^>]*)?>((?:(?!<svg[\s>])[\s\S])*?)<\/svg>/g
  const counts = new Map<string, number>()
  const svgKey = (attrs: string, inner: string) => `${attrs.match(/\sviewBox=["']([^"']*)/i)?.[1] ?? ""}|${inner}`
  for (const s of sections) {
    for (const m of s.html.matchAll(SVG)) {
      if (m[2].length < 300 || /\sclass=/.test(m[2]) || /\sid=/.test(m[2])) continue
      const k = svgKey(m[1] ?? "", m[2])
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }
  const symbols = new Map<string, string>()
  for (const [k, n] of counts) if (n > 1) symbols.set(k, `mw-s${symbols.size + 1}`)
  for (const s of sections) {
    if (!symbols.size) break
    s.html = s.html.replace(SVG, (match, attrs: string | undefined, inner: string) => {
      const id = symbols.get(svgKey(attrs ?? "", inner))
      return id ? `<svg${attrs ?? ""}><use href="#${id}"></use></svg>` : match
    })
  }
  for (const [k, id] of symbols) {
    const viewBox = k.slice(0, k.indexOf("|"))
    defs.push(`<symbol id="${id}"${viewBox ? ` viewBox="${escAttr(viewBox)}"` : ""}>${k.slice(k.indexOf("|") + 1)}</symbol>`)
  }
  stats.svgSymbols = symbols.size

  const markup = sections.map((s) => s.html).join("")
  const usage = (prepared.css + markup).toLowerCase()
  // Only the unicode-range subsets that cover characters on the page (Google
  // Fonts ships a dozen per weight: latin, cyrillic, greek, vietnamese...).
  const chars = new Set<number>()
  for (const ch of (body.textContent ?? "").slice(0, 300_000)) chars.add(ch.codePointAt(0)!)
  const covers = (text: string) => {
    const range = text.match(/unicode-range:\s*([^;}]+)/i)
    if (!range) return true
    return range[1].split(",").some((part) => {
      const m = part.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i)
      if (!m) return true
      const lo = parseInt(m[1].replace(/\?/g, "0"), 16)
      const hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, "f"), 16)
      for (const c of chars) if (c >= lo && c <= hi) return true
      return false
    })
  }
  const fonts = prepared.fontFaces
    .filter((f) => f.family && usage.includes(f.family.toLowerCase()) && covers(f.text))
    .map((f) => f.text)
  const frames = prepared.keyframes.filter((k) => usage.includes(k.name.toLowerCase())).map((k) => k.text)
  // Drop CSSOM's cosmetic whitespace, leaving quoted strings alone.
  const minify = (css: string) =>
    css
      .split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)
      .map((part, i) => (i % 2 ? part : part.replace(/\s*([{};,>])\s*/g, "$1").replace(/:\s+/g, ":").replace(/;}/g, "}")))
      .join("")
  const dataAttributes = (el: Element) =>
    Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => [a.name, a.value]))

  return {
    sections,
    css: minify([...fonts, prepared.css, ...frames].join("\n")),
    defs: defs.length ? `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0">${defs.join("")}</svg>` : "",
    htmlClass: html.getAttribute("class") ?? "",
    bodyClass: body.getAttribute("class") ?? "",
    htmlAttributes: dataAttributes(html),
    bodyAttributes: dataAttributes(body),
    stats: { ...stats, sections: sections.length, cssBytes: prepared.css.length, htmlBytes: markup.length },
  }
}

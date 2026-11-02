// The behaviour of an exact clone, replayed without the original site's
// JavaScript. The crawler records what the page did (scroll reveals, counters,
// menus, accordions, tabs, header changes on scroll, carousels) as data
// attributes, and this script plays them back.
//
// It is serialized with Function#toString into published pages, so it must
// stay self-contained: no imports and no references to outer variables.
// Recorded values come from page data, so it only ever touches class, style,
// aria-*, data-* and a few boolean attributes.

type Change = [string, "c", string[], string[]] | [string, "s", Record<string, string>, Record<string, string>] | [string, "a", string, string | null, string | null]

// Checked against the DOM in the renderer and the web app. The edge worker
// only embeds the runtime as a string and compiles without DOM types, where
// these fall back to `any`.
type Doc = typeof globalThis extends { document: infer D } ? D : any
type El = typeof globalThis extends { El: { prototype: infer E } } ? E : any
type Win = typeof globalThis extends { window: infer W } ? W : any
type Evt = typeof globalThis extends { MouseEvent: { prototype: infer E } } ? E : any
type Entry = typeof globalThis extends { IntersectionObserverEntry: { prototype: infer E } } ? E : any

export function exactRuntime(d: Doc) {
  const w = d.defaultView as Win
  const all = (selector: string): El[] => Array.prototype.slice.call(d.querySelectorAll(selector))
  const root = d.documentElement
  const SAFE_ATTR = /^(hidden|open|checked|selected|aria-[a-z-]+|data-mw-off|data-(?!mw-)[a-z0-9-]+)$/

  // Keys name recorded elements. Wrappers copied into several sections share a
  // key, so a change applies to every copy; "b" and "h" are <body> and <html>.
  function byKey(k: string): El[] {
    if (k === "b") return [d.body]
    if (k === "h") return [root]
    return /^\d+$/.test(k) ? Array.prototype.slice.call(d.querySelectorAll('[data-mw-k="' + k + '"]')) : []
  }
  function parse<T>(value: string | null): T | null {
    try {
      return value ? (JSON.parse(value) as T) : null
    } catch {
      return null
    }
  }
  function tokens(list: unknown): string[] {
    return Array.isArray(list) ? list.filter((t): t is string => typeof t === "string" && /^[^\s]+$/.test(t)) : []
  }

  // Entrance animations ---------------------------------------------------
  function countUp(el: El) {
    const final = el.getAttribute("data-mw-count") || el.textContent || ""
    const m = final.match(/^(\D*)([\d,.]*\d)(.*)$/)
    if (!m) return
    const digits = m[2]
    const decimals = (digits.split(".")[1] || "").length
    const target = parseFloat(digits.replace(/,/g, ""))
    const grouped = digits.indexOf(",") >= 0
    if (!isFinite(target)) return
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1600)
      const value = target * (1 - Math.pow(1 - p, 3))
      let text = value.toFixed(decimals)
      if (grouped) text = Number(text).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      el.textContent = m[1] + text + m[3]
      if (p < 1) w.requestAnimationFrame(tick)
      else el.textContent = final
    }
    w.requestAnimationFrame(tick)
  }

  function reveal(el: El, order: number) {
    if (el.hasAttribute("data-mw-reveal")) {
      el.style.setProperty("--mw-d", Math.min(order, 6) * 0.08 + "s")
      el.classList.add("mw-in")
      w.setTimeout(() => el.classList.add("mw-done"), 1800)
    }
    if (el.hasAttribute("data-aos")) el.classList.add("aos-animate")
    const wow = el.getAttribute("data-mw-wow")
    if (wow !== null) {
      const delay = el.getAttribute("data-wow-delay")
      const duration = el.getAttribute("data-wow-duration")
      if (delay) el.style.animationDelay = delay
      if (duration) el.style.animationDuration = duration
      tokens(wow.split(" ")).forEach((t) => el.classList.add(t))
      el.classList.add("mw-in")
    }
    if (el.hasAttribute("data-mw-count")) countUp(el)
  }

  const animated = all("[data-mw-reveal],[data-aos],[data-mw-wow],[data-mw-count]")
  if ("IntersectionObserver" in w) {
    const io = new w.IntersectionObserver(
      (entries: Entry[]) => {
        let order = 0
        entries.forEach((entry: Entry) => {
          if (!entry.isIntersecting) return
          io.unobserve(entry.target)
          reveal(entry.target as El, order++)
        })
      },
      { rootMargin: "0px 0px -6% 0px" },
    )
    animated.forEach((el) => io.observe(el))
  } else {
    animated.forEach((el) => reveal(el, 0))
  }

  // Recorded clicks: menus, accordions, tabs, dropdowns ---------------------
  function current(el: El, change: Change): boolean {
    if (change[1] === "c") {
      return tokens(change[3]).every((t) => el.classList.contains(t)) && !tokens(change[2]).some((t) => el.classList.contains(t))
    }
    if (change[1] === "s") {
      const after = change[3] || {}
      return Object.keys(after).every((p) => el.style.getPropertyValue(p) === after[p])
    }
    return el.getAttribute(change[2]) === change[4]
  }

  function applyChange(el: El, change: Change, forward: boolean) {
    if (change[1] === "c") {
      const remove = tokens(forward ? change[2] : change[3])
      const add = tokens(forward ? change[3] : change[2])
      remove.forEach((t) => el.classList.remove(t))
      add.forEach((t) => el.classList.add(t))
    } else if (change[1] === "s") {
      const values = (forward ? change[3] : change[2]) || {}
      Object.keys(values).forEach((p) => {
        if (!/^-{0,2}[a-z][a-z0-9-]*$/i.test(p)) return
        if (values[p]) el.style.setProperty(p, String(values[p]))
        else el.style.removeProperty(p)
      })
    } else if (SAFE_ATTR.test(change[2])) {
      const value = forward ? change[4] : change[3]
      if (value === null || value === undefined) el.removeAttribute(change[2])
      else el.setAttribute(change[2], String(value))
    }
  }

  d.addEventListener("click", (event: Evt) => {
    const target = event.target as El | null
    const trigger = target && target.closest ? (target.closest("[data-mw-click]") as El | null) : null
    if (!trigger) return
    const recipe = parse<{ m: string; c: Change[] }>(trigger.getAttribute("data-mw-click"))
    if (!recipe || !Array.isArray(recipe.c)) return
    const href = trigger.getAttribute("href")
    if (trigger.tagName === "A" && (!href || href === "#")) event.preventDefault()
    const pairs: [El, Change][] = []
    recipe.c.forEach((c) => {
      if (Array.isArray(c) && typeof c[0] === "string") byKey(c[0]).forEach((el) => pairs.push([el, c]))
    })
    // Toggles undo themselves when everything is already in the "after" state.
    const forward = recipe.m !== "t" || !pairs.every(([el, c]) => current(el, c))
    pairs.forEach(([el, c]) => applyChange(el, c, forward))
  })

  // Class changes once the page is scrolled (e.g. a header that turns solid) --
  const scrolled = Array.prototype.slice
    .call(d.querySelectorAll("[data-mw-scroll]"))
    .map((el: El) => [el, parse<{ y: number; b: string[]; a: string[] }>(el.getAttribute("data-mw-scroll"))] as const)
    .filter((p: readonly [El, unknown]) => p[1] !== null) as (readonly [El, { y: number; b: string[]; a: string[] }])[]
  if (scrolled.length) {
    let queued = false
    const update = () => {
      queued = false
      scrolled.forEach(([el, s]) => {
        const past = w.scrollY >= (Number(s.y) || 0)
        tokens(past ? s.b : s.a).forEach((t) => el.classList.remove(t))
        tokens(past ? s.a : s.b).forEach((t) => el.classList.add(t))
      })
    }
    w.addEventListener(
      "scroll",
      () => {
        if (!queued) {
          queued = true
          w.requestAnimationFrame(update)
        }
      },
      { passive: true },
    )
    update()
  }

  // Classes the site's script set at narrow widths (e.g. a "mobile" menu) ---
  const responsive = Array.prototype.slice
    .call(d.querySelectorAll("[data-mw-media]"))
    .map((el: El) => [el, parse<{ max: number; a: string[]; b: string[] }>(el.getAttribute("data-mw-media"))] as const)
    .filter((p: readonly [El, unknown]) => p[1] !== null) as (readonly [El, { max: number; a: string[]; b: string[] }])[]
  if (responsive.length) {
    const sync = () =>
      responsive.forEach(([el, m]) => {
        const narrow = w.innerWidth <= (Number(m.max) || 767)
        tokens(narrow ? m.b : m.a).forEach((t) => el.classList.remove(t))
        tokens(narrow ? m.a : m.b).forEach((t) => el.classList.add(t))
      })
    w.addEventListener("resize", sync)
    sync()
  }

  // Carousels: native scroll-snap strips with working arrows and autoplay ---
  function step(track: El, dir: number) {
    const slide = track.firstElementChild as El | null
    const by = slide ? slide.getBoundingClientRect().width : track.clientWidth
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4
    if (dir > 0 && atEnd) track.scrollTo({ left: 0 })
    else if (dir < 0 && track.scrollLeft <= 4) track.scrollTo({ left: track.scrollWidth })
    else track.scrollBy({ left: dir * by })
  }
  d.addEventListener("click", (event: Evt) => {
    const target = event.target as El | null
    const arrow = target && target.closest ? (target.closest("[data-mw-next],[data-mw-prev]") as El | null) : null
    if (!arrow) return
    const id = arrow.getAttribute("data-mw-next") || arrow.getAttribute("data-mw-prev") || ""
    const track = /^[\w-]+$/.test(id) ? (d.querySelector('[data-mw-carousel="' + id + '"]') as El | null) : null
    if (!track) return
    event.preventDefault()
    step(track, arrow.hasAttribute("data-mw-next") ? 1 : -1)
  })
  all("[data-mw-carousel][data-mw-autoplay]").forEach((track) => {
    let paused = false
    track.addEventListener("pointerenter", () => (paused = true))
    track.addEventListener("pointerleave", () => (paused = false))
    w.setInterval(() => {
      if (!paused && !d.hidden) step(track, 1)
    }, Math.max(2000, Number(track.getAttribute("data-mw-autoplay")) || 4000))
  })

  root.classList.add("mw-js")
}

/** Apply the width-dependent classes of an exact clone, for the editor's preview frame. */
export function syncMediaClasses(d: Doc) {
  const width = (d.defaultView as Win)?.innerWidth ?? 1440
  ;(Array.prototype.slice.call(d.querySelectorAll("[data-mw-media]")) as El[]).forEach((el) => {
    let m: { max?: number; a?: string[]; b?: string[] }
    try {
      m = JSON.parse(el.getAttribute("data-mw-media") ?? "")
    } catch {
      return
    }
    const narrow = width <= (Number(m.max) || 767)
    const words = (list: unknown) => (Array.isArray(list) ? list.filter((t): t is string => typeof t === "string" && /^\S+$/.test(t)) : [])
    words(narrow ? m.b : m.a).forEach((t) => el.classList.remove(t))
    words(narrow ? m.a : m.b).forEach((t) => el.classList.add(t))
  })
}

/**
 * The runtime as an inline script for published pages. Bundlers that keep
 * function names (esbuild in wrangler) wrap inner functions in `__name(...)`
 * calls, so the script brings its own no-op `__name`.
 */
export const EXACT_RUNTIME_SCRIPT = `(function(){var __name=function(f){return f};(${exactRuntime.toString()})(document)})();`

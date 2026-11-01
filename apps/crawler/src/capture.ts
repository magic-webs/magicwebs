import { chromium, type Browser, type Page } from "playwright"

import { isPublicUrl } from "./safety"

export type Capture = {
  finalUrl: string
  html: string
  /** Desktop page in 1440×1600 slices from the top, JPEG. */
  desktopSlices: Uint8Array[]
  /** First mobile screen at 390px wide, JPEG. */
  mobile: Uint8Array
  blocks: unknown[]
  globals: unknown
}

const DESKTOP = { width: 1440, height: 1600 }
const MOBILE = { width: 390, height: 844 }
const MAX_SLICES = 6

let browser: Browser | null = null

async function getBrowser() {
  if (!browser?.isConnected()) {
    browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] })
  }
  return browser
}

async function guard(page: Page) {
  await page.route("**/*", async (route) => {
    if (await isPublicUrl(route.request().url())) await route.continue()
    else await route.abort("blockedbyclient")
  })
}

async function settle(page: Page) {
  // Scroll through the page so lazy-loaded images and scroll animations fire.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8
    for (let y = 0; y < document.body.scrollHeight && y < 30000; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {})
  // Show content that animation libraries keep hidden until it is scrolled into view.
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-play-state:paused!important;transition:none!important}[data-aos],[class*=reveal],[class*=fade]{opacity:1!important;transform:none!important}",
  })
}

export async function capture(url: string): Promise<Capture> {
  if (!(await isPublicUrl(url))) throw new Error("That URL points to a private or unreachable address")

  const b = await getBrowser()
  const context = await b.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 1,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 MagicwebsCloner/1.0",
  })
  try {
    const page = await context.newPage()
    await guard(page)
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })
    if (!response || response.status() >= 400) {
      throw new Error(`The page responded with HTTP ${response?.status() ?? "no response"}`)
    }
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {})
    await settle(page)

    const { blocks, globals } = await page.evaluate(extractInPage)
    const html = await page.content()

    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    const desktopSlices: Uint8Array[] = []
    for (let y = 0; y < height && desktopSlices.length < MAX_SLICES; y += DESKTOP.height) {
      const shot = await page.screenshot({
        type: "jpeg",
        quality: 70,
        fullPage: true,
        clip: { x: 0, y, width: DESKTOP.width, height: Math.min(DESKTOP.height, height - y) },
      })
      desktopSlices.push(new Uint8Array(shot))
    }

    await page.setViewportSize(MOBILE)
    await page.waitForTimeout(500)
    const mobile = new Uint8Array(await page.screenshot({ type: "jpeg", quality: 70 }))

    return { finalUrl: page.url(), html, desktopSlices, mobile, blocks, globals }
  } finally {
    await context.close()
  }
}

/**
 * Runs inside the page. Splits the page into full-width visual blocks and
 * records the computed styles that matter for rebuilding them.
 */
function extractInPage() {
  const vw = window.innerWidth
  const abs = (u: string | null | undefined) => {
    if (!u) return undefined
    try {
      return new URL(u, location.href).href
    } catch {
      return undefined
    }
  }
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden"
  }
  const fullWidth = (el: Element) => {
    const r = el.getBoundingClientRect()
    return visible(el) && r.width >= vw * 0.85 && r.height >= 40
  }

  function blocksOf(el: Element, depth = 0): Element[] {
    const kids = [...el.children].filter(fullWidth)
    if (depth > 8) return [el]
    if (kids.length === 1) return blocksOf(kids[0], depth + 1)
    if (kids.length >= 2) {
      return kids.flatMap((k) => {
        const inner = [...k.children].filter(fullWidth)
        return inner.length >= 2 && k.getBoundingClientRect().height > window.innerHeight * 1.5
          ? blocksOf(k, depth + 1)
          : [k]
      })
    }
    return [el]
  }

  const bgImage = (el: Element) => {
    const m = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)
    return m ? abs(m[1]) : undefined
  }
  const font = (el: Element) => {
    const s = getComputedStyle(el)
    return { family: s.fontFamily.split(",")[0].replace(/["']/g, "").trim(), size: s.fontSize, weight: s.fontWeight, color: s.color }
  }
  const text = (el: Element, max = 300) => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, max)

  const fontCounts: Record<string, number> = {}
  const colorCounts: Record<string, number> = {}

  const blocks = blocksOf(document.body).slice(0, 40).map((block) => {
    const r = block.getBoundingClientRect()
    const s = getComputedStyle(block)
    const headings = [...block.querySelectorAll("h1,h2,h3,h4")].filter(visible).slice(0, 12).map((h) => {
      const f = font(h)
      fontCounts[`heading:${f.family}`] = (fontCounts[`heading:${f.family}`] ?? 0) + 1
      return { tag: h.tagName.toLowerCase(), text: text(h, 200), ...f }
    })
    const paragraphs = [...block.querySelectorAll("p,li")].filter(visible).slice(0, 16).map((p) => {
      const f = font(p)
      fontCounts[`body:${f.family}`] = (fontCounts[`body:${f.family}`] ?? 0) + 1
      colorCounts[f.color] = (colorCounts[f.color] ?? 0) + 1
      return text(p)
    })
    const links = [...block.querySelectorAll("a,button")].filter(visible).slice(0, 20).map((a) => {
      const ls = getComputedStyle(a)
      const filled = ls.backgroundColor !== "rgba(0, 0, 0, 0)" && ls.backgroundColor !== "transparent"
      if (filled) colorCounts[`button:${ls.backgroundColor}`] = (colorCounts[`button:${ls.backgroundColor}`] ?? 0) + 1
      return {
        text: text(a, 80),
        href: abs(a.getAttribute("href")),
        button: filled || ls.borderStyle !== "none" ? { bg: ls.backgroundColor, color: ls.color, radius: ls.borderRadius } : undefined,
      }
    })
    const images = [...block.querySelectorAll("img,svg,video")]
      .filter(visible)
      .slice(0, 24)
      .map((img) => {
        const ir = img.getBoundingClientRect()
        if (img instanceof HTMLImageElement) {
          return { src: abs(img.currentSrc || img.src), alt: img.alt, w: Math.round(ir.width), h: Math.round(ir.height) }
        }
        if (img instanceof HTMLVideoElement) {
          return { video: true, poster: abs(img.poster), w: Math.round(ir.width), h: Math.round(ir.height) }
        }
        return { svg: true, w: Math.round(ir.width), h: Math.round(ir.height) }
      })
    const animated = [...block.querySelectorAll("*")]
      .slice(0, 400)
      .some((el) => el.hasAttribute("data-aos") || getComputedStyle(el).animationName !== "none")
    colorCounts[`bg:${s.backgroundColor}`] = (colorCounts[`bg:${s.backgroundColor}`] ?? 0) + 1
    return {
      tag: block.tagName.toLowerCase(),
      id: block.id || undefined,
      className: typeof block.className === "string" ? block.className.slice(0, 120) : undefined,
      top: Math.round(r.top + window.scrollY),
      height: Math.round(r.height),
      background: s.backgroundColor,
      backgroundImage: bgImage(block),
      gradient: s.backgroundImage.includes("gradient") ? s.backgroundImage.slice(0, 200) : undefined,
      color: s.color,
      paddingTop: s.paddingTop,
      textAlign: s.textAlign,
      position: s.position,
      headings,
      paragraphs,
      links,
      images,
      animated,
    }
  })

  const bodyStyle = getComputedStyle(document.body)
  return {
    blocks,
    globals: {
      title: document.title,
      bodyBackground: bodyStyle.backgroundColor,
      bodyColor: bodyStyle.color,
      bodyFont: bodyStyle.fontFamily,
      fontUsage: fontCounts,
      colorUsage: colorCounts,
      pageHeight: document.documentElement.scrollHeight,
    },
  }
}

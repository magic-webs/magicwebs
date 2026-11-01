import { renderToReadableStream } from "react-dom/server"

import type { PageDoc } from "@magicwebs/page-schema"

import { ANIMATION_SCRIPT, fontHref, pageCss } from "./css"
import { PageRenderer, safeSrc } from "./index"

export type RenderOptions = {
  /** Absolute URL of the page, used for canonical and social tags. */
  url: string
}

function Document({ doc, url }: { doc: PageDoc } & RenderOptions) {
  const fonts = fontHref(doc.theme)
  const ogImage = safeSrc(doc.meta.ogImage)
  const favicon = safeSrc(doc.meta.favicon)
  return (
    <html lang={doc.meta.lang ?? "en"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{doc.meta.title}</title>
        <meta name="description" content={doc.meta.description} />
        <link rel="canonical" href={url} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={doc.meta.title} />
        <meta property="og:description" content={doc.meta.description} />
        <meta property="og:url" content={url} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta name="twitter:card" content={ogImage ? "summary_large_image" : "summary"} />
        {favicon && <link rel="icon" href={favicon} />}
        {fonts && <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />}
        {fonts && <link rel="stylesheet" href={fonts} />}
        <style dangerouslySetInnerHTML={{ __html: `html,body{margin:0}${pageCss(doc.theme)}` }} />
        <script dangerouslySetInnerHTML={{ __html: `document.documentElement.classList.add("mw-js")` }} />
      </head>
      <body>
        <PageRenderer doc={doc} />
        <script dangerouslySetInnerHTML={{ __html: ANIMATION_SCRIPT }} />
      </body>
    </html>
  )
}

/** Server-render a published page to a complete, SEO-ready HTML stream. */
export function renderPage(doc: PageDoc, options: RenderOptions): Promise<ReadableStream> {
  return renderToReadableStream(<Document doc={doc} {...options} />)
}

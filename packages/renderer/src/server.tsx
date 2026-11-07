import { renderToReadableStream } from "react-dom/server"

import type { PageDoc } from "@magicwebs/page-schema"

import { ANIMATION_SCRIPT, BLOG_CSS, fontHref } from "./css"
import type { BlogCard } from "./blog"
import { customScript, documentCss, isExact, PageRenderer, rootAttributes, safeSrc, type MainContent } from "./index"
import { EXACT_RUNTIME_SCRIPT } from "./runtime"

export type RenderOptions = {
  /** Absolute URL of the page, used for canonical and social tags. */
  url: string
  /** Content placed between the page's sections, e.g. a blog post between the site's header and footer. */
  main?: MainContent
  /** "article" for a blog post. */
  type?: "website" | "article"
  /** Extra tags for the head, e.g. the blog's RSS feed. */
  feed?: { title: string; href: string }
  /** The site's live blog posts, newest first, for a "Latest posts" section. */
  posts?: BlogCard[]
}

function Document({ doc, url, main, type = "website", feed, posts }: { doc: PageDoc } & RenderOptions) {
  const fonts = fontHref(doc.theme)
  const ogImage = safeSrc(doc.meta.ogImage)
  const favicon = safeSrc(doc.meta.favicon)
  const exact = isExact(doc)
  const script = customScript(doc)
  return (
    <html lang={doc.meta.lang ?? "en"} className={doc.styles?.htmlClass || undefined} {...rootAttributes(doc, "html")}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{doc.meta.title}</title>
        <meta name="description" content={doc.meta.description} />
        <link rel="canonical" href={url} />
        <meta property="og:type" content={type} />
        {feed && <link rel="alternate" type="application/rss+xml" title={feed.title} href={feed.href} />}
        <meta property="og:title" content={doc.meta.title} />
        <meta property="og:description" content={doc.meta.description} />
        <meta property="og:url" content={url} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta name="twitter:card" content={ogImage ? "summary_large_image" : "summary"} />
        {favicon && <link rel="icon" href={favicon} />}
        {fonts && <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />}
        {fonts && <link rel="stylesheet" href={fonts} />}
        <style dangerouslySetInnerHTML={{ __html: documentCss(doc) + (main ? BLOG_CSS : "") }} />
        <script dangerouslySetInnerHTML={{ __html: `document.documentElement.classList.add("mw-js")` }} />
      </head>
      <body className={doc.styles?.bodyClass || undefined} {...rootAttributes(doc, "body")}>
        <PageRenderer doc={doc} main={main} posts={posts && { posts, preview: false }} />
        <script dangerouslySetInnerHTML={{ __html: ANIMATION_SCRIPT }} />
        {exact && <script dangerouslySetInnerHTML={{ __html: EXACT_RUNTIME_SCRIPT }} />}
        {script && <script dangerouslySetInnerHTML={{ __html: script }} />}
      </body>
    </html>
  )
}

/** Server-render a published page to a complete, SEO-ready HTML stream. */
export function renderPage(doc: PageDoc, options: RenderOptions): Promise<ReadableStream> {
  return renderToReadableStream(<Document doc={doc} {...options} />)
}

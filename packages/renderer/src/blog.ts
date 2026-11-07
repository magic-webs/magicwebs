import type { PageDoc, Section } from "@magicwebs/page-schema"

// Blog pages are the site's own pages around a post: the home page's header
// and footer, its theme and stylesheet, with the post list or the article in
// between (see MainContent). Nothing here is trusted: every string is escaped,
// and the post body (HTML made from Markdown) is sanitized when it renders.

export type BlogCard = {
  slug: string
  title: string
  excerpt?: string
  cover?: string
  author?: string
  tags: string[]
  publishedAt: number
}

export type BlogPost = BlogCard & { html: string; coverAlt?: string }

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

const date = (time: number, lang: string) => {
  try {
    return new Date(time).toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
  } catch {
    return new Date(time).toISOString().slice(0, 10)
  }
}

function isHeader(section: Section): boolean {
  if (section.type === "navbar") return true
  if (section.type !== "html") return false
  return /header|nav/i.test(section.props.label ?? "") || /<(header|nav)\b/i.test(section.props.html.slice(0, 4000))
}

function isFooter(section: Section): boolean {
  if (section.type === "footer") return true
  if (section.type !== "html") return false
  return /footer/i.test(section.props.label ?? "") || /<footer\b/i.test(section.props.html)
}

/**
 * The home page reduced to its header and footer, with the blog page's own
 * title and description, and where the blog content goes between them.
 */
export function blogShell(
  home: PageDoc,
  meta: { title: string; description: string; ogImage?: string },
): { doc: PageDoc; after: number } {
  const visible = home.sections.filter((s) => !s.hidden)
  const first = visible[0]
  const last = visible[visible.length - 1]
  const header = first && isHeader(first) ? [first] : []
  const footer = last && last !== first && isFooter(last) ? [last] : []
  return {
    doc: {
      ...home,
      meta: { ...home.meta, title: meta.title, description: meta.description, ogImage: meta.ogImage ?? home.meta.ogImage },
      sections: [...header, ...footer],
      // A post page runs none of the home page's own behaviour.
      script: undefined,
    },
    after: header.length,
  }
}

export function blogIndexHtml(posts: BlogCard[], options: { title: string; intro?: string; lang?: string }): string {
  const lang = options.lang ?? "en"
  const cards = posts
    .map(
      (post) => `<a class="mw-blog-card" href="/blog/${encodeURIComponent(post.slug)}">${
        post.cover ? `<img src="${escape(post.cover)}" alt="" loading="lazy">` : ""
      }<div class="mw-blog-card-body"><p class="mw-blog-meta">${escape(date(post.publishedAt, lang))}${
        post.tags[0] ? ` · ${escape(post.tags[0])}` : ""
      }</p><h2>${escape(post.title)}</h2>${post.excerpt ? `<p>${escape(post.excerpt)}</p>` : ""}</div></a>`,
    )
    .join("")
  return `<section class="mw-blog"><div class="mw-blog-wrap"><header class="mw-blog-head"><h1>${escape(options.title)}</h1>${
    options.intro ? `<p class="mw-blog-lead">${escape(options.intro)}</p>` : ""
  }</header>${posts.length ? `<div class="mw-blog-list">${cards}</div>` : `<p class="mw-blog-empty">No posts yet.</p>`}</div></section>`
}

export function blogPostHtml(post: BlogPost, options: { lang?: string } = {}): string {
  const lang = options.lang ?? "en"
  const meta = [date(post.publishedAt, lang), post.author].filter(Boolean).map((part) => escape(part!)).join(" · ")
  return `<article class="mw-blog"><div class="mw-blog-article"><a class="mw-blog-back" href="/blog">← All posts</a><p class="mw-blog-meta">${meta}</p><h1>${escape(
    post.title,
  )}</h1>${post.excerpt ? `<p class="mw-blog-lead">${escape(post.excerpt)}</p>` : ""}${
    post.cover ? `<img class="mw-blog-cover" src="${escape(post.cover)}" alt="${escape(post.coverAlt ?? "")}">` : ""
  }<div class="mw-prose">${post.html}</div>${
    post.tags.length ? `<ul class="mw-blog-tags">${post.tags.map((tag) => `<li>${escape(tag)}</li>`).join("")}</ul>` : ""
  }</div></article>`
}

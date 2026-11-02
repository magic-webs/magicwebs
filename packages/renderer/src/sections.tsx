import type { CSSProperties, ReactNode } from "react"

import { sanitizeCss, sanitizeHtml, type Element, type Image, type Link, type Section, type SectionOf, type SectionType } from "@magicwebs/page-schema"

import { cssValue } from "./css"

// Crawled and AI-written content is untrusted: only let through URL schemes
// that cannot execute script.
export function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined
  const trimmed = href.trim()
  if (/^(https?:|mailto:|tel:|#|\/|\?)/i.test(trimmed)) return trimmed
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return "#"
}

export function safeSrc(src: string | undefined): string | undefined {
  if (!src) return undefined
  const trimmed = src.trim()
  if (/^(https?:|\/|data:image\/(png|jpe?g|gif|webp|avif);)/i.test(trimmed)) return trimmed
  return undefined
}

/** Render "**word**" as a highlighted span; everything else stays plain text. */
export function Rich({ text }: { text: string | undefined }) {
  if (!text) return null
  if (!text.includes("**")) return text
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <span key={i} className="mw-hl">
        {part.slice(2, -2)}
      </span>
    ) : (
      part
    ),
  )
}

function Img({ image, className }: { image: Image | undefined; className?: string }) {
  const src = safeSrc(image?.src)
  if (!image || !src) return null
  return (
    <img
      className={className}
      src={src}
      alt={image.alt}
      width={image.width}
      height={image.height}
      loading="lazy"
      decoding="async"
    />
  )
}

function Btn({ link, variant }: { link: Link | undefined; variant: "primary" | "secondary" }) {
  if (!link?.label) return null
  return (
    <a className={`mw-btn mw-btn-${variant}`} href={safeHref(link.href)}>
      {link.label}
    </a>
  )
}

function Actions({ primary, secondary }: { primary?: Link; secondary?: Link }) {
  if (!primary && !secondary) return null
  return (
    <div className="mw-actions">
      <Btn link={primary} variant="primary" />
      <Btn link={secondary} variant="secondary" />
    </div>
  )
}

function Heading({
  eyebrow,
  heading,
  subheading,
  level = 2,
  center,
}: {
  eyebrow?: string
  heading?: string
  subheading?: string
  level?: 1 | 2
  center?: boolean
}) {
  if (!eyebrow && !heading && !subheading) return null
  const H = level === 1 ? "h1" : "h2"
  return (
    <div className={`mw-stack${center ? " mw-center" : ""}`}>
      {eyebrow && (
        <div className="mw-eyebrow">
          <Rich text={eyebrow} />
        </div>
      )}
      {heading && (
        <H className={level === 1 ? "mw-h1" : "mw-h2"}>
          <Rich text={heading} />
        </H>
      )}
      {subheading && <p className="mw-lead">{subheading}</p>}
    </div>
  )
}

function Shell({ section, children, className = "" }: { section: Section; children: ReactNode; className?: string }) {
  const s = section.style ?? {}
  const style: CSSProperties & Record<string, string | number | undefined> = {
    background: s.background,
    color: s.color,
    "--mw-py": s.paddingY !== undefined ? `${s.paddingY}px` : undefined,
  }
  const bgSrc = safeSrc(s.backgroundImage)
  if (bgSrc) style.backgroundImage = `url("${encodeURI(bgSrc)}")`
  return (
    <section
      id={section.id}
      data-section-id={section.id}
      data-section-type={section.type}
      data-align={s.align}
      data-animate={section.animation && section.animation !== "none" ? section.animation : undefined}
      className={`mw-section ${s.fullBleed ? "mw-full " : ""}${className}`}
      style={style}
    >
      {s.overlay && <div className="mw-overlay" style={{ background: s.overlay }} />}
      <div className="mw-container">{children}</div>
    </section>
  )
}

function Navbar({ section }: { section: SectionOf<"navbar"> }) {
  const p = section.props
  const s = section.style ?? {}
  return (
    <header
      id={section.id}
      data-section-id={section.id}
      data-section-type="navbar"
      data-sticky={p.sticky ? "true" : undefined}
      className="mw-nav"
      style={{ background: s.background, color: s.color }}
    >
      <nav className="mw-nav-inner">
        <a className="mw-brand" href="#">
          <Img image={p.logo} />
          {p.brand && <span>{p.brand}</span>}
        </a>
        <ul className="mw-nav-links">
          {p.links.map((link, i) => (
            <li key={i}>
              <a href={safeHref(link.href)}>{link.label}</a>
            </li>
          ))}
        </ul>
        <div className="mw-nav-cta">
          <Btn link={p.cta} variant="primary" />
        </div>
        {(p.links.length > 0 || p.cta) && (
          <details className="mw-menu">
            <summary aria-label="Menu">
              <span />
              <span />
              <span />
            </summary>
            <div className="mw-menu-panel">
              {p.links.map((link, i) => (
                <a key={i} href={safeHref(link.href)}>
                  {link.label}
                </a>
              ))}
              <Btn link={p.cta} variant="primary" />
            </div>
          </details>
        )}
      </nav>
    </header>
  )
}

function Hero({ section }: { section: SectionOf<"hero"> }) {
  const p = section.props
  const text = (center: boolean) => (
    <div className={`mw-stack${center ? " mw-center" : ""}`} style={{ gap: 20 }}>
      {p.eyebrow && (
        <div className="mw-eyebrow">
          <Rich text={p.eyebrow} />
        </div>
      )}
      <h1 className="mw-h1">
        <Rich text={p.heading} />
      </h1>
      {p.subheading && <p className="mw-lead">{p.subheading}</p>}
      <Actions primary={p.primaryCta} secondary={p.secondaryCta} />
    </div>
  )

  if (p.layout === "split" || p.layout === "split-reverse") {
    return (
      <Shell section={section}>
        <div className={`mw-split${p.layout === "split-reverse" ? " mw-reverse" : ""}`}>
          {text(false)}
          <Img image={p.image} className="mw-media" />
        </div>
      </Shell>
    )
  }

  if (p.layout === "image-background") {
    const withBg = {
      ...section,
      style: {
        backgroundImage: p.image?.src,
        overlay: "rgba(0,0,0,.45)",
        color: "#fff",
        paddingY: 160,
        ...section.style,
      },
    }
    return <Shell section={withBg}>{text(true)}</Shell>
  }

  return (
    <Shell section={section}>
      {text(true)}
      {p.image && (
        <div className="mw-media" style={{ marginTop: 56 }}>
          <Img image={p.image} />
        </div>
      )}
    </Shell>
  )
}

function Logos({ section }: { section: SectionOf<"logos"> }) {
  const p = section.props
  return (
    <Shell section={section}>
      {p.title && (
        <p className="mw-muted" style={{ textAlign: "center", fontWeight: 500 }}>
          {p.title}
        </p>
      )}
      <div className="mw-logos" data-monochrome={p.monochrome ? "true" : undefined}>
        {p.logos.map((logo, i) => (
          <Img key={i} image={logo} />
        ))}
      </div>
    </Shell>
  )
}

function mobileCols(value: number | undefined) {
  return Math.min(Math.max(Math.round(value ?? 1) || 1, 1), 2)
}

function Features({ section }: { section: SectionOf<"features"> }) {
  const p = section.props
  const cols = Math.min(Math.max(Math.round(p.columns) || 3, 1), 4)
  return (
    <Shell section={section}>
      <Heading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} center />
      <div
        className="mw-grid"
        style={
          {
            "--mw-cols": p.variant === "list" ? 1 : cols,
            "--mw-mcols": mobileCols(p.mobileColumns),
            marginTop: 56,
          } as CSSProperties
        }
      >
        {p.items.map((item, i) => (
          <div key={i} className={p.variant === "cards" ? "mw-card" : undefined} style={{ textAlign: "left" }}>
            {item.image ? (
              <Img image={item.image} className="mw-media" />
            ) : (
              item.icon && <div className="mw-icon">{item.icon}</div>
            )}
            <h3 className="mw-h3" style={{ marginTop: item.image ? 16 : 0 }}>
              {item.title}
            </h3>
            <p className="mw-muted" style={{ marginTop: 8 }}>
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </Shell>
  )
}

function Content({ section }: { section: SectionOf<"content"> }) {
  const p = section.props
  return (
    <Shell section={section}>
      <div className={`mw-split${p.imagePosition === "left" ? " mw-reverse" : ""}`}>
        <div className="mw-stack" style={{ gap: 18 }}>
          {p.eyebrow && (
            <div className="mw-eyebrow">
              <Rich text={p.eyebrow} />
            </div>
          )}
          <h2 className="mw-h2">
            <Rich text={p.heading} />
          </h2>
          <p className="mw-muted" style={{ fontSize: "1.05rem", whiteSpace: "pre-line" }}>
            {p.body}
          </p>
          {p.bullets && p.bullets.length > 0 && (
            <ul className="mw-checks">
              {p.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
          {p.stats && p.stats.length > 0 && (
            <div className="mw-inline-stats">
              {p.stats.map((stat, i) => (
                <div key={i}>
                  <div className="mw-inline-stat">{stat.value}</div>
                  <div className="mw-muted">{stat.label}</div>
                </div>
              ))}
            </div>
          )}
          {p.cta && (
            <div className="mw-actions">
              <Btn link={p.cta} variant="primary" />
            </div>
          )}
        </div>
        <Img image={p.image} className="mw-media" />
      </div>
    </Shell>
  )
}

function Stats({ section }: { section: SectionOf<"stats"> }) {
  const p = section.props
  return (
    <Shell section={section}>
      <Heading heading={p.heading} center />
      <div
        className="mw-grid"
        style={{ "--mw-cols": Math.min(p.items.length, 4), marginTop: p.heading ? 48 : 0, textAlign: "center" } as CSSProperties}
      >
        {p.items.map((item, i) => (
          <div key={i}>
            <div className="mw-stat-value">{item.value}</div>
            <div className="mw-muted">{item.label}</div>
          </div>
        ))}
      </div>
    </Shell>
  )
}

function Testimonials({ section }: { section: SectionOf<"testimonials"> }) {
  const p = section.props
  return (
    <Shell section={section}>
      <Heading heading={p.heading} subheading={p.subheading} center />
      <div
        className="mw-grid"
        style={{ "--mw-cols": Math.min(p.items.length, 3), marginTop: 56 } as CSSProperties}
      >
        {p.items.map((t, i) => (
          <figure key={i} className="mw-card" style={{ margin: 0, textAlign: "left" }}>
            <blockquote className="mw-quote" style={{ margin: 0 }}>
              “{t.quote}”
            </blockquote>
            <figcaption className="mw-person">
              <Img image={t.avatar} />
              <div>
                <div style={{ fontWeight: 600 }}>{t.author}</div>
                {t.role && <div className="mw-muted" style={{ fontSize: ".9rem" }}>{t.role}</div>}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </Shell>
  )
}

function Pricing({ section }: { section: SectionOf<"pricing"> }) {
  const p = section.props
  return (
    <Shell section={section}>
      <Heading heading={p.heading} subheading={p.subheading} center />
      <div
        className="mw-grid"
        style={{ "--mw-cols": Math.min(p.plans.length, 4), marginTop: 56 } as CSSProperties}
      >
        {p.plans.map((plan, i) => (
          <div key={i} className="mw-card mw-plan" data-highlighted={plan.highlighted ? "true" : undefined}>
            <h3 className="mw-h3">{plan.name}</h3>
            <div>
              <span className="mw-price">{plan.price}</span>
              {plan.period && <span className="mw-muted"> {plan.period}</span>}
            </div>
            {plan.description && <p className="mw-muted">{plan.description}</p>}
            <ul className="mw-checks">
              {plan.features.map((f, j) => (
                <li key={j}>{f}</li>
              ))}
            </ul>
            <div style={{ marginTop: "auto" }}>
              <Btn link={plan.cta} variant={plan.highlighted ? "primary" : "secondary"} />
            </div>
          </div>
        ))}
      </div>
    </Shell>
  )
}

function Faq({ section }: { section: SectionOf<"faq"> }) {
  const p = section.props
  return (
    <Shell section={section}>
      <Heading heading={p.heading} center />
      <div className="mw-faq">
        {p.items.map((item, i) => (
          <details key={i}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </Shell>
  )
}

function Gallery({ section }: { section: SectionOf<"gallery"> }) {
  const p = section.props
  return (
    <Shell section={section}>
      <Heading heading={p.heading} center />
      <div
        className="mw-grid mw-gallery"
        style={
          {
            "--mw-cols": Math.min(Math.max(p.columns, 1), 4),
            "--mw-mcols": mobileCols(p.mobileColumns),
            marginTop: p.heading ? 48 : 0,
          } as CSSProperties
        }
      >
        {p.images.map((image, i) =>
          image.caption ? (
            <figure key={i} className="mw-figure">
              <Img image={image} />
              <figcaption>{image.caption}</figcaption>
            </figure>
          ) : (
            <Img key={i} image={image} />
          ),
        )}
      </div>
    </Shell>
  )
}

function Cta({ section }: { section: SectionOf<"cta"> }) {
  const p = section.props
  return (
    <Shell section={section}>
      <div className="mw-stack mw-center" style={{ gap: 20 }}>
        <h2 className="mw-h2">
          <Rich text={p.heading} />
        </h2>
        {p.subheading && <p className="mw-lead">{p.subheading}</p>}
        <Actions primary={p.primaryCta} secondary={p.secondaryCta} />
      </div>
    </Shell>
  )
}

function Footer({ section }: { section: SectionOf<"footer"> }) {
  const p = section.props
  const s = section.style ?? {}
  return (
    <footer
      id={section.id}
      data-section-id={section.id}
      data-section-type="footer"
      className="mw-footer"
      style={{ background: s.background, color: s.color }}
    >
      <div className="mw-footer-grid" style={{ "--mw-cols": Math.max(p.columns.length, 1) } as CSSProperties}>
        <div className="mw-stack" style={{ gap: 12 }}>
          <div className="mw-brand">
            <Img image={p.logo} />
            {p.brand && <span>{p.brand}</span>}
          </div>
          {p.tagline && <p className="mw-muted">{p.tagline}</p>}
        </div>
        {p.columns.map((col, i) => (
          <div key={i}>
            <div style={{ fontWeight: 600 }}>{col.title}</div>
            <ul>
              {col.links.map((link, j) => (
                <li key={j}>
                  <a href={safeHref(link.href)}>{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {p.copyright && <div className="mw-copy">{p.copyright}</div>}
    </footer>
  )
}

const VOID_TAGS = new Set(["img"])

function kebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())
}

function CustomElement({ el, id, mobileRules }: { el: Element; id: string; mobileRules: string[] }) {
  const Tag = el.tag
  const className = el.mobileStyle ? `mw-e-${id}` : undefined
  if (el.mobileStyle) {
    const body = Object.entries(el.mobileStyle)
      .map(([k, v]) => `${kebab(k).replace(/[^a-z-]/g, "")}:${cssValue(v)}`)
      .join(";")
    mobileRules.push(`.mw-e-${id}{${body}}`)
  }
  const style = el.style as CSSProperties | undefined
  if (VOID_TAGS.has(Tag)) {
    const src = safeSrc(el.src)
    return src ? <img className={className} style={style} src={src} alt={el.alt ?? ""} loading="lazy" /> : null
  }
  const children = (el as { children?: Element[] }).children
  return (
    <Tag className={className} style={style} href={Tag === "a" ? safeHref(el.href) : undefined}>
      {el.text}
      {children?.map((child, i) => (
        <CustomElement key={i} el={child} id={`${id}-${i}`} mobileRules={mobileRules} />
      ))}
    </Tag>
  )
}

function Custom({ section }: { section: SectionOf<"custom"> }) {
  const mobileRules: string[] = []
  const prefix = section.id.replace(/[^a-zA-Z0-9_-]/g, "")
  const elements = section.props.elements.map((el, i) => (
    <CustomElement key={i} el={el} id={`${prefix}-${i}`} mobileRules={mobileRules} />
  ))
  return (
    <Shell section={section}>
      {elements}
      {mobileRules.length > 0 && <style>{`@media (max-width:768px){${mobileRules.join("")}}`}</style>}
    </Shell>
  )
}

// The editor re-renders on every draft change; markup of untouched sections is
// identical, so remember recent sanitizer results.
const sanitized = new Map<string, string>()

export function cleanHtml(html: string): string {
  let clean = sanitized.get(html)
  if (clean === undefined) {
    clean = sanitizeHtml(html)
    if (sanitized.size > 300) sanitized.delete(sanitized.keys().next().value as string)
    sanitized.set(html, clean)
  }
  return clean
}

/**
 * An exact copy of a block of the original page. The wrapper is
 * `display: contents`, so the original markup lays out as if it were still a
 * direct child of <body>.
 */
function Html({ section }: { section: SectionOf<"html"> }) {
  const p = section.props
  const css = p.css ? `<style>${sanitizeCss(p.css)}</style>` : ""
  return (
    <div
      className="mw-html"
      data-section-id={section.id}
      data-section-type="html"
      dangerouslySetInnerHTML={{ __html: css + cleanHtml(p.html) }}
    />
  )
}

type Registry = { [T in SectionType]: (props: { section: SectionOf<T> }) => ReactNode }

/** Maps every section type in the schema to the component that renders it. */
export const SECTION_COMPONENTS: Registry = {
  navbar: Navbar,
  hero: Hero,
  logos: Logos,
  features: Features,
  content: Content,
  stats: Stats,
  testimonials: Testimonials,
  pricing: Pricing,
  faq: Faq,
  gallery: Gallery,
  cta: Cta,
  footer: Footer,
  custom: Custom,
  html: Html,
}

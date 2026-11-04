import type { TemplateId } from "@magicwebs/page-schema"

// Component styling of the design templates (packages/page-schema/src/designs.ts).
// A page carries at most one template, so these rules are appended to its
// stylesheet unscoped. They only use the theme variables, so a template still
// follows color and font changes made in the editor. Exact copies (html
// sections) are never touched: every selector targets typed-section classes.

const R = ".mw-root"

/** Shared by every template: sections that set their own text color (dark bands, photo heroes). */
const BASE = `
${R} .mw-section[data-ink] :is(.mw-lead,.mw-muted){color:inherit;opacity:.78}
${R} .mw-section[data-ink] .mw-btn-primary{background:var(--mw-bg);color:var(--mw-fg)}
${R} .mw-section[data-ink] .mw-btn-secondary{border-color:currentColor}
${R} .mw-section[data-ink] :is(.mw-eyebrow,.mw-stat-value,.mw-inline-stat){color:inherit}
${R} .mw-eyebrow{width:fit-content}
${R} .mw-grid>*>img.mw-media{width:100%;aspect-ratio:4/3;object-fit:cover}
${R} .mw-center .mw-eyebrow{margin-left:auto;margin-right:auto}
`

const MINIMAL = `
${R} .mw-nav{background:color-mix(in srgb,var(--mw-bg) 82%,transparent);backdrop-filter:saturate(1.6) blur(12px);-webkit-backdrop-filter:saturate(1.6) blur(12px)}
${R} .mw-h1{font-weight:700;letter-spacing:-.045em}
${R} [data-section-type=hero] .mw-h1{font-size:clamp(2.6rem,6vw,4.75rem)}
${R} :is(.mw-h2,.mw-h3){font-weight:650;letter-spacing:-.03em}
${R} .mw-eyebrow{padding:5px 12px;border:1px solid var(--mw-border);border-radius:999px;background:var(--mw-bg);color:var(--mw-muted-fg);font-weight:500;font-size:.82rem;letter-spacing:0;text-transform:none}
${R} .mw-btn{padding:11px 20px;font-weight:550}
${R} .mw-card{box-shadow:0 1px 2px rgba(0,0,0,.04)}
${R} .mw-icon{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:calc(var(--mw-radius) + 2px);background:var(--mw-muted);color:var(--mw-fg);font-size:1.25rem}
${R} .mw-media{border:1px solid var(--mw-border);box-shadow:0 30px 60px -30px rgba(0,0,0,.22)}
${R} .mw-stat-value{color:var(--mw-fg);font-weight:700;letter-spacing:-.03em}
${R} .mw-hl{color:var(--mw-highlight)}
`

/** Frosted panel: translucent white, blurred backdrop, a light inner edge and a soft shadow. */
const FROST =
  "background:rgba(255,255,255,.42);-webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);border:1px solid rgba(255,255,255,.75);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 10px 40px -12px rgba(30,40,90,.16)"

const GLASS = `
${R}{position:relative;isolation:isolate}
${R}::before{content:"";position:fixed;inset:-10%;z-index:-1;pointer-events:none;filter:blur(40px);background:radial-gradient(40% 45% at 15% 15%,color-mix(in srgb,var(--mw-primary) 55%,transparent),transparent 70%),radial-gradient(38% 44% at 88% 22%,color-mix(in srgb,var(--mw-accent) 50%,transparent),transparent 70%),radial-gradient(45% 50% at 72% 88%,color-mix(in srgb,#ec4899 38%,transparent),transparent 70%),radial-gradient(40% 46% at 10% 82%,color-mix(in srgb,#22d3ee 40%,transparent),transparent 70%)}
${R} .mw-nav{background:rgba(255,255,255,.6);-webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);border-bottom:1px solid rgba(255,255,255,.7)}
${R} .mw-menu-panel{${FROST};background:rgba(255,255,255,.85)}
${R} :is(.mw-h1,.mw-h2){font-weight:650;letter-spacing:-.045em}
${R} [data-section-type=hero] .mw-h1{font-size:clamp(2.8rem,6.5vw,5rem);line-height:1.02}
${R} .mw-h3{font-weight:600;letter-spacing:-.02em}
${R} :is(.mw-h1,.mw-h2) .mw-hl,${R} .mw-stat-value{background:linear-gradient(100deg,var(--mw-primary),var(--mw-accent));-webkit-background-clip:text;background-clip:text;color:transparent}
${R} .mw-lead{color:var(--mw-muted-fg);font-size:1.2rem}
${R} .mw-eyebrow{padding:6px 14px;border-radius:999px;${FROST};color:var(--mw-fg);font-weight:500;font-size:.82rem;letter-spacing:0;text-transform:none}
${R} .mw-btn{border-radius:999px;padding:12px 24px;font-weight:550}
${R} .mw-btn-primary{box-shadow:0 8px 24px -8px color-mix(in srgb,var(--mw-primary) 70%,transparent)}
${R} .mw-btn-secondary{${FROST};color:var(--mw-fg)}
${R} .mw-card{${FROST};border-radius:var(--mw-radius);transition:transform .25s ease,box-shadow .25s ease}
${R} .mw-card:hover{transform:translateY(-3px);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 20px 50px -16px rgba(30,40,90,.22)}
${R} .mw-icon{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:14px;${FROST};color:var(--mw-primary);font-size:1.35rem}
${R} .mw-media{border-radius:calc(var(--mw-radius)*1.4);box-shadow:0 30px 80px -30px rgba(30,40,90,.35);border:1px solid rgba(255,255,255,.7)}
${R} .mw-plan[data-highlighted=true]{background:rgba(255,255,255,.8);box-shadow:0 0 0 2px var(--mw-primary),0 30px 70px -24px color-mix(in srgb,var(--mw-primary) 45%,transparent)}
${R} .mw-faq details{margin-bottom:12px;padding:18px 22px;border-radius:var(--mw-radius);${FROST}}
${R} [data-section-type=cta] .mw-container{padding:72px 32px;border-radius:calc(var(--mw-radius)*1.6);${FROST}}
${R} .mw-footer{background:rgba(255,255,255,.4);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.7)}
`

const CORPORATE = `
${R} .mw-nav{box-shadow:0 1px 0 var(--mw-border)}
${R} :is(.mw-h1,.mw-h2){font-weight:600;letter-spacing:-.025em}
${R} .mw-h3{font-weight:600}
${R} .mw-eyebrow{font-size:.78rem;letter-spacing:.12em;color:var(--mw-primary)}
${R} .mw-section[data-ink] .mw-eyebrow{color:inherit;opacity:.8}
${R} .mw-btn{padding:12px 22px;font-weight:600}
${R} .mw-btn-secondary{border-color:var(--mw-primary);color:var(--mw-primary)}
${R} .mw-card{border-top:3px solid var(--mw-primary);box-shadow:0 1px 3px rgba(15,23,42,.06),0 8px 24px -12px rgba(15,23,42,.12)}
${R} .mw-plan[data-highlighted=true]{box-shadow:0 0 0 2px var(--mw-primary),0 24px 48px -20px rgba(15,23,42,.3)}
${R} .mw-icon{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:var(--mw-radius);background:color-mix(in srgb,var(--mw-primary) 10%,transparent);color:var(--mw-primary);font-size:1.3rem}
${R} .mw-media{box-shadow:0 24px 60px -28px rgba(15,23,42,.35)}
${R} .mw-stat-value{color:var(--mw-primary);font-weight:700}
${R} .mw-section[data-ink] .mw-stat-value{color:inherit}
${R} .mw-checks li::before{color:var(--mw-primary)}
${R} .mw-logos img{filter:grayscale(1);opacity:.7}
${R} .mw-footer{background:var(--mw-muted)}
`

const EDITORIAL = `
${R} :is(.mw-h1,.mw-h2,.mw-h3){font-weight:500;letter-spacing:-.02em}
${R} .mw-h1{font-size:clamp(2.8rem,6vw,5.2rem);line-height:1.02}
${R} .mw-h2{font-size:clamp(2.1rem,4vw,3.4rem);line-height:1.08}
${R} .mw-hl{font-style:italic;color:var(--mw-highlight)}
${R} .mw-eyebrow{display:flex;align-items:center;gap:12px;font-size:.74rem;letter-spacing:.2em;font-weight:600}
${R} .mw-eyebrow::before{content:"";width:28px;height:1px;background:currentColor}
${R} .mw-lead{font-size:1.2rem;line-height:1.65}
${R} .mw-btn{padding:15px 26px;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase}
${R} .mw-btn-secondary{border-color:currentColor}
${R} .mw-nav{background:transparent}
${R} .mw-brand{font-family:var(--mw-font-heading);font-weight:600;font-size:1.35rem}
${R} .mw-card{background:transparent;border:0;border-top:1px solid var(--mw-fg);border-radius:0;padding:24px 0 0}
${R} .mw-plan{border:1px solid var(--mw-border);padding:32px}
${R} .mw-plan[data-highlighted=true]{border-color:var(--mw-fg);box-shadow:none;background:var(--mw-muted)}
${R} [data-section-type=features] .mw-grid{counter-reset:mw-f;gap:48px 40px}
${R} [data-section-type=features] .mw-grid>div::before{counter-increment:mw-f;content:counter(mw-f,decimal-leading-zero);display:block;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--mw-border);font-family:var(--mw-font-heading);font-size:1rem;color:var(--mw-accent)}
${R} [data-section-type=features] .mw-card::before{border-bottom:0;padding-bottom:0}
${R} .mw-icon{font-size:1.75rem;margin-bottom:16px;color:var(--mw-accent)}
${R} [data-section-type=testimonials] .mw-quote{font-family:var(--mw-font-heading);font-size:1.35rem;line-height:1.45;font-style:italic}
${R} .mw-stat-value{font-weight:400;color:inherit;font-size:clamp(2.6rem,5vw,4rem)}
${R} .mw-inline-stat{font-weight:500;color:inherit}
${R} .mw-media{border-radius:var(--mw-radius)}
${R} .mw-faq summary{font-family:var(--mw-font-heading);font-weight:500;font-size:1.25rem}
${R} .mw-footer{border-top-color:var(--mw-fg)}
`

const LUXE = `
${R} .mw-nav{background:transparent;border-bottom-color:color-mix(in srgb,var(--mw-primary) 25%,transparent)}
${R} .mw-brand{font-family:var(--mw-font-heading);font-weight:500;font-size:1.4rem;letter-spacing:.08em;text-transform:uppercase}
${R} .mw-nav-links a{font-size:.8rem;letter-spacing:.16em;text-transform:uppercase}
${R} :is(.mw-h1,.mw-h2,.mw-h3){font-weight:400;letter-spacing:-.01em}
${R} .mw-h1{font-size:clamp(3rem,7vw,5.8rem);line-height:1}
${R} .mw-h2{font-size:clamp(2.2rem,4.4vw,3.6rem);line-height:1.05}
${R} .mw-h3{font-size:1.45rem}
${R} .mw-hl{font-style:italic;color:var(--mw-highlight)}
${R} .mw-eyebrow{display:flex;align-items:center;gap:14px;font-size:.72rem;letter-spacing:.32em;font-weight:500;color:var(--mw-primary)}
${R} .mw-eyebrow::before,${R} .mw-eyebrow::after{content:"";width:32px;height:1px;background:currentColor;opacity:.6}
${R} .mw-lead{font-weight:300;font-size:1.15rem;line-height:1.75}
${R} .mw-btn{padding:16px 30px;border-radius:0;font-size:.76rem;font-weight:500;letter-spacing:.22em;text-transform:uppercase}
${R} .mw-btn-secondary{border-color:var(--mw-primary);color:var(--mw-primary)}
${R} .mw-section[data-ink] .mw-btn-primary{background:var(--mw-primary);color:var(--mw-primary-fg)}
${R} .mw-section[data-ink] .mw-btn-secondary{border-color:currentColor;color:inherit}
${R} .mw-card{background:transparent;border:1px solid color-mix(in srgb,var(--mw-primary) 30%,transparent);border-radius:0;padding:36px}
${R} .mw-plan[data-highlighted=true]{border-color:var(--mw-primary);box-shadow:none;background:var(--mw-muted)}
${R} .mw-icon{font-size:1.9rem;margin-bottom:20px;color:var(--mw-primary)}
${R} .mw-icon svg{stroke-width:1.25}
${R} [data-section-type=features] .mw-grid{gap:56px 48px}
${R} [data-section-type=testimonials] .mw-quote{font-family:var(--mw-font-heading);font-size:1.5rem;line-height:1.45;font-style:italic}
${R} .mw-stat-value{font-family:var(--mw-font-heading);font-weight:400;color:var(--mw-primary);font-size:clamp(2.8rem,5vw,4.2rem)}
${R} .mw-inline-stat{font-weight:400;color:var(--mw-primary)}
${R} .mw-checks li::before{content:"—";color:var(--mw-primary)}
${R} .mw-media{border-radius:0}
${R} .mw-logos img{filter:brightness(0) invert(1);opacity:.55}
${R} .mw-faq details{border-bottom-color:color-mix(in srgb,var(--mw-primary) 25%,transparent)}
${R} .mw-faq summary{font-family:var(--mw-font-heading);font-weight:400;font-size:1.35rem}
${R} .mw-footer{border-top-color:color-mix(in srgb,var(--mw-primary) 25%,transparent)}
`

const FRESH = `
${R} :is(.mw-h1,.mw-h2){font-weight:600;letter-spacing:-.03em}
${R} .mw-h3{font-weight:600}
${R} .mw-hl{color:var(--mw-highlight);background:linear-gradient(transparent 68%,color-mix(in srgb,var(--mw-accent) 35%,transparent) 0)}
${R} .mw-eyebrow{padding:6px 14px;border-radius:999px;background:color-mix(in srgb,var(--mw-primary) 12%,transparent);color:var(--mw-primary);font-size:.8rem;font-weight:700;letter-spacing:.02em;text-transform:none}
${R} .mw-btn{border-radius:999px;padding:13px 26px;font-weight:700}
${R} .mw-btn-secondary{background:var(--mw-bg);border-color:var(--mw-border)}
${R} .mw-card{border:0;background:var(--mw-bg);box-shadow:0 2px 4px rgba(29,43,31,.04),0 14px 36px -18px rgba(29,43,31,.22)}
${R} .mw-section:not([style*=background]) .mw-card{background:var(--mw-muted);box-shadow:none}
${R} .mw-plan[data-highlighted=true]{box-shadow:0 0 0 2px var(--mw-primary),0 20px 40px -20px rgba(29,43,31,.35)}
${R} .mw-icon{display:inline-grid;place-items:center;width:52px;height:52px;border-radius:999px;background:color-mix(in srgb,var(--mw-primary) 12%,transparent);color:var(--mw-primary);font-size:1.4rem}
${R} .mw-media{border-radius:calc(var(--mw-radius)*1.4);box-shadow:0 24px 50px -28px rgba(29,43,31,.4)}
${R} .mw-stat-value{color:var(--mw-primary)}
${R} .mw-checks li::before{content:"●";font-size:.7em;vertical-align:.15em;color:var(--mw-accent)}
${R} .mw-faq details{margin-bottom:12px;padding:18px 24px;border:0;border-radius:var(--mw-radius);background:var(--mw-bg)}
${R} .mw-section:not([style*=background]) .mw-faq details{background:var(--mw-muted)}
${R} .mw-footer{background:var(--mw-muted);border-top:0}
`

const PLAYFUL = `
${R} :is(.mw-h1,.mw-h2){font-weight:800;letter-spacing:-.035em}
${R} .mw-h3{font-weight:700}
${R} .mw-hl{color:inherit;background:linear-gradient(transparent 60%,color-mix(in srgb,var(--mw-highlight) 40%,transparent) 0);padding:0 .06em}
${R} .mw-eyebrow{padding:6px 14px;border:2px solid var(--mw-border);border-radius:999px;background:var(--mw-accent);color:var(--mw-primary-fg);font-weight:700;letter-spacing:0;text-transform:none;transform:rotate(-2deg)}
${R} .mw-btn{border:2px solid var(--mw-border);border-radius:999px;font-weight:700;box-shadow:3px 3px 0 var(--mw-border);transition:transform .12s ease,box-shadow .12s ease}
${R} .mw-btn:hover{transform:translate(-2px,-2px);box-shadow:5px 5px 0 var(--mw-border);opacity:1}
${R} .mw-btn-secondary{background:var(--mw-bg);color:var(--mw-fg)}
${R} .mw-nav{border-bottom:2px solid var(--mw-border)}
${R} .mw-card{border:2px solid var(--mw-border);background:var(--mw-bg);box-shadow:6px 6px 0 var(--mw-border)}
${R} .mw-plan[data-highlighted=true]{background:var(--mw-muted);box-shadow:8px 8px 0 var(--mw-primary)}
${R} .mw-icon{display:inline-grid;place-items:center;width:52px;height:52px;border:2px solid var(--mw-border);border-radius:14px;background:var(--mw-muted);color:var(--mw-primary);font-size:1.5rem}
${R} .mw-media{border:2px solid var(--mw-border);box-shadow:8px 8px 0 var(--mw-border)}
${R} .mw-stat-value{color:var(--mw-primary)}
${R} .mw-checks li::before{color:var(--mw-primary)}
${R} .mw-faq details{margin-bottom:12px;padding:18px 22px;border:2px solid var(--mw-border);border-radius:var(--mw-radius);background:var(--mw-bg)}
${R} .mw-footer{border-top:2px solid var(--mw-border)}
`

const TEMPLATE_CSS: Record<TemplateId, string> = {
  minimal: MINIMAL,
  glass: GLASS,
  corporate: CORPORATE,
  editorial: EDITORIAL,
  luxe: LUXE,
  fresh: FRESH,
  playful: PLAYFUL,
}

/** The component styling of a theme's template, or "" for pages without one. */
export function templateCss(template: string | undefined): string {
  const css = template ? TEMPLATE_CSS[template as TemplateId] : undefined
  return css ? BASE + css : ""
}

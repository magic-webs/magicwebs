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
${R} .mw-icon{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:calc(var(--mw-radius) + 2px);background:var(--mw-muted);font-size:1.25rem}
${R} .mw-media{border:1px solid var(--mw-border);box-shadow:0 30px 60px -30px rgba(0,0,0,.22)}
${R} .mw-stat-value{color:var(--mw-fg);font-weight:700;letter-spacing:-.03em}
${R} .mw-hl{color:var(--mw-highlight)}
`

const MIDNIGHT = `
${R}{background:radial-gradient(1200px 640px at 50% -260px,color-mix(in srgb,var(--mw-primary) 22%,transparent),transparent 70%),var(--mw-bg)}
${R} .mw-nav{background:color-mix(in srgb,var(--mw-bg) 70%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom-color:color-mix(in srgb,var(--mw-border) 60%,transparent)}
${R} [data-section-type=hero]{background:radial-gradient(55% 60% at 50% 0%,color-mix(in srgb,var(--mw-primary) 32%,transparent),transparent 72%)}
${R} :is(.mw-h1,.mw-h2){font-weight:700;letter-spacing:-.04em}
${R} .mw-h1{background:linear-gradient(180deg,var(--mw-fg) 35%,color-mix(in srgb,var(--mw-fg) 58%,transparent));-webkit-background-clip:text;background-clip:text;color:transparent}
${R} .mw-section[data-ink] .mw-h1{background:none;color:inherit}
${R} :is(.mw-h1,.mw-h2) .mw-hl,${R} .mw-stat-value{background:linear-gradient(90deg,var(--mw-highlight),var(--mw-accent));-webkit-background-clip:text;background-clip:text;color:transparent}
${R} .mw-eyebrow{padding:6px 14px;border:1px solid color-mix(in srgb,var(--mw-primary) 45%,transparent);border-radius:999px;background:color-mix(in srgb,var(--mw-primary) 14%,transparent);color:var(--mw-highlight);font-size:.8rem;letter-spacing:.02em;text-transform:none}
${R} .mw-btn-primary{background:linear-gradient(135deg,var(--mw-primary),color-mix(in srgb,var(--mw-primary) 55%,var(--mw-accent)));box-shadow:inset 0 0 0 1px rgba(255,255,255,.12),0 12px 32px -12px var(--mw-primary)}
${R} .mw-btn-secondary{background:rgba(255,255,255,.04)}
${R} .mw-card{background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.01));transition:border-color .2s ease,transform .2s ease}
${R} .mw-card:hover{border-color:color-mix(in srgb,var(--mw-primary) 55%,var(--mw-border));transform:translateY(-2px)}
${R} .mw-icon{display:inline-grid;place-items:center;width:46px;height:46px;border-radius:12px;border:1px solid var(--mw-border);background:linear-gradient(135deg,color-mix(in srgb,var(--mw-primary) 30%,transparent),transparent);font-size:1.2rem}
${R} .mw-media{border:1px solid var(--mw-border);box-shadow:0 0 0 6px rgba(255,255,255,.02),0 40px 120px -40px color-mix(in srgb,var(--mw-primary) 65%,transparent)}
${R} .mw-logos img{filter:brightness(0) invert(1);opacity:.6}
${R} .mw-plan[data-highlighted=true]{border-color:var(--mw-primary);box-shadow:0 0 0 1px var(--mw-primary),0 30px 80px -30px color-mix(in srgb,var(--mw-primary) 70%,transparent)}
${R} [data-section-type=cta] .mw-container{padding:72px 32px;border:1px solid var(--mw-border);border-radius:calc(var(--mw-radius)*2);background:radial-gradient(80% 120% at 50% 0%,color-mix(in srgb,var(--mw-primary) 30%,transparent),transparent 70%),var(--mw-muted)}
${R} .mw-footer{border-top-color:color-mix(in srgb,var(--mw-border) 60%,transparent)}
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
${R} [data-section-type=features] .mw-icon{display:none}
${R} [data-section-type=testimonials] .mw-quote{font-family:var(--mw-font-heading);font-size:1.35rem;line-height:1.45;font-style:italic}
${R} .mw-stat-value{font-weight:400;color:inherit;font-size:clamp(2.6rem,5vw,4rem)}
${R} .mw-inline-stat{font-weight:500;color:inherit}
${R} .mw-media{border-radius:var(--mw-radius)}
${R} .mw-faq summary{font-family:var(--mw-font-heading);font-weight:500;font-size:1.25rem}
${R} .mw-footer{border-top-color:var(--mw-fg)}
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
${R} .mw-icon{display:inline-grid;place-items:center;width:52px;height:52px;border:2px solid var(--mw-border);border-radius:14px;background:var(--mw-muted);font-size:1.5rem}
${R} .mw-media{border:2px solid var(--mw-border);box-shadow:8px 8px 0 var(--mw-border)}
${R} .mw-stat-value{color:var(--mw-primary)}
${R} .mw-checks li::before{color:var(--mw-primary)}
${R} .mw-faq details{margin-bottom:12px;padding:18px 22px;border:2px solid var(--mw-border);border-radius:var(--mw-radius);background:var(--mw-bg)}
${R} .mw-footer{border-top:2px solid var(--mw-border)}
`

const TEMPLATE_CSS: Record<TemplateId, string> = {
  minimal: MINIMAL,
  midnight: MIDNIGHT,
  editorial: EDITORIAL,
  playful: PLAYFUL,
}

/** The component styling of a theme's template, or "" for pages without one. */
export function templateCss(template: string | undefined): string {
  const css = template ? TEMPLATE_CSS[template as TemplateId] : undefined
  return css ? BASE + css : ""
}

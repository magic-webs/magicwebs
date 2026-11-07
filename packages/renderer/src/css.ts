import type { Theme } from "@magicwebs/page-schema"

import { templateCss } from "./templates"

// Values from crawled pages and the model end up inside <style> text, so they
// must not be able to close the tag or open new rule blocks.
export function cssValue(value: string): string {
  return value.replace(/[<>{};]/g, "")
}

export function cssFamily(name: string): string {
  return `"${name.replace(/["\\<>{};]/g, "")}"`
}

export function fontHref(theme: Theme): string | null {
  const families = [...new Set(theme.fonts.googleFonts.filter(Boolean))]
  if (families.length === 0) return null
  const query = families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;600;700;800`)
    .join("&")
  return `https://fonts.googleapis.com/css2?${query}&display=swap`
}

// Base rules only reach the typed sections, so html sections (exact copies of
// the original markup) are styled by the original CSS alone.
const T = ":where(.mw-section,.mw-nav,.mw-footer)"

export function pageCss(theme: Theme): string {
  const c = theme.colors
  return `
.mw-root{--mw-bg:${cssValue(c.background)};--mw-fg:${cssValue(c.foreground)};--mw-primary:${cssValue(c.primary)};--mw-primary-fg:${cssValue(c.primaryForeground)};--mw-muted:${cssValue(c.muted)};--mw-muted-fg:${cssValue(c.mutedForeground)};--mw-accent:${cssValue(c.accent)};--mw-highlight:${cssValue(c.highlight || c.accent)};--mw-border:${cssValue(c.border)};--mw-radius:${Number(theme.radius) || 0}px;--mw-max:${Number(theme.maxWidth) || 1200}px;--mw-font-heading:${cssFamily(theme.fonts.heading)},system-ui,sans-serif;--mw-font-body:${cssFamily(theme.fonts.body)},system-ui,sans-serif;background:var(--mw-bg);color:var(--mw-fg);font-family:var(--mw-font-body);line-height:1.6;-webkit-font-smoothing:antialiased}
.mw-root ${T},.mw-root ${T} *,.mw-root ${T} *::before,.mw-root ${T} *::after{box-sizing:border-box}
.mw-root ${T} img{max-width:100%;height:auto;display:block}
.mw-root ${T} a{color:inherit}
.mw-root ${T} :is(h1,h2,h3,h4){font-family:var(--mw-font-heading);line-height:1.15;margin:0;letter-spacing:-0.02em}
.mw-root ${T} p{margin:0}
.mw-root.mw-exact{display:contents;background:none;color:inherit;font-family:inherit;line-height:inherit;-webkit-font-smoothing:inherit}
.mw-exact ${T}{color:var(--mw-fg);font-family:var(--mw-font-body);line-height:1.6;-webkit-font-smoothing:antialiased}
.mw-html{display:contents}
.mw-section{position:relative;padding:var(--mw-py,96px) 24px;background-size:cover;background-position:center}
.mw-section[data-align=center]{text-align:center}
.mw-section[data-align=right]{text-align:right}
.mw-overlay{position:absolute;inset:0;pointer-events:none}
.mw-container{position:relative;max-width:var(--mw-max);margin:0 auto}
.mw-full .mw-container{max-width:none}
.mw-stack{display:flex;flex-direction:column;gap:16px}
.mw-center{align-items:center;text-align:center;margin-left:auto;margin-right:auto}
.mw-eyebrow{font-size:.85rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mw-accent)}
.mw-h1{font-size:clamp(2.4rem,5vw,4.25rem);font-weight:800}
.mw-h2{font-size:clamp(1.9rem,3.4vw,2.9rem);font-weight:700}
.mw-h3{font-size:1.2rem;font-weight:600}
.mw-lead{font-size:1.15rem;color:var(--mw-muted-fg);max-width:680px}
.mw-center .mw-lead{margin:0 auto}
.mw-muted{color:var(--mw-muted-fg)}
.mw-hl{color:var(--mw-highlight)}
.mw-inline-stats{display:flex;flex-wrap:wrap;gap:20px 40px}
.mw-section[data-align=center] .mw-inline-stats{justify-content:center}
.mw-inline-stat{font-family:var(--mw-font-heading);font-size:1.6rem;font-weight:700;color:var(--mw-highlight);line-height:1.2}
.mw-section[data-align=center] .mw-checks{align-items:center}
.mw-figure{margin:0;display:flex;flex-direction:column;gap:12px;text-align:center}
.mw-figure figcaption{font-weight:600}
.mw-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}
.mw-center .mw-actions,.mw-section[data-align=center] .mw-actions{justify-content:center}
.mw-btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 22px;border-radius:var(--mw-radius);font-weight:600;text-decoration:none;border:1px solid transparent;transition:transform .15s ease,opacity .15s ease}
.mw-btn:hover{transform:translateY(-1px);opacity:.92}
.mw-root .mw-btn-primary{background:var(--mw-primary);color:var(--mw-primary-fg)}
.mw-root .mw-btn-secondary{background:transparent;color:inherit;border-color:var(--mw-border)}
.mw-media{border-radius:calc(var(--mw-radius)*1.5);overflow:hidden}
.mw-media img{width:100%;object-fit:cover}
.mw-split{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
.mw-split.mw-reverse>:first-child{order:2}
.mw-grid{display:grid;gap:24px;grid-template-columns:repeat(var(--mw-cols,3),minmax(0,1fr))}
.mw-card{--mw-card-pad:28px;display:flex;flex-direction:column;padding:var(--mw-card-pad);border:1px solid var(--mw-border);border-radius:calc(var(--mw-radius)*1.5);background:var(--mw-bg)}
.mw-card>.mw-icon{align-self:flex-start}
.mw-card>.mw-card-media{display:block;width:calc(100% + 2*var(--mw-card-pad));max-width:none;margin:calc(-1*var(--mw-card-pad)) calc(-1*var(--mw-card-pad)) 20px;aspect-ratio:16/10;object-fit:cover;border-radius:inherit;border-bottom-left-radius:0;border-bottom-right-radius:0}
.mw-card .mw-person{margin-top:auto;padding-top:20px}
.mw-stat{justify-content:center;text-align:center}.mw-icon{font-size:1.6rem;line-height:1;margin-bottom:12px;color:var(--mw-accent)}
.mw-icon svg{display:block;width:1em;height:1em}
.mw-nav{padding:16px 24px;background:var(--mw-bg);border-bottom:1px solid var(--mw-border);z-index:20}
.mw-nav[data-sticky=true]{position:sticky;top:0}
.mw-nav-inner{display:flex;align-items:center;justify-content:space-between;gap:24px;max-width:var(--mw-max);margin:0 auto}
.mw-brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:1.15rem;text-decoration:none}
.mw-brand img{height:32px;width:auto}
.mw-nav-links{display:flex;gap:28px;list-style:none;margin:0;padding:0}
.mw-nav-links a{text-decoration:none;color:var(--mw-muted-fg);font-weight:500}
.mw-nav-links a:hover{color:var(--mw-fg)}
.mw-nav-inner{position:relative}
.mw-nav-cta .mw-btn{white-space:nowrap}
.mw-menu{display:none}
.mw-menu summary{list-style:none;cursor:pointer;display:flex;flex-direction:column;justify-content:center;gap:5px;width:40px;height:40px;padding:8px}
.mw-menu summary::-webkit-details-marker{display:none}
.mw-menu summary span{display:block;height:2px;background:currentColor;border-radius:2px;transition:transform .2s ease,opacity .2s ease}
.mw-menu[open] summary span:nth-child(1){transform:translateY(7px) rotate(45deg)}
.mw-menu[open] summary span:nth-child(2){opacity:0}
.mw-menu[open] summary span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
.mw-menu-panel{position:absolute;left:-20px;right:-20px;top:calc(100% + 12px);display:flex;flex-direction:column;gap:4px;padding:12px 20px 20px;background:var(--mw-bg);border-bottom:1px solid var(--mw-border);box-shadow:0 16px 32px -16px rgba(0,0,0,.2)}
.mw-menu-panel>a:not(.mw-btn){padding:10px 0;text-decoration:none;font-weight:500;border-bottom:1px solid var(--mw-border)}
.mw-menu-panel .mw-btn{margin-top:12px}
.mw-logos{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:40px 56px;margin-top:28px}
.mw-logos img{height:40px;width:auto;max-width:160px;object-fit:contain}
.mw-logos[data-monochrome=true] img{opacity:.75;filter:grayscale(1)}
.mw-stat-value{font-family:var(--mw-font-heading);font-size:clamp(2rem,4vw,3rem);font-weight:800;color:var(--mw-accent)}
.mw-quote{font-size:1.05rem}
.mw-person{display:flex;align-items:center;gap:12px;margin-top:20px;text-align:left}
.mw-person img{width:44px;height:44px;border-radius:999px;object-fit:cover}
.mw-plan{display:flex;flex-direction:column;gap:16px;text-align:left}
.mw-plan[data-highlighted=true]{border-color:var(--mw-primary);box-shadow:0 12px 40px -12px rgba(0,0,0,.25)}
.mw-price{font-family:var(--mw-font-heading);font-size:2.6rem;font-weight:800}
.mw-checks{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
.mw-checks li::before{content:"✓";color:var(--mw-accent);font-weight:700;margin-right:10px}
.mw-faq{max-width:760px;margin:40px auto 0;text-align:left}
.mw-faq details{border-bottom:1px solid var(--mw-border);padding:20px 0}
.mw-faq summary{cursor:pointer;font-weight:600;font-size:1.05rem;list-style:none}
.mw-faq summary::-webkit-details-marker{display:none}
.mw-faq details p{margin-top:12px;color:var(--mw-muted-fg)}
.mw-gallery img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--mw-radius)}
.mw-form{max-width:640px;margin:40px auto 0;display:flex;flex-direction:column;gap:16px;text-align:left}
.mw-field{display:flex;flex-direction:column;gap:6px}
.mw-field label{font-size:.9rem;font-weight:500}
.mw-form input:not([type=checkbox]),.mw-form textarea,.mw-form select{width:100%;padding:11px 14px;font:inherit;color:inherit;background:var(--mw-bg);border:1px solid var(--mw-border);border-radius:var(--mw-radius)}
.mw-form textarea{resize:vertical}
.mw-form input:focus,.mw-form textarea:focus,.mw-form select:focus{outline:2px solid var(--mw-primary);outline-offset:1px}
.mw-check{display:flex;align-items:flex-start;gap:10px;font-size:.95rem}
.mw-check input{margin-top:4px;accent-color:var(--mw-primary)}
.mw-form .mw-btn{align-self:flex-start;cursor:pointer;font:inherit;font-weight:600}
.mw-form .mw-hp{position:absolute;left:-10000px;width:1px;height:1px;opacity:0}
.mw-form-done{padding:8px 0;font-size:1.05rem;font-weight:500}
.mw-form-error{color:#dc2626;font-size:.9rem}
.mw-footer{padding:64px 24px 40px;border-top:1px solid var(--mw-border)}
.mw-footer-grid{display:grid;grid-template-columns:1.5fr repeat(var(--mw-cols,3),1fr);gap:40px;max-width:var(--mw-max);margin:0 auto}
.mw-footer ul{list-style:none;padding:0;margin:12px 0 0;display:flex;flex-direction:column;gap:8px}
.mw-footer a{text-decoration:none;color:var(--mw-muted-fg)}
.mw-copy{max-width:var(--mw-max);margin:48px auto 0;font-size:.875rem;color:var(--mw-muted-fg)}
[data-animate]{transition:opacity .7s ease,transform .7s ease}
.mw-js [data-animate]:not(.mw-in){opacity:0}
.mw-js [data-animate=fade-up]:not(.mw-in){transform:translateY(32px)}
.mw-js [data-animate=zoom-in]:not(.mw-in){transform:scale(.94)}
.mw-js [data-animate=slide-left]:not(.mw-in){transform:translateX(48px)}
.mw-js [data-animate=slide-right]:not(.mw-in){transform:translateX(-48px)}
@media (prefers-reduced-motion:reduce){.mw-js [data-animate]{opacity:1!important;transform:none!important;transition:none}}
@media (max-width:900px){
.mw-split{grid-template-columns:1fr;gap:36px}
.mw-split.mw-reverse>:first-child{order:0}
.mw-grid{grid-template-columns:repeat(min(var(--mw-cols,3),2),minmax(0,1fr))}
.mw-footer-grid{grid-template-columns:1fr 1fr}
}
@media (max-width:768px){
.mw-section{padding:calc(var(--mw-py,96px)*.6) 20px}
.mw-grid{grid-template-columns:repeat(var(--mw-mcols,1),minmax(0,1fr));gap:16px}
.mw-nav{padding:12px 20px}
.mw-nav-links,.mw-nav-cta{display:none}
.mw-menu{display:block}
.mw-brand img{height:28px}
.mw-card{--mw-card-pad:20px}
.mw-footer-grid{grid-template-columns:1fr}
}
${templateCss(theme.template)}`
}

/** Client script for entrance animations on published pages. */
export const ANIMATION_SCRIPT = `(function(){var r=document.documentElement;r.classList.add("mw-js");if(!("IntersectionObserver"in window)){r.classList.remove("mw-js");return}var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("mw-in");o.unobserve(e.target)}})},{threshold:0.12});document.querySelectorAll("[data-animate]").forEach(function(el){o.observe(el)})})();`

/**
 * Rules exact clones need on top of the original CSS: hidden interaction
 * states, scroll reveals, AOS / WOW entrance animations and carousels turned
 * into native scroll-snap strips.
 */
/** Blog pages: the post list and articles, drawn with the site's theme variables. */
export const BLOG_CSS = `.mw-main{display:block}
.mw-blog{padding:72px 24px 96px}
.mw-blog-wrap{max-width:var(--mw-max,1100px);margin:0 auto}
.mw-blog-head{margin-bottom:40px}
.mw-blog-head h1,.mw-blog-article h1{font-family:var(--mw-font-heading);font-size:clamp(2rem,4.5vw,3rem);line-height:1.15;margin:0 0 12px;letter-spacing:-.02em}
.mw-blog-list{display:grid;gap:24px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
.mw-blog-card{display:flex;flex-direction:column;gap:8px;padding:0;overflow:hidden;border:1px solid var(--mw-border,#e5e7eb);border-radius:calc(var(--mw-radius,8px)*1.5);background:var(--mw-bg,#fff);color:inherit;text-decoration:none;transition:transform .15s ease,box-shadow .15s ease}
.mw-blog-card:hover{transform:translateY(-2px);box-shadow:0 12px 32px -16px rgba(0,0,0,.25)}
.mw-blog-card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}
.mw-blog-card-body{display:flex;flex-direction:column;gap:8px;padding:20px 22px 24px}
.mw-blog-card h2{font-family:var(--mw-font-heading);font-size:1.25rem;line-height:1.3;margin:0}
.mw-blog-card p{margin:0;color:var(--mw-muted-fg,#6b7280)}
.mw-blog-meta{font-size:.85rem;color:var(--mw-muted-fg,#6b7280);margin:0}
.mw-blog-article{max-width:720px;margin:0 auto}
.mw-blog-back{display:inline-block;margin-bottom:24px;font-size:.9rem;color:var(--mw-muted-fg,#6b7280);text-decoration:none}
.mw-blog-back:hover{color:var(--mw-fg,inherit)}
.mw-blog-lead{font-size:1.2rem;color:var(--mw-muted-fg,#6b7280);margin:0 0 28px}
.mw-blog-cover{width:100%;border-radius:calc(var(--mw-radius,8px)*1.5);margin:0 0 36px;display:block}
.mw-prose{font-size:1.075rem;line-height:1.75}
.mw-prose :is(h2,h3,h4){font-family:var(--mw-font-heading);line-height:1.25;margin:2em 0 .6em}
.mw-prose h2{font-size:1.6rem}.mw-prose h3{font-size:1.3rem}
.mw-prose p,.mw-prose ul,.mw-prose ol,.mw-prose blockquote,.mw-prose pre,.mw-prose table{margin:0 0 1.25em}
.mw-prose a{color:var(--mw-primary,inherit);text-underline-offset:3px}
.mw-prose img{max-width:100%;height:auto;border-radius:var(--mw-radius,8px)}
.mw-prose blockquote{border-left:3px solid var(--mw-accent,currentColor);padding-left:1em;color:var(--mw-muted-fg,#6b7280)}
.mw-prose code{font-size:.9em;background:var(--mw-muted,#f3f4f6);padding:.15em .35em;border-radius:4px}
.mw-prose pre{background:var(--mw-muted,#f3f4f6);padding:16px;border-radius:var(--mw-radius,8px);overflow-x:auto}
.mw-prose pre code{background:none;padding:0}
.mw-prose table{border-collapse:collapse;width:100%}.mw-prose th,.mw-prose td{border:1px solid var(--mw-border,#e5e7eb);padding:8px 12px;text-align:left}
.mw-prose hr{border:0;border-top:1px solid var(--mw-border,#e5e7eb);margin:2.5em 0}
.mw-blog-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:40px;padding:0;list-style:none}
.mw-blog-tags li{font-size:.85rem;padding:4px 12px;border-radius:999px;background:var(--mw-muted,#f3f4f6)}
.mw-blog-empty{color:var(--mw-muted-fg,#6b7280)}
`

export const EXACT_CSS = `
[data-mw-off]{display:none!important}
.mw-js [data-mw-reveal]:not(.mw-in){opacity:var(--mw-o,0)!important;transform:var(--mw-t,none)!important;transition:none!important}
.mw-js [data-mw-reveal].mw-in:not(.mw-done){transition:opacity .9s cubic-bezier(.16,1,.3,1) var(--mw-d,0s),transform .9s cubic-bezier(.16,1,.3,1) var(--mw-d,0s)!important}
html:not(.mw-js) [data-aos]{opacity:1!important;transform:none!important;visibility:visible!important}
.mw-js [data-mw-wow]:not(.mw-in){visibility:hidden}
[data-mw-carousel]{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none;transform:none!important;width:auto!important;height:auto!important}
[data-mw-carousel]::-webkit-scrollbar{display:none}
[data-mw-carousel]>*{flex:0 0 var(--mw-slide,100%)!important;width:auto!important;max-width:none!important;scroll-snap-align:start;transform:none!important;opacity:1!important;visibility:visible!important;position:relative!important;left:auto!important;top:auto!important}
@media (max-width:767px){[data-mw-carousel]>*{flex-basis:var(--mw-slide-m,100%)!important}}
@media (prefers-reduced-motion:reduce){.mw-js [data-mw-reveal]{opacity:1!important;transform:none!important;transition:none!important}}
`

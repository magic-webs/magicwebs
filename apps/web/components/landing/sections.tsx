"use client"

/* eslint-disable react/no-unescaped-entities -- terminal transcripts quote arguments literally */

import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import {
  ChevronDown,
  Code,
  Copy,
  CreditCard,
  EyeOff,
  Globe,
  History,
  Layers,
  MousePointer2,
  Palette,
  PenLine,
  Plus,
  Rocket,
  ShieldCheck,
  Smartphone,
  Terminal,
  Type,
  Wind,
  Zap,
  CircleQuestionMark,
  Cpu,
} from "lucide-react"
import { useLayoutEffect, useRef } from "react"

import { prefersReducedMotion } from "./hero"
import { container, mw, Snippet } from "./ui"

const MCP_URL = "https://api.magicwebs.ai/mcp"

const SECTION = `${container} mt-36 scroll-mt-[110px] max-[860px]:mt-24`
const INTRO = "mb-10 flex max-w-[680px] flex-col items-start gap-3"
const HEADING =
  "bg-[linear-gradient(117deg,#07001f_0%,#000000b3_100%)] bg-clip-text text-[length:clamp(32px,4vw_+_8px,48px)] leading-[1.15] font-semibold tracking-[-0.03em] text-transparent"
const LEAD =
  "text-[20px] leading-[28px] font-medium tracking-[-0.015em] text-balance text-mw-muted max-[860px]:text-[18px] max-[860px]:leading-[26px]"

/* Terminal text colours. */
const MUTED = "text-[#8a8a8a]"
const OK = "text-[#4ade80]"
const MATCH = "text-[#c9b0ff] underline decoration-[#c9b0ff80] decoration-wavy underline-offset-3"

/* ---------- Ask for anything ---------- */

const PROMPTS = [
  { text: "Clone stripe.com/pricing and swap in our plans", icons: [Copy, CreditCard] },
  { text: "Rewrite the hero for a B2B audience", icons: [Type, PenLine] },
  { text: "Make the whole page use our brand colors", icons: [Palette] },
  { text: "Add a FAQ section above the footer", icons: [Plus, CircleQuestionMark] },
  { text: "Hide the testimonials on phones", icons: [Smartphone, EyeOff] },
  { text: "Publish it to launch.acme.com", icons: [Globe, Rocket] },
]

export function Prompts() {
  return (
    <section
      className={`${container} mt-[104px] scroll-mt-[110px] max-[860px]:mt-[72px]`}
      aria-labelledby="prompts-title"
    >
      <header className={INTRO} data-reveal>
        <h2 id="prompts-title" className={HEADING}>
          Ask for what you need
        </h2>
        <p className={LEAD}>
          Describe the change in plain words. Your agent turns it into edits on the page. A few requests people make:
        </p>
      </header>
      <ul className="grid list-none grid-cols-2 gap-x-12 max-[860px]:grid-cols-1" data-reveal-list>
        {PROMPTS.map(({ text, icons }) => (
          <li
            key={text}
            className="group flex min-h-16 items-center justify-between gap-6 border-t border-mw-line py-[14px] transition-[padding] duration-400 ease-mw-out last:border-b hover:px-2 min-[860px]:[&:nth-last-child(2)]:border-b"
          >
            <p className="text-[16px] font-medium text-mw-strong">{text}</p>
            <span className="flex flex-none gap-3 text-mw-strong" aria-hidden="true">
              {icons.map((Icon, i) => (
                <Icon
                  key={i}
                  className="size-5 [transition:color_0.3s,scale_0.4s_cubic-bezier(0.3,0.66,0,1.18)] group-hover:scale-[1.12] group-hover:text-mw-accent"
                />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------- Setup ---------- */

const CONFIG = `{
  "mcpServers": {
    "magicwebs": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer \${MAGICWEBS_API_KEY}"
      }
    }
  }
}`

const CLI = `claude mcp add --transport http magicwebs ${MCP_URL} --header "Authorization: Bearer $MAGICWEBS_API_KEY"`

/** Colours the JSON config: keys, strings and punctuation. */
function highlight(json: string) {
  return json.split(/("(?:[^"\\]|\\.)*"\s*:?)/g).map((part, i) => {
    if (!part.startsWith('"')) return <span key={i} className="text-[#8a8a8a]">{part}</span>
    return (
      <span key={i} className={part.trimEnd().endsWith(":") ? "text-[#c9b0ff]" : "text-[#86efac]"}>
        {part}
      </span>
    )
  })
}

const CLIENT_FILES = [
  { name: "Claude Code", Icon: Terminal, file: ".mcp.json" },
  { name: "Cursor", Icon: MousePointer2, file: ".cursor/mcp.json" },
  { name: "VS Code", Icon: Code, file: ".vscode/mcp.json" },
  { name: "Windsurf", Icon: Wind, file: "~/.codeium/windsurf/mcp_config.json" },
]

export function Setup() {
  return (
    <section id="setup" className={SECTION} aria-labelledby="setup-title">
      <header className={INTRO} data-reveal>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-[0.02em] text-mw-accent uppercase">
          MCP server
        </span>
        <h2 id="setup-title" className={HEADING}>
          Connect it with one paste
        </h2>
        <p className={LEAD}>
          Add Magicwebs to your MCP client and your agent can clone, edit, publish and roll back pages in any project.
        </p>
      </header>
      <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start gap-x-12 gap-y-6 max-[860px]:grid-cols-1">
        <div data-reveal>
          <Snippet text={CONFIG} multiline>
            {highlight(CONFIG)}
          </Snippet>
        </div>
        <div className="flex flex-col gap-7" data-reveal>
          <div className="flex flex-col gap-3">
            <p className="text-[14px] font-medium text-mw-muted">Or add it from your terminal</p>
            <Snippet text={CLI} />
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-[14px] font-medium text-mw-muted">Where each client keeps the config</p>
            <ul className="flex list-none flex-col">
              {CLIENT_FILES.map(({ name, Icon, file }) => (
                <li
                  key={name}
                  className="flex items-center justify-between gap-4 border-t border-mw-line py-2.5 last:border-b"
                >
                  <span className="flex flex-none items-center gap-2 text-[14px] font-medium text-mw-strong [&_svg]:size-4 [&_svg]:text-mw-subtle">
                    <Icon />
                    {name}
                  </span>
                  <code className={`min-w-0 text-right text-[13px] wrap-anywhere text-mw-muted ${mw.mono}`}>{file}</code>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[13px] leading-[18px] text-mw-subtle [&_a]:text-mw-link [&_a]:underline [&_a]:underline-offset-2">
            Your API key lives in an environment variable, never in the prompt. Prefer clicking?{" "}
            <a href="/dashboard">Everything works in the visual editor too.</a>
          </p>
        </div>
      </div>
    </section>
  )
}

/* ---------- Vignettes ---------- */

type VLine = { node: React.ReactNode; tone?: "request" | "tool" | "out"; focus?: boolean }

function Req({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className={MUTED}>❯</span> {children}
    </>
  )
}

function Call({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className={OK}>●</span> <b style={{ color: "#fff" }}>{children}</b>
    </>
  )
}

function Res({ children, first = true }: { children: React.ReactNode; first?: boolean }) {
  return (
    <>
      <span className={MUTED}>{first ? "  └  " : "     "}</span>
      {children}
    </>
  )
}

const REASONS: { title: string; body: string; chip: string; ChipIcon: typeof Zap; lines: VLine[] }[] = [
  {
    title: "Exact clones, not lookalikes",
    body: "A real browser opens the page and keeps its markup, CSS, fonts and images. Scroll reveals, menus, tabs and carousels are replayed without the site's JavaScript.",
    chip: "Pixel-matched",
    ChipIcon: Layers,
    lines: [
      { node: <Req>Clone linear.app/pricing</Req> },
      { node: <Call>clone_landing_page(url: "https://linear.app/pricing")</Call> },
      { node: <Res>status: "cloning"</Res> },
      { node: <Call>list_projects()</Call> },
      { node: <Res>linear-pricing · ready · 1,204 CSS rules · 12 keyframes</Res>, focus: true },
      { node: <Res first={false}>reveals, tabs and the mobile menu replayed</Res>, focus: true },
    ],
  },
  {
    title: "Bad edits are rejected, not saved",
    body: "Every change is a typed operation that's validated before it touches the draft. A wrong id or field comes back as an error your agent can fix.",
    chip: "Validated first",
    ChipIcon: ShieldCheck,
    lines: [
      { node: <Req>Change the hero button to "Book a demo"</Req> },
      { node: <Call>set_field(sectionId: "s_hero9", path: "props.cta.label")</Call> },
      {
        node: (
          <Res>
            <span className="text-[#f87171]">error</span> No section with id "s_hero9"
          </Res>
        ),
        focus: true,
      },
      { node: <Call>get_page_outline()</Call> },
      { node: <Call>set_field(sectionId: "s_hero1", path: "props.cta.label")</Call> },
      {
        node: (
          <Res>
            <span className={OK}>✓</span> Draft saved
          </Res>
        ),
      },
    ],
  },
  {
    title: "Edits show up instantly",
    body: "The editor subscribes to the draft, so every change your agent or teammate makes appears in the preview the moment it's saved. No build, no deploy.",
    chip: "Live preview",
    ChipIcon: Zap,
    lines: [
      { node: <Req>Use Inter for headings and tighten the spacing</Req> },
      { node: <Call>update_theme(fonts: {"{"} heading: "Inter" {"}"})</Call> },
      {
        node: (
          <Res>
            <span className={OK}>✓</span> saved in 41ms · preview updated
          </Res>
        ),
        focus: true,
      },
      { node: <Call>update_section_style(sectionId: "s_hero1", style: {"{"} … {"}"})</Call> },
      {
        node: (
          <Res>
            <span className={OK}>✓</span> saved in 37ms · preview updated
          </Res>
        ),
        focus: true,
      },
    ],
  },
  {
    title: "Every publish is a version",
    body: "Publishing snapshots the draft and serves it from the edge. If something's off, one call points the site back at any earlier version.",
    chip: "One-call rollback",
    ChipIcon: History,
    lines: [
      { node: <Req>That headline was better before, put it back</Req> },
      { node: <Call>list_versions()</Call> },
      { node: <Res>v4 live · v3 · v2 · v1</Res> },
      { node: <Call>rollback_to_version(version: 3)</Call> },
      {
        node: (
          <Res>
            <span className={OK}>✓</span> v3 is live at <span className={MATCH}>acme.magicwebs.ai</span>
          </Res>
        ),
        focus: true,
      },
    ],
  },
  {
    title: "Your domain, served from the edge",
    body: "Every page gets a subdomain right away. Add your own domain, copy the DNS records we show, and it goes live with HTTPS once they check out.",
    chip: "Custom domains",
    ChipIcon: Globe,
    lines: [
      { node: <Req>Domains › add launch.acme.com</Req> },
      { node: <Call>add these DNS records</Call> },
      { node: <Res>CNAME  launch  →  sites.magicwebs.ai</Res> },
      { node: <Res first={false}>checking DNS… verified</Res> },
      {
        node: (
          <Res>
            <span className={OK}>✓</span> <span className={MATCH}>https://launch.acme.com</span> is active
          </Res>
        ),
        focus: true,
      },
    ],
  },
  {
    title: "Pick the model and the effort",
    body: "Choose Haiku, Sonnet or Opus and how hard it should think for each rebuild. Pages too big to copy are rebuilt by the model you chose, and every project shows its token cost.",
    chip: "Cost per project",
    ChipIcon: Cpu,
    lines: [
      { node: <Req>New project · bigsite.com · Opus 5.5 · high effort</Req> },
      { node: <Call>page is 9.2 MB, over the 4 MB copy limit</Call> },
      { node: <Res>rebuilding with Opus 5.5</Res> },
      { node: <Res first={false}>12 sections · 48k in · 21k out tokens</Res>, focus: true },
      {
        node: (
          <Res>
            <span className={OK}>✓</span> ready to edit
          </Res>
        ),
      },
    ],
  },
]

function Vignette({ lines, chip, ChipIcon }: { lines: VLine[]; chip: string; ChipIcon: typeof Zap }) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    gsap.registerPlugin(ScrollTrigger)
    const ctx = gsap.context(() => {
      const rows = el.querySelectorAll("[data-vline]")
      const focus = el.querySelectorAll("[data-vfocus]")
      const tl = gsap.timeline({ paused: true })
      tl.fromTo(rows, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.38, ease: "power2.out" })
        .fromTo(
          focus,
          { backgroundColor: "rgba(255,255,255,0.16)" },
          { backgroundColor: "rgba(255,255,255,0)", duration: 1.2, stagger: 0.2 },
          "-=0.6",
        )
        .fromTo(
          el.querySelector("[data-vchip]"),
          { opacity: 0, y: 8, scale: 0.85 },
          { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(2)" },
          "-=1",
        )
      ScrollTrigger.create({ trigger: el, start: "top 80%", once: true, onEnter: () => tl.play() })
    }, el)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={ref} className="flex w-full justify-center px-7 pt-7 max-[860px]:px-4 max-[860px]:pt-5" aria-hidden="true">
      <div className="flex w-full max-w-[440px] flex-col rounded-t-[12px] bg-mw-dark text-mw-on-dark shadow-[0_0_0_1px_#0000000f,0_16px_32px_-12px_#0000003d,inset_0_0_0_1px_#ffffff1f]">
        <div className="flex gap-[5px] px-3 py-2.5 [&_span]:size-2 [&_span]:rounded-full [&_span]:bg-[#ffffff26]">
          <span />
          <span />
          <span />
        </div>
        <div
          className={`relative flex flex-col gap-[3px] px-[14px] pb-[18px] text-[11.5px] leading-[17px] max-[860px]:pb-[52px] ${mw.mono}`}
        >
          {lines.map((line, i) => (
            <p key={i} className="-mx-1 rounded-[4px] px-1 whitespace-pre-wrap" data-vline data-vfocus={line.focus || undefined}>
              {line.node}
            </p>
          ))}
          <span
            className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-[99px] bg-white py-1 pr-2.5 pl-2 font-sans text-[12px] font-semibold text-mw-strong shadow-[0_0_0_1px_#0000000f,0_6px_16px_-4px_#00000040] [&_svg]:size-[14px] [&_svg]:text-mw-accent"
            data-vchip
          >
            <ChipIcon />
            {chip}
          </span>
        </div>
      </div>
    </div>
  )
}

export function Reasons() {
  return (
    <section id="safety" className={SECTION} aria-labelledby="why-title">
      <header className={INTRO} data-reveal>
        <h2 id="why-title" className={HEADING}>
          Safe to hand to your agent
        </h2>
        <p className={LEAD}>
          Your agent gets exact pages, clear errors and instant feedback, while every published version stays one call
          away.
        </p>
      </header>
      <ul
        className="grid list-none grid-cols-2 overflow-hidden rounded-[24px] border border-mw-line max-[860px]:grid-cols-1"
        data-reveal
      >
        {REASONS.map(({ title, body, chip, ChipIcon, lines }) => (
          <li
            key={title}
            className="row-span-2 grid grid-rows-subgrid gap-y-6 border-mw-line p-(--pad) [--pad:32px] max-[860px]:[--pad:20px] [&:not(:nth-last-child(-n+2))]:border-b min-[860px]:odd:border-r max-[860px]:[&:nth-last-child(2)]:border-b"
          >
            <div className="-mx-(--pad) -mt-(--pad) flex min-h-[244px] overflow-hidden border-b border-mw-line bg-mw-sunk max-[860px]:min-h-0">
              <Vignette lines={lines} chip={chip} ChipIcon={ChipIcon} />
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-[16px] font-semibold text-mw-strong">{title}</h3>
              <p className="text-[16px] leading-6 text-pretty text-mw-muted">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------- FAQ ---------- */

const FAQS = [
  {
    q: "What does an exact clone mean?",
    a: "Magicwebs opens the page in a real browser and keeps its own markup and CSS, pruned to the rules the page uses, along with its fonts and images. What the site's JavaScript did, like scroll reveals, menus, accordions and carousels, is recorded and replayed without that JavaScript.",
  },
  {
    q: "Which agents and MCP clients work with it?",
    a: "Any client that speaks Streamable HTTP MCP, including Claude Code, Cursor, VS Code, Windsurf, Zed and Cline. Point it at the /mcp endpoint with your API key as a bearer token.",
  },
  {
    q: "Do I need to code to use it?",
    a: "No. The visual editor and the AI chat in the app make the same edits your agent does. MCP is there for when you'd rather work from your coding agent.",
  },
  {
    q: "Can I publish to my own domain?",
    a: "Yes. Every page gets a subdomain right away. Add your own domain, create the DNS records Magicwebs shows you, and it goes live with HTTPS once they're verified.",
  },
  {
    q: "What if a page is too big to copy?",
    a: "Pages over 4 MB are rebuilt by the AI model you chose when creating the project, as editable sections instead of copied markup.",
  },
  {
    q: "Can I undo a publish?",
    a: "Every publish is saved as an immutable version. Roll back from the app, or ask your agent to call rollback_to_version, and the site switches over at once.",
  },
]

export function Faq() {
  return (
    <section id="faq" className={`${SECTION} flex flex-col items-center gap-12`} aria-labelledby="faq-title">
      <h2 id="faq-title" className={`${HEADING} text-center`} data-reveal>
        Questions about Magicwebs
      </h2>
      <div className="flex w-full max-w-[715px] flex-col gap-1 [interpolate-size:allow-keywords]" data-reveal-list>
        {FAQS.map(({ q, a }) => (
          <details
            key={q}
            className="group/faq rounded-[16px] px-[18px] py-[14px] transition-[background-color] duration-200 ease-mw-out open:bg-[#f2f2f2] hover:bg-[#f2f2f2] [&::details-content]:overflow-clip [&::details-content]:[block-size:0] [&::details-content]:[transition:block-size_0.45s_cubic-bezier(0.19,0.74,0.05,1),content-visibility_0.45s_allow-discrete] open:[&::details-content]:[block-size:auto]"
          >
            <summary className="-mx-[18px] -my-[14px] flex cursor-pointer list-none items-start gap-4 px-[18px] py-[14px] text-[19px] leading-[1.3] font-medium tracking-[-0.01em] text-black [&::-webkit-details-marker]:hidden">
              <span className="flex-1">{q}</span>
              <ChevronDown className="mt-0.5 size-5 flex-none transition-[rotate] duration-[450ms] ease-mw-spring group-open/faq:rotate-180" />
            </summary>
            <p className="translate-y-6 pt-[14px] text-[16px] leading-[1.6] font-medium text-[#666c76] opacity-0 transition-[opacity,translate] duration-[450ms] ease-mw-spring group-open/faq:translate-none group-open/faq:opacity-100">
              {a}
            </p>
          </details>
        ))}
      </div>
    </section>
  )
}

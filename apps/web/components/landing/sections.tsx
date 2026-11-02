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

import s from "./landing.module.css"
import { prefersReducedMotion } from "./hero"
import { Snippet } from "./ui"

const MCP_URL = "https://api.magicwebs.ai/mcp"

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
    <section className={`${s.section} ${s.afterShot} ${s.container}`} aria-labelledby="prompts-title">
      <header className={s.intro} data-reveal>
        <h2 id="prompts-title" className={s.heading}>
          Ask for what you need
        </h2>
        <p className={s.lead}>
          Describe the change in plain words. Your agent turns it into edits on the page. A few requests people make:
        </p>
      </header>
      <ul className={s.prompts} data-reveal-list>
        {PROMPTS.map(({ text, icons }) => (
          <li key={text} className={s.prompt}>
            <p className={s.promptText}>{text}</p>
            <span className={s.promptIcons} aria-hidden="true">
              {icons.map((Icon, i) => (
                <Icon key={i} />
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
    if (!part.startsWith('"')) return <span key={i} className={s["tok-dim"]}>{part}</span>
    return (
      <span key={i} className={part.trimEnd().endsWith(":") ? s["tok-key"] : s["tok-str"]}>
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
    <section id="setup" className={`${s.section} ${s.container}`} aria-labelledby="setup-title">
      <header className={s.intro} data-reveal>
        <span className={s.eyebrow}>MCP server</span>
        <h2 id="setup-title" className={s.heading}>
          Connect it with one paste
        </h2>
        <p className={s.lead}>
          Add Magicwebs to your MCP client and your agent can clone, edit, publish and roll back pages in any project.
        </p>
      </header>
      <div className={s.setupGrid}>
        <div data-reveal>
          <Snippet text={CONFIG} multiline>
            {highlight(CONFIG)}
          </Snippet>
        </div>
        <div className={s.setupSide} data-reveal>
          <div className={s.setupStep}>
            <p className={s.label}>Or add it from your terminal</p>
            <Snippet text={CLI} />
          </div>
          <div className={s.setupStep}>
            <p className={s.label}>Where each client keeps the config</p>
            <ul className={s.files}>
              {CLIENT_FILES.map(({ name, Icon, file }) => (
                <li key={name} className={s.file}>
                  <span className={s.fileAgent}>
                    <Icon />
                    {name}
                  </span>
                  <code className={s.mono}>{file}</code>
                </li>
              ))}
            </ul>
          </div>
          <p className={s.smallCaption}>
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
      <span className={s.muted}>❯</span> {children}
    </>
  )
}

function Call({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className={s.dot}>●</span> <b style={{ color: "#fff" }}>{children}</b>
    </>
  )
}

function Res({ children, first = true }: { children: React.ReactNode; first?: boolean }) {
  return (
    <>
      <span className={s.muted}>{first ? "  └  " : "     "}</span>
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
            <span className={s.err}>error</span> No section with id "s_hero9"
          </Res>
        ),
        focus: true,
      },
      { node: <Call>get_page_outline()</Call> },
      { node: <Call>set_field(sectionId: "s_hero1", path: "props.cta.label")</Call> },
      {
        node: (
          <Res>
            <span className={s.ok}>✓</span> Draft saved
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
            <span className={s.ok}>✓</span> saved in 41ms · preview updated
          </Res>
        ),
        focus: true,
      },
      { node: <Call>update_section_style(sectionId: "s_hero1", style: {"{"} … {"}"})</Call> },
      {
        node: (
          <Res>
            <span className={s.ok}>✓</span> saved in 37ms · preview updated
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
            <span className={s.ok}>✓</span> v3 is live at <span className={s.match}>acme.magicwebs.ai</span>
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
            <span className={s.ok}>✓</span> <span className={s.match}>https://launch.acme.com</span> is active
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
            <span className={s.ok}>✓</span> ready to edit
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
    <div ref={ref} className={s.scene} aria-hidden="true">
      <div className={s.vWindow}>
        <div className={s.vBar}>
          <span />
          <span />
          <span />
        </div>
        <div className={`${s.vScreen} ${s.mono}`}>
          {lines.map((line, i) => (
            <p key={i} className={s.vLine} data-vline data-vfocus={line.focus || undefined}>
              {line.node}
            </p>
          ))}
          <span className={s.chip} data-vchip>
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
    <section id="safety" className={`${s.section} ${s.container}`} aria-labelledby="why-title">
      <header className={s.intro} data-reveal>
        <h2 id="why-title" className={s.heading}>
          Safe to hand to your agent
        </h2>
        <p className={s.lead}>
          Your agent gets exact pages, clear errors and instant feedback, while every published version stays one call
          away.
        </p>
      </header>
      <ul className={s.reasons} data-reveal>
        {REASONS.map(({ title, body, chip, ChipIcon, lines }) => (
          <li key={title} className={s.reason}>
            <div className={s.vignetteStage}>
              <Vignette lines={lines} chip={chip} ChipIcon={ChipIcon} />
            </div>
            <div className={s.reasonText}>
              <h3 className={s.reasonTitle}>{title}</h3>
              <p className={s.body}>{body}</p>
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
    <section id="faq" className={`${s.section} ${s.faq} ${s.container}`} aria-labelledby="faq-title">
      <h2 id="faq-title" className={`${s.heading} ${s.center}`} data-reveal>
        Questions about Magicwebs
      </h2>
      <div className={s.faqList} data-reveal-list>
        {FAQS.map(({ q, a }) => (
          <details key={q} className={s.faqItem}>
            <summary className={s.faqQ}>
              <span>{q}</span>
              <ChevronDown />
            </summary>
            <p className={s.faqA}>{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

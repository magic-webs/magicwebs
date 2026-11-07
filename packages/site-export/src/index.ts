import { HOME_PATH, rewriteSiteLinks, type PageDoc } from "@magicwebs/page-schema"

import { KIT } from "./kit.generated"

// Turns a Magicwebs site into a standalone Next.js (App Router) project: the
// pages as JSON content, the same renderer and schema code that draws them on
// Magicwebs (lib/magicwebs, embedded by scripts/build-export-kit.ts), and one
// statically generated route that serves every page.

export type ExportPage = {
  /** Where the site serves the page: "/" or e.g. "/about". */
  path: string
  title: string
  /** The original page it was cloned from, used to point links between pages at the export. */
  sourceUrl?: string
  doc: PageDoc
}

export type ExportSite = { name: string; pages: ExportPage[] }

/** Versions the exported project installs; kept in step with the platform's. */
const VERSIONS = {
  next: "16.4.3",
  react: "19.3.1",
  zod: "^4.6.7",
  htmlparser2: "^10.1.0",
  typescript: "^5",
}

function packageName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "site"
  )
}

/** A file name for a page's content: "index" for the home page, "about-team" for /about/team. */
function contentName(path: string, taken: Set<string>): string {
  const base =
    path === HOME_PATH
      ? "index"
      : path
          .slice(1)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "page"
  let name = base
  for (let i = 2; taken.has(name); i++) name = `${base}-${i}`
  taken.add(name)
  return name
}

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n"

const LAYOUT = `import type { ReactNode } from "react"

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Entrance animations start hidden only when scripts run. */}
        <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.classList.add("mw-js")' }} />
      </head>
      <body style={{ margin: 0 }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
`

const SITE_LIB = `import { readFileSync } from "node:fs"
import path from "node:path"

import type { PageDoc } from "@magicwebs/page-schema"

import site from "@/content/site.json"

export type SitePage = { path: string; title: string; file: string }

export const pages: SitePage[] = site.pages

export function findPage(slug: string[] | undefined): SitePage | undefined {
  const target = "/" + (slug ?? []).map(decodeURIComponent).join("/")
  return pages.find((p) => p.path === target)
}

/** A page's document, read from content/pages at build time. */
export function loadDoc(page: SitePage): PageDoc {
  return JSON.parse(readFileSync(path.join(process.cwd(), "content", "pages", page.file), "utf8")) as PageDoc
}
`

const PAGE = `import type { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  ANIMATION_SCRIPT,
  customScript,
  documentCss,
  EXACT_RUNTIME_SCRIPT,
  fontHref,
  isExact,
  PageRenderer,
  rootAttributes,
  safeSrc,
} from "@magicwebs/renderer"
import type { PageDoc } from "@magicwebs/page-schema"

import { findPage, loadDoc, pages } from "@/lib/site"

type Props = { params: Promise<{ slug?: string[] }> }

// Every page is generated at build time; unknown paths are 404s.
export const dynamicParams = false

export function generateStaticParams() {
  return pages.map((page) => ({ slug: page.path === "/" ? [] : page.path.slice(1).split("/") }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = findPage((await params).slug)
  if (!page) return {}
  const { meta } = loadDoc(page)
  const ogImage = safeSrc(meta.ogImage)
  const favicon = safeSrc(meta.favicon)
  return {
    title: meta.title,
    description: meta.description,
    icons: favicon ? { icon: favicon } : undefined,
    openGraph: { title: meta.title, description: meta.description, images: ogImage ? [ogImage] : undefined },
    twitter: { card: ogImage ? "summary_large_image" : "summary" },
  }
}

/** Language, classes and data-* attributes the page's CSS expects on <html> and <body>. */
function rootScript(doc: PageDoc): string {
  const set = (target: string, cls: string | undefined, attrs: Record<string, string>) =>
    (cls ? \`\${target}.className+=" "+\${JSON.stringify(cls)};\` : "") +
    Object.entries(attrs)
      .map(([name, value]) => \`\${target}.setAttribute(\${JSON.stringify(name)},\${JSON.stringify(value)});\`)
      .join("")
  return (
    \`document.documentElement.lang=\${JSON.stringify(doc.meta.lang ?? "en")};\` +
    set("document.documentElement", doc.styles?.htmlClass, rootAttributes(doc, "html")) +
    set("document.body", doc.styles?.bodyClass, rootAttributes(doc, "body"))
  )
}

export default async function Page({ params }: Props) {
  const page = findPage((await params).slug)
  if (!page) notFound()
  const doc = loadDoc(page)
  const fonts = fontHref(doc.theme)
  const script = customScript(doc)
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: rootScript(doc) }} />
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}
      <style dangerouslySetInnerHTML={{ __html: documentCss(doc) }} />
      <PageRenderer doc={doc} />
      <script dangerouslySetInnerHTML={{ __html: ANIMATION_SCRIPT }} />
      {isExact(doc) && <script dangerouslySetInnerHTML={{ __html: EXACT_RUNTIME_SCRIPT }} />}
      {script && <script dangerouslySetInnerHTML={{ __html: script }} />}
    </>
  )
}
`

const NEXT_CONFIG = `/** @type {import("next").NextConfig} */
const nextConfig = {}

export default nextConfig
`

const TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    lib: ["dom", "dom.iterable", "esnext"],
    allowJs: false,
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: "esnext",
    moduleResolution: "bundler",
    resolveJsonModule: true,
    isolatedModules: true,
    jsx: "react-jsx",
    incremental: true,
    plugins: [{ name: "next" }],
    paths: {
      "@/*": ["./*"],
      "@magicwebs/page-schema": ["./lib/magicwebs/page-schema/index.ts"],
      "@magicwebs/renderer": ["./lib/magicwebs/renderer/index.tsx"],
    },
  },
  include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  exclude: ["node_modules"],
}

const GITIGNORE = `node_modules
.next
out
next-env.d.ts
*.tsbuildinfo
.env*.local
`

function readme(site: ExportSite, files: { path: string; file: string }[]): string {
  return `# ${site.name}

Exported from [Magicwebs](https://magicwebs.ai) as a Next.js (App Router) project.

## Run it

\`\`\`sh
npm install
npm run dev     # http://localhost:3000
npm run build   # every page is generated statically
\`\`\`

Deploy it to Vercel, Netlify or any Node host. Add \`output: "export"\` to \`next.config.mjs\` to get plain static files instead.

## Where things are

| Page | Content |
| --- | --- |
${files.map((f) => `| \`${f.path}\` | \`content/pages/${f.file}\` |`).join("\n")}

- \`content/pages/*.json\`: each page as a page document: its theme (colors, fonts, design template) and its sections in order. Edit text, links and images here.
- \`content/site.json\`: the list of pages and the paths they are served at.
- \`app/[[...slug]]/page.tsx\`: the one route that renders every page, with its metadata.
- \`lib/magicwebs/renderer\`: the React components for each section type and the page CSS (\`css.ts\`, plus \`templates.ts\` for the design templates).
- \`lib/magicwebs/page-schema\`: the page document schema (\`schema.ts\`) and the HTML/CSS sanitizer used for exact copies.

Images and fonts load from where Magicwebs stored them; copy them into \`public/\` and update the URLs if you want to host them yourself.
`
}

/** Every file of the exported Next.js project, by path. */
export function buildNextProject(site: ExportSite): Record<string, string> {
  if (!site.pages.length) throw new Error("The site has no pages to export")
  const linkable = site.pages.filter((p) => p.sourceUrl).map((p) => ({ path: p.path, source: p.sourceUrl! }))
  const taken = new Set<string>()
  const entries = site.pages.map((page) => ({ page, file: `${contentName(page.path, taken)}.json` }))

  const files: Record<string, string> = {
    "package.json": json({
      name: packageName(site.name),
      version: "0.1.0",
      private: true,
      scripts: { dev: "next dev", build: "next build", start: "next start" },
      dependencies: {
        next: VERSIONS.next,
        react: VERSIONS.react,
        "react-dom": VERSIONS.react,
        zod: VERSIONS.zod,
        htmlparser2: VERSIONS.htmlparser2,
      },
      devDependencies: {
        typescript: VERSIONS.typescript,
        "@types/node": "^20",
        "@types/react": "^19",
        "@types/react-dom": "^19",
      },
    }),
    "next.config.mjs": NEXT_CONFIG,
    "tsconfig.json": json(TSCONFIG),
    ".gitignore": GITIGNORE,
    "README.md": readme(site, entries.map(({ page, file }) => ({ path: page.path, file }))),
    "app/layout.tsx": LAYOUT,
    "app/[[...slug]]/page.tsx": PAGE,
    "lib/site.ts": SITE_LIB,
    "content/site.json": json({
      name: site.name,
      pages: entries.map(({ page, file }) => ({ path: page.path, title: page.title, file })),
    }),
    ...KIT,
  }
  for (const { page, file } of entries) {
    const doc = linkable.length > 1 ? rewriteSiteLinks(page.doc, linkable) : page.doc
    files[`content/pages/${file}`] = json(doc)
  }
  return files
}

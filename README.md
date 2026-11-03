# Magicwebs

Clone any public landing page into an editable page, edit it with AI (in the app or from any MCP client), and publish it to a subdomain or a custom domain.

## Structure

```
apps/
  web/        Next.js platform UI: dashboard, visual editor, AI chat, versions, domains
  api/        Hono on Bun: streaming AI chat (/chat) and the MCP server (/mcp)
  crawler/    Playwright + Cheerio clone worker, runs in Docker on the VPS
  edge/       Cloudflare Worker that serves every published page
packages/
  backend/    Convex schema and functions (projects, drafts, versions, jobs, domains)
  page-schema/  The page JSON schema and edit operations shared by everything
  renderer/   React component registry that renders a page document
```

## How it fits together

- **One page document per project** (`packages/page-schema`) is the single source of truth: meta, theme tokens, and an ordered list of typed sections (`navbar`, `hero`, `features`, `pricing`, …, plus a free-form `custom` section for anything the registry can't express).
- **All edits are operations** (`set_field`, `add_section`, `update_theme`, …). The visual editor, the AI chat and MCP clients all send the same operations to one Convex mutation, which validates them and saves the draft atomically.
- **Instant editing**: the editor subscribes to the draft with a Convex reactive query and renders it in an iframe through a portal, so changes appear immediately with no build or deploy.
- **Cloning** makes an exact copy. Creating a project queues a job, and a crawler worker (`apps/crawler/src/exact.ts`) opens the page in Playwright and:
  - splits it into blocks, each stored as an `html` section holding its real markup inside copies of its ancestors, with hidden placeholders for their other children so `body >`, `:nth-child` and sibling selectors still match;
  - keeps the original CSS, pruned to the rules the markup uses (`:hover`, `@keyframes`, media queries, fonts), with `http:` assets upgraded to `https:`;
  - records what the site's JavaScript did, and the renderer's runtime (`packages/renderer/src/runtime.ts`) replays it without that JavaScript: scroll reveals and count-ups, styles scrubbed by the scroll position (GSAP ScrollTrigger) with Lenis-style smooth wheel scrolling, AOS / WOW / animate.css entrances, header classes on scroll, clicks on menus, accordions and tabs (including closing them), markup and classes that change at phone widths, and carousels as scroll-snap strips with working arrows;
  - copies images and fonts to R2. The R2 bucket needs CORS that allows the sites' origins, or browsers won't load the fonts.

  Pages too big to copy (over 4 MB) are rebuilt by the AI model chosen at creation instead. Exact markup is sanitized every time it is rendered (`packages/page-schema/src/sanitize.ts`), and long strings are stored in the `blobs` table rather than inside the draft, so pages can exceed Convex's 1 MiB document limit.
- **Publishing** snapshots the draft as an immutable version and writes it to Workers KV. The single edge Worker maps the hostname to a project, server-renders the published JSON with the shared renderer, and caches the HTML per version. Rolling back points the site at an earlier version.
- **Accounts**: people sign in to the platform with email and password or Google (Convex Auth). Every project belongs to a user, and every Convex function checks that the caller owns what it touches. The API server never uses a privileged client: the AI chat runs as the signed-in user's session, and MCP clients as the owner of their API key.
- **Whose AI**: the in-app AI chat and clones started on the platform run on the platform's AI Gateway key. MCP clients (Claude Code, Cursor, any agent) bring their own model and never use the platform's AI: when a page an agent clones is too large to copy exactly, the crawler leaves a rebuild brief (screenshots and the captured structure) instead of calling the AI, and the agent rebuilds the page itself with `get_rebuild_brief` and `submit_rebuilt_page`.
- **Custom domains** use Cloudflare for SaaS: Convex creates the custom hostname, shows the DNS records to add, and routes the hostname once Cloudflare reports it active.

## Running locally

Requires Bun 1.4+.

```sh
bun install
cp apps/api/.env.example apps/api/.env          # fill in CONVEX_URL, AI_GATEWAY_API_KEY
cp apps/crawler/.env.example apps/crawler/.env  # fill in CONVEX_URL, WORKER_SECRET, AI_GATEWAY_API_KEY
bun run secrets      # WORKER_SECRET for the crawler and Convex, plus Convex Auth's JWT_PRIVATE_KEY and JWKS
npx convex env set SITE_URL http://localhost:3000  # run inside packages/backend
# Google sign-in (optional): AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, with the redirect URI
# <your CONVEX_SITE_URL>/api/auth/callback/google

bun run dev           # all of the below at once (or e.g. `bun run dev web api`)

bun run dev:backend   # Convex: pushes functions, regenerates types
bun run dev:web       # http://localhost:3000
bun run dev:api       # http://localhost:8787
bun run dev:crawler   # needs `bunx playwright install chromium` once
bun run dev:edge      # Cloudflare Worker via wrangler
```

`bun run typecheck` checks every workspace; `bun test` runs the tests.

## Deploying

- **Backend**: `bun --filter @magicwebs/backend deploy`, then set the Convex environment variables listed in `packages/backend/.env.example`.
- **Crawler**: on the VPS, `docker compose -f apps/crawler/docker-compose.yml up -d --build` (scale with `replicas`). Restrict the containers' egress to the public internet as a second line of defence behind the crawler's private-address checks.
- **Edge**: create the KV namespace, put its id in `apps/edge/wrangler.jsonc`, set your zone in `routes`, then `bun run --filter @magicwebs/edge deploy`.
- **API** and **web**: any Bun or Node host.

## Connecting an MCP client

The API exposes a Streamable HTTP MCP endpoint at `/mcp`. Create a personal API key on the dashboard's **MCP & API** page and send it as `Authorization: Bearer <key>`. A key acts as its owner and reaches only their projects; revoking it takes effect immediately. Only a hash of each key is stored.

Tools include `list_projects`, `clone_landing_page`, `get_rebuild_brief`, `submit_rebuilt_page`, `get_page_outline`, `get_section`, every edit operation, `apply_operations`, `publish_page`, `list_versions` and `rollback_to_version`.

Projects created before accounts existed have no owner. Give them to an account with `bunx convex run migrations:claimProjects '{"email":"you@example.com"}'` (inside packages/backend, after signing up).

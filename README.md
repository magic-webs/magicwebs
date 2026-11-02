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
- **Cloning**: creating a project queues a job. A crawler worker claims it, captures screenshots and computed styles with Playwright, extracts metadata with Cheerio, has Claude Haiku 5.5 (via Vercel AI Gateway) rebuild the page as a schema-valid document, copies images to R2, and writes the draft.
- **Publishing** snapshots the draft as an immutable version and writes it to Workers KV. The single edge Worker maps the hostname to a project, server-renders the published JSON with the shared renderer, and caches the HTML per version. Rolling back points the site at an earlier version.
- **Custom domains** use Cloudflare for SaaS: Convex creates the custom hostname, shows the DNS records to add, and routes the hostname once Cloudflare reports it active.

## Running locally

Requires Bun 1.4+.

```sh
bun install
cp apps/api/.env.example apps/api/.env          # fill in CONVEX_URL, AI_GATEWAY_API_KEY
cp apps/crawler/.env.example apps/crawler/.env  # fill in CONVEX_URL, WORKER_SECRET, AI_GATEWAY_API_KEY
npx convex env set WORKER_SECRET <same-secret>  # run inside packages/backend

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

The API exposes a Streamable HTTP MCP endpoint at `/mcp`, authenticated with `Authorization: Bearer $MCP_API_KEY`. Tools include `list_projects`, `clone_landing_page`, `get_page_outline`, `get_section`, every edit operation, `apply_operations`, `publish_page`, `list_versions` and `rollback_to_version`.

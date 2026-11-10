# Deploying Magicwebs

| Part | Runs on | Deployed by |
|---|---|---|
| `apps/web` (dashboard, Next.js) | Vercel | Vercel's GitHub integration, on every push |
| `apps/api` (AI chat `/chat`, MCP `/mcp`) | VPS, behind Caddy at `https://build-api.magicwebs.ai` | [api.yml](../.github/workflows/api.yml) |
| `apps/crawler` (rebuild workers) | VPS, no ports | [crawler.yml](../.github/workflows/crawler.yml) |
| `apps/edge` (customer sites) | Cloudflare Workers | `bun run --filter @magicwebs/edge deploy` |
| `packages/backend` (Convex) | Convex cloud | `bun --filter @magicwebs/backend deploy` |

## Which Convex deployment

| Deployment | Used by |
|---|---|
| **prod** `fearless-stork-537` | Vercel web app, VPS API and crawler, edge worker |
| **dev** `watchful-robin-407` | Local development only (`bun run dev` / `convex dev`) |

- **Backend changes reach prod only through `bun --filter @magicwebs/backend deploy`** (`convex deploy`). Saving files while `convex dev` runs only touches dev.
- **Deploy the backend before the services that need it.** A crawler or API image that calls a new function fails until that function is on prod.
- **Env vars are per deployment.** Set prod values with `bunx convex env set --prod NAME value` from `packages/backend`.
- **Google sign-in** needs `https://fearless-stork-537.convex.site/api/auth/callback/google` as a redirect URI. Dev keeps its own.

Prod was seeded from a dev snapshot on 2026-11-10 (`convex export` → `convex import --prod --replace-all`). Dev data has diverged since then.

## VPS services (API and crawler)

Both services use the shared pipeline [deploy-vps.yml](../.github/workflows/deploy-vps.yml):

```
push to main ─▶ typecheck ─▶ build image ─▶ ghcr.io/magic-webs/magicwebs-<service>:<sha>
                                                 │
     scp deploy/<service>/* + ssh deploy@VPS ◀───┘  docker compose pull && up -d
```

Each service lives in `/opt/magicwebs/<service>` on the VPS:

| File | What it is |
|---|---|
| `docker-compose.yml` (and `Caddyfile` for the API) | copied from `deploy/<service>/` on each deploy |
| `.env` | `IMAGE_TAG=<sha>`, written by each deploy; shows which commit is running |
| `<service>.env` | the service's secrets, kept **only** on the VPS |

A workflow runs when its app, `deploy/<service>/`, `packages/backend`, `packages/page-schema`, the lockfile or the workflows change. Pull requests run only the typecheck. A deploy waits 30 seconds, then fails and prints the logs if any container is not running and healthy.

### One-time VPS setup

These steps are already done for 187.127.186.119. Re-run them for a new server.

1. **Deploy key** (on your PC):
   ```powershell
   ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\magicwebs_deploy" -C "github-actions-deploy"
   ```
   Press Enter twice when asked for a passphrase, to leave it empty.
2. **Bootstrap** (PowerShell, from the repo root):
   ```powershell
   $key = Get-Content "$env:USERPROFILE\.ssh\magicwebs_deploy.pub"
   (Get-Content deploy\bootstrap.sh -Raw) -replace "`r","" | ssh root@187.127.186.119 "bash -s -- '$key'"
   ```
   This installs Docker and creates the `deploy` user and `/opt/magicwebs/{crawler,api}`. It also turns on ufw (22, 80 and 443), fail2ban, unattended upgrades and swap. It is safe to re-run.
3. **GitHub secrets.** Go to Settings → Environments → `production` and add:

   | Secret | Value |
   |---|---|
   | `VPS_HOST` | `187.127.186.119` |
   | `VPS_USER` | `deploy` |
   | `VPS_SSH_KEY` | the private key file, including the BEGIN and END lines |
   | `VPS_KNOWN_HOSTS` | `ssh-keyscan -t ed25519 187.127.186.119`, run from Git Bash. Windows' own ssh-keyscan is too old for the server. |

### Crawler secrets: `/opt/magicwebs/crawler/crawler.env`

Use [apps/crawler/.env.example](../apps/crawler/.env.example) as the template.

- `CONVEX_URL`: the prod Convex deployment, `https://fearless-stork-537.convex.cloud`.
- `WORKER_SECRET`: the same value as `WORKER_SECRET` in that deployment's Convex env.
- `WORKER_ID`: leave it empty, so each replica picks its own id.
- `R2_*`: a token with Object Read & Write.

### API secrets: `/opt/magicwebs/api/api.env`

```
CONVEX_URL=https://fearless-stork-537.convex.cloud
AI_GATEWAY_API_KEY=<Vercel AI Gateway key>
WEB_ORIGINS=https://build.magicwebs.ai
R2_BUCKET=<same bucket as the crawler>
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<token with Object Read & Write>
R2_SECRET_ACCESS_KEY=<…>
R2_PUBLIC_URL=https://assets.magicwebs.ai
```

The `R2_*` values store the images, videos and files people attach in the AI chat. Without them, the chat's attach button reports that uploads aren't set up.

`WEB_ORIGINS` lists the dashboard origins, comma-separated, that may call `/chat` from the browser. It must match the domain you give the web app on Vercel. `PORT` is set by the compose file.

### API domain

Add this record in Cloudflare → magicwebs.ai → DNS → **Add record**:

| Type | Name | Content | Proxy |
|---|---|---|---|
| `A` | `build-api` | `187.127.186.119` | **DNS only** (grey cloud) |

The record must be DNS only:
- Caddy gets its certificate from Let's Encrypt over port 80, which needs a direct connection to the VPS.
- A proxied `build-api` record would be caught by the edge worker's `*.magicwebs.ai/*` route.

The domain is set in [deploy/api/Caddyfile](api/Caddyfile). Check it once deployed:

```powershell
curl https://build-api.magicwebs.ai/health   # {"ok":true}
```

If the certificate does not appear, run `docker compose logs caddy` in `/opt/magicwebs/api`. Also check that ports 80 and 443 are open in the **Hostinger panel firewall**, if you use it.

## Web on Vercel

1. In Vercel, go to **Add New → Project** and import `magic-webs/magicwebs`.
2. Set **Root Directory** to `apps/web`. Leave the framework (Next.js) and the build and install commands on their defaults. Vercel finds the workspace's `bun.lock` and installs with Bun.
3. Add these **Environment Variables** for Production:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_CONVEX_URL` | `https://fearless-stork-537.convex.cloud` (prod, the same deployment as the VPS services) |
   | `NEXT_PUBLIC_API_URL` | `https://build-api.magicwebs.ai` |

4. Click **Deploy**. Every push to `main` then deploys production, and every other branch or PR gets a preview URL.
5. **Domain.** In Project → Settings → Domains, add e.g. `build.magicwebs.ai`. In Cloudflare, add the record Vercel shows (for a subdomain, `CNAME build → cname.vercel-dns.com`) with the proxy set to **DNS only**. Vercel issues the certificate itself, and the edge worker's wildcard route would catch a proxied record.
6. Point the other services at the new domain:
   - Convex env: `bunx convex env set SITE_URL https://build.magicwebs.ai`, run from `packages/backend` (add `--prod` for the live deployment). OAuth redirects back here.
   - The API's `WEB_ORIGINS` in `api.env`. Then run `docker compose up -d --force-recreate` in `/opt/magicwebs/api`.

Preview deployments use their own `*.vercel.app` origin. The API's CORS rule blocks the AI chat there unless you add that origin to `WEB_ORIGINS`.

## Day to day

On the VPS (`ssh deploy@187.127.186.119`, then `cd /opt/magicwebs/<service>`):

```bash
docker compose ps                     # status
docker compose logs -f --tail 100     # live logs
docker compose up -d --force-recreate # after editing <service>.env
cat .env                              # which commit is running
```

- **Roll back:** go to Actions → Crawler (or API) → Run workflow and enter an earlier commit SHA as `tag`. The build is skipped and that image is redeployed. Images older than three days are pruned from the VPS but remain in GHCR.
- **Scale the crawler:** change `replicas` in [deploy/crawler/docker-compose.yml](crawler/docker-compose.yml). Each worker is capped at 2 GB, and the box has 16 GB.
- **Graceful stop:** a crawler worker finishes its current job after SIGTERM. Compose waits up to 5 minutes before killing it.

## Hardening

- Turn off root password login. First check that your own key works: `ssh root@...` should not prompt for a password. Then put `PasswordAuthentication no` and `PermitRootLogin prohibit-password` in `/etc/ssh/sshd_config.d/50-hardening.conf` and run `systemctl reload ssh`.
- In the Hostinger panel firewall, allow inbound traffic only on 22, 80 and 443.

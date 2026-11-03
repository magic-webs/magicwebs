# Deploying the crawler (Hostinger VPS)

The crawler workers pull jobs from Convex and open no ports, so the VPS needs only Docker and SSH. No nginx, domain or TLS is involved.

```
push to main ─▶ GitHub Actions: typecheck ─▶ build image ─▶ ghcr.io/magic-webs/magicwebs-crawler:<sha>
                                                               │
                                         ssh deploy@VPS ◀──────┘  docker compose pull && up -d
```

| Piece | Where |
|---|---|
| Workflow | [.github/workflows/crawler.yml](../../.github/workflows/crawler.yml) |
| Production compose file | [docker-compose.prod.yml](docker-compose.prod.yml), copied to `/opt/magicwebs/crawler/docker-compose.yml` on each deploy |
| VPS setup script | [scripts/vps/bootstrap-crawler.sh](../../scripts/vps/bootstrap-crawler.sh) |
| Crawler secrets | `/opt/magicwebs/crawler/crawler.env` on the VPS only, never in GitHub |

Deploys run on every push to `main` that touches the crawler, `packages/backend`, `packages/page-schema`, the lockfile or the workflow. Pull requests run the typecheck only.

## One-time setup

Run these from the repo root on your machine (Git Bash or PowerShell both work for the `ssh` lines).

### 1. Create the CI deploy key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/magicwebs_deploy -N "" -C "github-actions-crawler-deploy"
```

### 2. Bootstrap the VPS

```bash
ssh root@187.127.186.119 "bash -s -- '$(cat ~/.ssh/magicwebs_deploy.pub)'" < scripts/vps/bootstrap-crawler.sh
```

This installs Docker and creates a `deploy` user that accepts the key from step 1. It also creates `/opt/magicwebs/crawler` and turns on ufw (SSH only), fail2ban, unattended security upgrades and 4 GB of swap. It is safe to re-run.

Check that the deploy user works:

```bash
ssh -i ~/.ssh/magicwebs_deploy deploy@187.127.186.119 docker ps
```

### 3. Write the production secrets on the VPS

```bash
ssh root@187.127.186.119
nano /opt/magicwebs/crawler/crawler.env   # use apps/crawler/.env.example as the template
```

- `CONVEX_URL`: the **production** deployment URL.
- `WORKER_SECRET`: the same value as `WORKER_SECRET` in the prod Convex env (SETUP-TODO step 3).
- `WORKER_ID`: leave **empty**, so each replica picks its own id.
- `R2_*`: a read-and-write token. A read-only token makes every clone fail at "Copying images".

The file is `chmod 600` and owned by `deploy`. A deploy fails with a clear error if it is missing or empty.

### 4. Add GitHub secrets

Go to GitHub → `magic-webs/magicwebs` → **Settings → Environments → New environment** and name it `production`. Add these environment secrets:

| Secret | Value |
|---|---|
| `VPS_HOST` | `187.127.186.119` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | the whole contents of `~/.ssh/magicwebs_deploy` (the private key) |
| `VPS_KNOWN_HOSTS` | the output of `ssh-keyscan -t ed25519 187.127.186.119` |

Optionally, add yourself under **Required reviewers** on the environment to approve each deploy by hand.

No registry secret is needed. The workflow pushes to GHCR with the built-in `GITHUB_TOKEN` and lends that short-lived token to the VPS for the pull.

### 5. First deploy

Push to `main`, or go to **Actions → Crawler → Run workflow** on `main`. The deploy step waits 30 seconds and fails if any container is not running, printing its logs.

## Day to day

On the VPS (`ssh deploy@187.127.186.119`, then `cd /opt/magicwebs/crawler`):

```bash
docker compose ps                 # worker status
docker compose logs -f --tail 100 # live logs
docker compose restart            # after editing crawler.env
cat .env                          # which commit is running
```

- **Roll back:** go to Actions → Crawler → Run workflow, then set `tag` to an earlier commit SHA. The build is skipped and that image is redeployed. Images older than three days are pruned from the VPS but remain in GHCR.
- **Scale:** change `replicas` in `docker-compose.prod.yml` and push. The box has 16 GB RAM and 4 cores, and each worker is capped at 2 GB, so 3 or 4 replicas fit.
- **Rotate secrets:** edit `crawler.env`, then run `docker compose up -d --force-recreate`.
- **Graceful stop:** a worker finishes its current job after SIGTERM. Compose waits up to 5 minutes before killing it, so a deploy can take that long when jobs are running.

## Hardening once CI works

- Turn off root password login. Make sure your own key works first (`ssh root@... ` without a password prompt), then set `PasswordAuthentication no` and `PermitRootLogin prohibit-password` in `/etc/ssh/sshd_config.d/50-hardening.conf` and run `systemctl reload ssh`.
- In the Hostinger panel firewall, allow only port 22 inbound, as a second layer to ufw.

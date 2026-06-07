# SimpleBooks — VPS deployment guide

> **Looking for the supported deploy path?** See **[DEPLOY-PORTAINER.md](DEPLOY-PORTAINER.md)** — Portainer + Nginx Proxy Manager. That's the documented, in-use production setup.

This page covers a minimal bare-metal alternative: a Linux VPS running `docker compose -f docker-compose.prod.yml` directly behind whatever reverse proxy you already run. Tested against Ubuntu 22.04+ / Debian 12+.

Assumptions:

- A VPS reachable on a public IP with the ports your reverse proxy needs (typically **80** + **443**) open.
- A DNS A-record pointing your chosen domain (e.g. `simplebooks.mysite.com`) at the VPS IP.
- You can SSH in as a user with `sudo`.
- **You already have a reverse proxy** (Nginx Proxy Manager, Caddy, Traefik, Cloudflare Tunnel, etc.) terminating TLS at that domain. The bundled compose does **not** include one — it just exposes `:3000` (frontend) and `:4000` (backend) on the host and trusts you to front them.

The production stack pulls pre-built images from **GitHub Container Registry (GHCR)**. You do not build on the VPS.

---

## 1. Install Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg \
  | sudo tee /etc/apt/keyrings/docker.asc > /dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
# Log out and back in so the group takes effect, then verify:
docker version
```

## 2. Get the deployment files

You only need two files on the VPS — no source code. Either:

```bash
# Option A: clone the repo (most convenient)
git clone https://github.com/sardine-mehico/SimpleBooks.git
cd SimpleBooks

# Option B: scp just the two files you need
#   docker-compose.prod.yml
#   .env.prod.example
```

## 3. Configure environment

```bash
cp .env.prod.example .env
nano .env   # or vim
```

Edit at minimum:

- `POSTGRES_PASSWORD` — pick a long random string. Update it in two places
  (POSTGRES_PASSWORD **and** the password inside DATABASE_URL).
- `ADMIN_USERNAME` + `ADMIN_PASSWORD` — **required**. Backend refuses to start
  without both. This is the canonical admin login; the password remains valid
  for the lifetime of the deploy (no rotation through the UI). Pick something
  long and unique; edit here + restart to change.
- `API_URL` — `https://<your-domain>/api`  (keep the `/api`; injected into HTML at runtime)
- `PUBLIC_APP_URL` — `https://<your-domain>` (no `/api`; used by backend for invoice links)
- `SESSION_COOKIE_SECURE=true` — **required for HTTPS deploys.** Marks the session cookie `Secure` so browsers only send it over TLS. Never ship `false` in production; that's a local-LAN-HTTP-only escape hatch.
- `TELEGRAM_WEBHOOK_DOMAIN` — your domain (or leave empty to disable bot)
- `TELEGRAM_WEBHOOK_SECRET` — long random string

**Optional (functional-out-of-the-box):** populate these once and the app
seeds them into the DB on first boot. Edits in the UI afterwards always win.

- `SMTP_HOST` / `SMTP_PORT` / `SMTP_ENCRYPTION` / `SMTP_USER` / `SMTP_PASSWORD`
  — all five required; seeds Mail Configuration.
- `TELEGRAM_ALLOWLIST_USERNAMES` — comma-separated Telegram usernames
  (no `@`). Each becomes a TelegramAllowlist row linked to the env admin.
  **Recommendation:** link your own Telegram handle to admin for full bot
  capability (the bot acts as the linked SimpleBooks user, so admin gives it
  full access to add/list/edit/delete tasks and receive notifications).
- `AI_PROVIDER_1_*` and `AI_PROVIDER_2_*` — two optional slots for AI
  providers. Slot 1 is primary, slot 2 is fallback. Per-slot fields:
  `NAME`, `MODEL`, `API_BASE_URL`, `API_KEY` (and optional `RPM`, default 15).

## 4. Pull and start

```bash
# Pull images (public — no GHCR auth needed)
docker compose -f docker-compose.prod.yml --env-file .env pull

# Bring up the stack
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Verify each service is healthy:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50 backend
```

On first boot the backend runs `prisma db push` against an empty database, then
seeds:
- 2 tax types (GST 10%, No tax)
- 52 categories + 154 subcategories
- 137 tags (merchant + entity)
- 6 recurring schedules
- 10 invoice templates + 10 email templates
- 1 sample billing company + 6 sample customers + 4 sample items + 10 sample
  invoices (delete these from the UI to start clean — see step 6)

## 5. Wire your reverse proxy

The compose exposes:
- `frontend` on host `:3000`
- `backend` on host `:4000`

Point your reverse proxy at the same host's loopback (or the docker bridge IP if the proxy runs in a separate container) and route:

```
/api/*   →  http://localhost:4000   (strip /api/ before forwarding)
/*       →  http://localhost:3000
```

The frontend reads `API_URL` from `window.__SB_CONFIG__` at runtime — change `API_URL` in `.env` + restart frontend; no rebuild needed.

If you don't have a reverse proxy yet, the **Nginx Proxy Manager** recipe in [DEPLOY-PORTAINER.md](DEPLOY-PORTAINER.md) is the documented happy path.

## 6. First-load checks

Open `https://<your-domain>` in your browser.

- Login screen shows `$impleBooks` wordmark on the navy header.
- Log in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD` you set in `.env`.
- Admin lands on the Dashboard.

If anything fails:

```bash
# Tail every container
docker compose -f docker-compose.prod.yml logs --tail=50

# Common: backend can't connect to postgres → verify POSTGRES_PASSWORD matches
# in both places in .env
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U simplebooks
```

## 7. Optional: clear sample data

If you want to start with zero records:

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U simplebooks -d simplebooks -c '
DELETE FROM "Invoice";
DELETE FROM "RecurringRule";
DELETE FROM "Customer";
DELETE FROM "Item";
DELETE FROM "BillingCompany";
'
```

This preserves the seed catalogue (categories, tags, tax types, templates) while removing the sample business records.

## 8. Backups

Daily database backups:

```bash
sudo mkdir -p /var/backups/simplebooks
echo '0 2 * * * docker compose -f /home/'$USER'/SimpleBooks/docker-compose.prod.yml exec -T postgres pg_dump -U simplebooks -F c simplebooks > /var/backups/simplebooks/$(date +\%Y\%m\%d).dump' \
  | sudo tee /etc/cron.d/simplebooks-backup
```

Restore a backup:

```bash
cat /var/backups/simplebooks/20260605.dump \
  | docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U simplebooks -d simplebooks --clean --if-exists
```

## 9. Upgrading to a new release

```bash
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Both images are tracked at `:latest`. Prisma will run `db push` on backend boot, applying any additive schema changes automatically.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `docker compose ps` shows backend restarting | `[FATAL]` log line — `ADMIN_USERNAME` or `ADMIN_PASSWORD` not set in `.env`. |
| Browser hits frontend but `/api/*` 502s | Reverse-proxy routing — `/api/*` must forward to `backend:4000` with the `/api/` prefix stripped. |
| HTTPS not working / cert error | Your reverse proxy isn't terminating TLS yet, or DNS A-record not pointing at this VPS. |
| "View PDF" button hits `localhost:4000` from the browser | `API_URL` in `.env` is still localhost — set it to `https://<your-domain>/api` and restart. No rebuild required (runtime-injected). |
| Emails not sending | Configure SMTP via Settings → Mail Configuration (not via env). |
| Telegram bot inactive | `TELEGRAM_BOT_TOKEN` unset OR backend can't reach api.telegram.org. |

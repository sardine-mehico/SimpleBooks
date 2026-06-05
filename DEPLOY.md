# SimpleBooks — VPS deployment guide

End-to-end setup on a fresh Linux VPS to bring up SimpleBooks v0.1 at your own
domain. Tested against Ubuntu 22.04+ / Debian 12+.

This guide assumes:

- A VPS reachable on a public IP, with ports **80** and **443** open in the
  firewall.
- A DNS A-record pointing your chosen domain (e.g.
  `bookkeeping.officepc.online`) at the VPS IP.
- You can SSH in as a user with `sudo`.

The production stack pulls pre-built images from **GitHub Container Registry
(GHCR)**. You do not build on the VPS.

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

You only need three files on the VPS — no source code. Either:

```bash
# Option A: clone the repo (most convenient)
git clone https://github.com/sardine-mehico/SimpleBooks.git
cd SimpleBooks

# Option B: scp just the three files you need
#   docker-compose.prod.yml
#   Caddyfile
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
- `NEXT_PUBLIC_API_URL` — `https://<your-domain>/api`  (keep the `/api`)
- `PUBLIC_APP_URL` — `https://<your-domain>` (no `/api`)
- `TELEGRAM_WEBHOOK_DOMAIN` — your domain (or leave empty to disable bot)
- `TELEGRAM_WEBHOOK_SECRET` — long random string

Leave `TAG=0.1` for the first deploy.

## 4. Update the domain in `Caddyfile`

```bash
sed -i 's/bookkeeping.officepc.online/your-domain.example/g' Caddyfile
```

Caddy auto-provisions Let's Encrypt certificates on first boot — no extra
config required as long as ports 80 and 443 are open.

## 5. Pull and start

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
docker compose -f docker-compose.prod.yml logs --tail=20 caddy
```

On first boot the backend runs `prisma db push` against an empty database, then
seeds:
- 2 tax types (GST 10%, No tax)
- 52 categories + 154 subcategories
- 137 tags (merchant + entity)
- 6 recurring schedules
- 10 invoice templates + 10 email templates
- 1 sample billing company + 6 sample customers + 4 sample items + 10 sample
  invoices (delete these from the UI to start clean — see step 7)

## 6. First-load checks

Open `https://<your-domain>` in your browser.

- The login page is a placeholder (auth is not yet wired); you'll land
  straight on the Dashboard.
- Settings → Mail Configuration: enter SMTP credentials and click Save. You
  should see a green toast.
- Settings → Tax Types: should show GST 10% and No tax already.

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

This preserves the seed catalogue (categories, tags, tax types, templates)
while removing the sample business records.

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

When a new tag is published:

```bash
# In .env, change TAG to the new version
TAG=0.2

# Then:
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Prisma will run `db push` on backend boot, applying any additive schema
changes automatically.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Caddy logs `connection refused` for backend or frontend | Containers still starting; wait ~30s after `up -d` |
| HTTPS not working / cert error | DNS A-record not pointing at this VPS, or port 80 not open (LE challenge fails) |
| "View PDF" button goes to `localhost:4000` in browser | `NEXT_PUBLIC_API_URL` was wrong at image build time; for v0.1 the value is baked at build, so you must use the image we built. Override is to mount an entrypoint that runs `next build` with the right env — not recommended; bump the tag instead |
| Emails not sending | Configure SMTP via Settings → Mail Configuration (not via env). Then the backend uses what's in the database. |
| Telegram bot inactive | Token unset OR backend can't reach api.telegram.org (rare; some hosts firewall Telegram IPs) |

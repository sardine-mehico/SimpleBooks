# SimpleBooks — Portainer + Nginx Proxy Manager deployment

Companion to [DEPLOY.md](./DEPLOY.md). Use this guide when you're running
Docker via **Portainer** with **Nginx Proxy Manager** (NPM) already handling
your reverse proxy on the `npm_proxy` network.

The compose file you want is [`docker-compose.portainer.yml`](./docker-compose.portainer.yml).

---

## Prerequisites

- Portainer up and running on the host
- Nginx Proxy Manager already deployed; the network it uses is named **`npm_proxy`**
  - Verify: in Portainer → **Networks** → confirm `npm_proxy` exists and that the
    NPM container is attached to it
- DNS A-record for `simplebooks.officepc.online` pointing at the public IP NPM listens on
- Persistent data path on the host: **`/srv/docker/simplebooks`**

---

## 1. Prepare host directories

SSH to the host:

```bash
sudo mkdir -p /srv/docker/simplebooks/{postgres,redis,backups}

# Postgres + Redis run as non-root inside the container. Match host ownership
# so the volume permissions don't fight the image.
sudo chown -R 999:999  /srv/docker/simplebooks/postgres
sudo chown -R 999:1000 /srv/docker/simplebooks/redis
```

(The `999` UID matches `postgres` and `redis` users in the official Alpine images.)

---

## 2. Create the stack in Portainer

1. **Stacks → Add stack**
2. **Name:** `simplebooks`
3. **Build method:** Repository
   - **Repository URL:** `https://github.com/sardine-mehico/SimpleBooks`
   - **Reference:** `refs/tags/v0.2`
   - **Compose path:** `docker-compose.portainer.yml`
   - *(Or paste the file contents directly under "Web editor")*
4. **Environment variables** — add these (everything in the env section maps to
   `.env.prod.example` — copy the variables and fill in):

   | Variable | Value |
   |---|---|
   | `TAG` | `0.1` |
   | `IMAGE_OWNER` | `sardine-mehico` (or your fork) |
   | `POSTGRES_USER` | `simplebooks` |
   | `POSTGRES_PASSWORD` | *(long random string)* |
   | `POSTGRES_DB` | `simplebooks` |
   | `DATABASE_URL` | `postgresql://simplebooks:<PASSWORD>@postgres:5432/simplebooks?schema=public` |
   | `REDIS_URL` | `redis://redis:6379` |
   | `PUBLIC_APP_URL` | `https://simplebooks.officepc.online` |
   | `API_URL` | `https://simplebooks.officepc.online/api` *(runtime-injected; change anytime)* |
   | `TELEGRAM_BOT_TOKEN` | *(optional — leave empty to disable the bot)* |
   | `TELEGRAM_WEBHOOK_DOMAIN` | `simplebooks.officepc.online` *(if bot enabled)* |
   | `TELEGRAM_WEBHOOK_SECRET` | *(long random string if bot enabled)* |
   | `RESEND_API_KEY` | *(optional)* |
   | `RESEND_FROM` | *(optional)* |

   > ⚠️ Use the **same password** in `POSTGRES_PASSWORD` and inside `DATABASE_URL`.
   > A mismatch is the #1 cause of "backend can't reach DB" on first boot.

5. **Deploy the stack**

You should now see four containers running:
- `simplebooks-postgres`
- `simplebooks-redis`
- `simplebooks-backend`
- `simplebooks-frontend`

Backend logs should end with `Nest application successfully started`.

---

## 3. Configure Nginx Proxy Manager

NPM does not auto-discover containers; you wire it manually.

### 3a. Add the proxy host

In NPM → **Hosts → Proxy Hosts → Add Proxy Host**:

| Field | Value |
|---|---|
| **Domain Names** | `simplebooks.officepc.online` |
| **Scheme** | `http` |
| **Forward Hostname / IP** | `simplebooks-frontend` |
| **Forward Port** | `3000` |
| **Cache Assets** | off |
| **Block Common Exploits** | ✓ on |
| **Websockets Support** | ✓ on |
| **Access List** | Publicly Accessible |

### 3b. Add a custom location for `/api/`

Still in the same Proxy Host entry → **Custom locations** tab → **Add location**:

| Field | Value |
|---|---|
| **Define location** | `/api/` |
| **Scheme** | `http` |
| **Forward Hostname / IP** | `simplebooks-backend` |
| **Forward Port** | `4000` |

Click the **gear/settings icon** on the custom location → paste this in **Custom Nginx Config**:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

# Strip the /api prefix before forwarding — the backend listens at root and
# its routes are `/companies`, `/invoices`, etc.
rewrite ^/api/(.*)$ /$1 break;
```

### 3c. SSL

Switch to the **SSL** tab on the proxy host:

| Field | Value |
|---|---|
| **SSL Certificate** | Request a new SSL Certificate (Let's Encrypt) |
| **Force SSL** | ✓ on |
| **HTTP/2 Support** | ✓ on |
| **HSTS Enabled** | ✓ on |
| **Email Address** | your email |
| **I Agree to LE TOS** | ✓ |

Save. NPM provisions a cert in ~30 seconds.

---

## 4. First-load checks

Open `https://simplebooks.officepc.online` in your browser:

- Dashboard should load.
- Open **Settings → Tax Types** → should show GST 10% and No tax (seeded automatically).
- Open **Settings → Mail Configuration** → enter SMTP credentials and click **Save**.
  You should see a green toast confirming the save.

Direct API ping:

```bash
curl -s https://simplebooks.officepc.online/api/dashboard/summary | head -c 200
# should return JSON like: {"totals":{...},"monthly":[...]}
```

If you get HTML, the `/api/` rewrite isn't firing — recheck step 3b.

---

## 5. Optional: clear sample data

The seed creates one sample billing company + six sample customers + four
items + ten sample invoices so the UI is not empty on first open. To start
clean:

In Portainer → **Containers** → `simplebooks-postgres` → **Console**:

```bash
psql -U simplebooks -d simplebooks -c '
DELETE FROM "Invoice";
DELETE FROM "RecurringRule";
DELETE FROM "Customer";
DELETE FROM "Item";
DELETE FROM "BillingCompany";
'
```

The category taxonomy, tag catalog, tax types, templates, and recurring
schedules are kept.

---

## 6. Backups

Add a Portainer scheduled job (Stacks → Stack → Edit-or-recreate is too
heavy — easier to use Portainer's **Containers → Run** with a one-shot
command, OR a host cron).

Host cron (preferred):

```bash
sudo tee /etc/cron.d/simplebooks-backup <<EOF
0 2 * * * root docker exec simplebooks-postgres pg_dump -U simplebooks -F c simplebooks > /srv/docker/simplebooks/backups/\$(date +\%Y\%m\%d).dump
EOF
```

Restore:

```bash
cat /srv/docker/simplebooks/backups/20260605.dump \
  | docker exec -i simplebooks-postgres pg_restore -U simplebooks -d simplebooks --clean --if-exists
```

---

## 7. Upgrading

When a new tag lands (e.g. `0.3`):

1. Portainer → Stacks → `simplebooks` → **Editor**
2. Change `TAG=0.2` to `TAG=0.3` in the environment variables
3. Click **Update the stack**
4. Tick **Re-pull image and redeploy** → Update

Backend boot will run `prisma db push` and apply any additive schema changes
automatically.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Backend keeps restarting | `POSTGRES_PASSWORD` ≠ password inside `DATABASE_URL`. Fix and redeploy stack. |
| Frontend loads but every API call fails with HTML 404 | `/api/` custom location not configured (or rewrite missing) in NPM |
| Cert provisioning fails | A-record not pointing here, OR port 80 not reachable for the LE HTTP-01 challenge |
| "View PDF" hits `localhost:4000` | `API_URL` env var unset on the frontend container — set it in the stack env (e.g. `API_URL=https://your-domain.com/api`) and **Update the stack**. No image rebuild required (runtime-injected). |
| `simplebooks-backend` can't resolve `postgres` | Ensure backend has the `internal` network attached (default in the compose) |
| `simplebooks-backend` can't resolve `simplebooks-backend` from NPM | Ensure the `npm_proxy` external network exists and both NPM and the backend/frontend are on it |

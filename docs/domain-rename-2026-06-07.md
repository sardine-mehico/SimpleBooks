# Domain rename — `officepc.online` → `mysite.com`

**When:** 2026-06-07
**What:** Every reference to the example domain `officepc.online` was replaced with `mysite.com`. Subdomains were preserved — e.g. `simplebooks.officepc.online` became `simplebooks.mysite.com`, and `billing.officepc.online` became `billing.mysite.com`.

Replacement command: `sed -i 's/officepc\.online/mysite.com/g' <file>` applied to each file below.

## Files changed

| File | Lines | Before → After |
|---|---|---|
| [.env.example](.env.example) | 83 | `billing.officepc.online/api` → `billing.mysite.com/api` |
| [.env.example](.env.example) | 92 | `billing.officepc.online` → `billing.mysite.com` |
| [.env.prod.example](.env.prod.example) | 29 | `simplebooks.officepc.online/api` → `simplebooks.mysite.com/api` |
| [.env.prod.example](.env.prod.example) | 30 | `simplebooks.officepc.online` → `simplebooks.mysite.com` |
| [.env.prod.example](.env.prod.example) | 38 | `simplebooks.officepc.online` → `simplebooks.mysite.com` |
| [Architecture.md](Architecture.md) | 242 | `billing.officepc.online` (topology diagram) → `billing.mysite.com` |
| [Architecture.md](Architecture.md) | 246 | `billing.officepc.online/api` (topology diagram) → `billing.mysite.com/api` |
| [Architecture.md](Architecture.md) | 258 | `billing.officepc.online` (reverse-proxy snippet) → `billing.mysite.com` |
| [Architecture.md](Architecture.md) | 282 | `billing.officepc.online` (PUBLIC_APP_URL example) → `billing.mysite.com` |
| [DEPLOY-PORTAINER.md](DEPLOY-PORTAINER.md) | 17 | `simplebooks.officepc.online` (DNS prereq) → `simplebooks.mysite.com` |
| [DEPLOY-PORTAINER.md](DEPLOY-PORTAINER.md) | 60 | `simplebooks.officepc.online` (PUBLIC_APP_URL row) → `simplebooks.mysite.com` |
| [DEPLOY-PORTAINER.md](DEPLOY-PORTAINER.md) | 61 | `simplebooks.officepc.online/api` (API_URL row) → `simplebooks.mysite.com/api` |
| [DEPLOY-PORTAINER.md](DEPLOY-PORTAINER.md) | 63 | `simplebooks.officepc.online` (TELEGRAM_WEBHOOK_DOMAIN row) → `simplebooks.mysite.com` |
| [DEPLOY-PORTAINER.md](DEPLOY-PORTAINER.md) | 93 | `simplebooks.officepc.online` (NPM Domain Names row) → `simplebooks.mysite.com` |
| [DEPLOY-PORTAINER.md](DEPLOY-PORTAINER.md) | 145 | `https://simplebooks.officepc.online` (first-load check) → `https://simplebooks.mysite.com` |
| [DEPLOY-PORTAINER.md](DEPLOY-PORTAINER.md) | 155 | `curl … simplebooks.officepc.online/api/dashboard/summary` → `simplebooks.mysite.com/api/dashboard/summary` |
| [DEPLOY.md](DEPLOY.md) | 11 | `simplebooks.officepc.online` (DNS A-record example) → `simplebooks.mysite.com` |
| [DEPLOY.md](DEPLOY.md) | 93 | `sed -i 's/simplebooks.officepc.online/your-domain.example/g'` → `sed -i 's/simplebooks.mysite.com/your-domain.example/g'` |
| [docker-compose.portainer.yml](docker-compose.portainer.yml) | 13 | `Proxy host simplebooks.officepc.online` (comment) → `Proxy host simplebooks.mysite.com` |

**Total:** 19 occurrences across 7 files (after v0.10.2 dropped the Caddyfile entirely). No source code was affected — every match was in documentation, examples, or comments. Production deployments running on the real `officepc.online` domain are unaffected because their runtime config lives in `.env` (gitignored), not in these templates.

## Verification

```bash
git grep -nI "officepc\.online"   # returns nothing — every reference replaced
```

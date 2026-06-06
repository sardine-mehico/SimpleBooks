# Users & Roles Implementation Plan

**Goal:** Add full authentication + four fixed roles (admin, accountant, bookkeeper, api_user) to SimpleBooks, with a per-role override matrix, audit log, API keys for programmatic access, data-retention controls, and Telegram-bot-as-user.

**Architecture:**
- Backend: Nest `auth` module (argon2id, cookie sessions in `Session` table, env-admin bootstrap, login rate limit) + `roles` decorator + global guard + per-controller checks. API users authenticate via `Authorization: Bearer sb_live_<key>`.
- Frontend: existing `/login` page wired up, middleware redirect for unauthenticated, `useCurrentUser()` hook, `<Can>` component, role-aware sidebar + settings.
- Storage: 5 new tables — `User`, `Session`, `ApiKey`, `RoleOverride`, `AuditLog`.

**Tech Stack:** NestJS 10, Prisma, argon2 (`argon2` npm pkg), Next.js 15 middleware.

---

## Locked decisions

| Decision | Value |
|---|---|
| Roles | admin, accountant, bookkeeper, api_user (fixed) |
| Password hashing | argon2id |
| Session lifetime | 7d sliding |
| Login lockout | 5 fails in 10min → 30min lockout |
| API key prefix | `sb_live_<random>` |
| Env admin | `ADMIN_USERNAME` + `ADMIN_PASSWORD` always canonical; refuse to start without both |
| Force-rotate | none — env value stays valid forever |
| Self-service | none — admin manages all users + passwords |
| Cookie | HTTP-only, SameSite=Lax, Secure in prod |
| Public routes | `/i/<token>`, `/telegram/webhook/<secret>`, `/login`, PWA static, `/health` |
| Default landing | admin → `/`, others → `/invoices` |
| Override capabilities | sidebar items, settings sections, delete actions, export actions, /docs access, dashboard access |
| Telegram bot | acts as the linked SimpleBooks user (`TelegramAllowlist.userId` required FK) |

## Out of scope (v1)

- MFA, password reset flow, password rotation policy, self-service profile edits, RBAC-defined custom roles.

---

## Phase 1 — Auth core

**Files:**
- Create: `backend/src/auth/auth.module.ts`, `auth.service.ts`, `auth.controller.ts`, `session.guard.ts`, `password.ts`, `rate-limit.ts`.
- Modify: `backend/prisma/schema.prisma` (add `User`, `Session`), `backend/src/main.ts` (cookie-parser, bootstrap admin), `backend/src/app.module.ts`.
- Create: `frontend/middleware.ts`, `frontend/lib/auth.ts`, `frontend/components/layout/command-bar.tsx` (logout menu).
- Modify: `frontend/app/login/page.tsx` (wire up).

**Schema additions:**
```prisma
enum UserRole {
  ADMIN
  ACCOUNTANT
  BOOKKEEPER
  API_USER
}

model User {
  id           String   @id @default(uuid())
  username     String   @unique
  displayName  String
  email        String?  @unique
  role         UserRole
  passwordHash String?  // null for env-admin (validated against env) and api_user
  isActive     Boolean  @default(true)
  failedLoginAttempts Int @default(0)
  lockedUntil  DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  sessions     Session[]
  apiKeys      ApiKey[]
  auditLogs    AuditLog[]
}

model Session {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String   @unique
  ipAddress String?
  userAgent String?
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@index([userId])
  @@index([expiresAt])
}
```

**Bootstrap behaviour:**
- On `onModuleInit`, read `ADMIN_USERNAME` + `ADMIN_PASSWORD`.
- If either missing: log `[FATAL] Cannot start without ADMIN_USERNAME and ADMIN_PASSWORD env vars` and call `process.exit(1)`.
- If admin User row exists, leave alone. Else create User with `role=ADMIN`, `username=ADMIN_USERNAME`, `displayName='Administrator'`, `passwordHash=NULL` (env path).
- Login flow for env admin: compare submitted password against `ADMIN_PASSWORD` using `crypto.timingSafeEqual`. Never persist the env password.

**Endpoints:**
- `POST /auth/login` — `{ username, password }` → sets cookie, returns user.
- `POST /auth/logout` — revokes session.
- `GET /auth/me` — current user (or 401).

**Frontend middleware:** redirect to `/login` for any path except public list. After login, redirect to `?next=` or default-landing-for-role.

**Done when:** can log in as env admin, see dashboard, log out, get redirected to `/login` from any protected route.

---

## Phase 2 — Roles & authorisation

**Files:**
- Create: `backend/src/auth/roles.decorator.ts`, `roles.guard.ts`, `capabilities.ts`.
- Modify: every controller — add `@Roles()` decorator where non-admin must be blocked; default policy = authenticated.
- Create: `frontend/lib/capabilities.ts`, `frontend/components/auth/can.tsx`, `frontend/components/auth/role-guard.tsx`.
- Modify: `frontend/components/layout/sidebar.tsx`, all settings pages, every delete button, every export button.

**Capability model (string keys):**
```
nav.dashboard, nav.cashflow, nav.income_report, nav.expense_report, nav.tags_report,
nav.statements, nav.invoices, nav.recurring, nav.items, nav.companies, nav.customers,
nav.tasks, nav.accounts, nav.transactions, nav.payments, nav.ai_review, nav.categories,
nav.tags, nav.rules,
settings.preferences, settings.email, settings.invoice_templates, settings.tax_types,
settings.ai_setup, settings.mail_config, settings.telegram, settings.users, settings.roles,
settings.api_keys, settings.audit, settings.data_retention,
action.delete, action.export, action.docs_access
```

**Defaults per role** (matches your spec exactly):
- admin: every capability true.
- accountant: all nav + action.export + action.docs_access true; settings.users/roles/telegram/ai_setup/mail_config false; action.delete false.
- bookkeeper: all nav except dashboard/cashflow/income false; action.export false; action.delete false; settings.preferences/ai_setup/mail_config/telegram/roles/users false.
- api_user: same as accountant minus action.delete (already false) plus action.docs_access true. UI-wise rarely used; covers if they log in.

**Backend:** `@Roles('admin')` or `@Capability('action.delete')` on each route. DELETE methods auto-require `action.delete` capability.

**Frontend:** `<Can c="action.delete">…</Can>` wraps every delete button. Sidebar filters by capability. Settings page conditionally renders sections.

**Done when:** logging in as each role hides the right UI and the backend returns 403 if you try to call a forbidden endpoint directly.

---

## Phase 3 — API keys & Swagger gate

**Files:**
- Modify: `backend/prisma/schema.prisma` — add `ApiKey`.
- Create: `backend/src/api-keys/api-keys.module.ts`, controller, service; `backend/src/auth/api-key.strategy.ts` (Bearer header parser).
- Modify: `backend/src/main.ts` — Swagger `/docs` behind same auth guard (admin/accountant/api_user via capability).
- Create: `frontend/app/settings/api-keys/page.tsx`, list/create/revoke UI.

**Schema:**
```prisma
model ApiKey {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  label       String
  keyHash     String    @unique           // argon2id of the secret
  prefix      String                       // "sb_live_xxxxxxxx" — first 8 chars after prefix, for display
  lastUsedAt  DateTime?
  revokedAt   DateTime?
  expiresAt   DateTime?
  createdAt   DateTime  @default(now())
  @@index([userId])
}
```

**Behaviour:**
- Admin creates ApiKey scoped to a user (must be role=api_user). Secret is shown once.
- Every request with `Authorization: Bearer sb_live_<key>` is parsed by `api-key.strategy.ts` → looks up by hash → attaches the linked user → role guard applies as usual.
- Cookie session and Bearer key are mutually exclusive per request.

**Done when:** admin can create an API user + key, hit a backend endpoint with curl using the Bearer key, get 403 on DELETE.

---

## Phase 4 — Settings/Roles override matrix

**Files:**
- Modify: `backend/prisma/schema.prisma` — add `RoleOverride`.
- Create: `backend/src/roles/roles.module.ts`, controller, service.
- Create: `frontend/app/settings/roles/page.tsx` + UI grid.

**Schema:**
```prisma
model RoleOverride {
  id         String   @id @default(uuid())
  role       UserRole
  capability String
  allowed    Boolean
  updatedAt  DateTime @updatedAt
  @@unique([role, capability])
}
```

**Behaviour:** Effective capability = default-for-role OR overridden value. Roles guard merges per request (cached in-process for 60s).

UI: grid with rows = capabilities, columns = the 4 roles; each cell a checkbox. Admin column always-true, read-only.

**Done when:** flipping a checkbox in the UI changes what a logged-in user can see within 60 seconds.

---

## Phase 5 — Audit log

**Files:**
- Modify: `backend/prisma/schema.prisma` — add `AuditLog`.
- Create: `backend/src/audit/audit.module.ts`, service, interceptor (auto-records mutations).
- Create: `frontend/app/settings/audit/page.tsx`.

**Schema:**
```prisma
enum AuditAction {
  LOGIN_SUCCESS
  LOGIN_FAILURE
  LOGOUT
  USER_CREATED
  USER_UPDATED
  USER_DELETED
  ROLE_CHANGED
  ROLE_OVERRIDE_CHANGED
  API_KEY_CREATED
  API_KEY_REVOKED
  RESOURCE_DELETED
}

model AuditLog {
  id         String      @id @default(uuid())
  action     AuditAction
  actorId    String?
  actor      User?       @relation(fields: [actorId], references: [id], onDelete: SetNull)
  targetType String?     // "Invoice", "Customer", etc.
  targetId   String?
  ipAddress  String?
  userAgent  String?
  metadata   Json?       // free-form (e.g. for ROLE_CHANGED: {from,to,username})
  createdAt  DateTime    @default(now())
  @@index([action])
  @@index([actorId])
  @@index([createdAt])
}
```

**Behaviour:** A Nest interceptor records every DELETE + every POST to /auth and admin-restricted endpoints. Page is read-only filter/list (actor, action, target type, date range).

**Done when:** logging in or deleting something writes a row; admin sees it filtered on `/settings/audit`.

---

## Phase 6 — Data Retention

**Files:**
- Create: `backend/src/retention/retention.module.ts`, controller, service.
- Create: `frontend/app/settings/data-retention/page.tsx`.
- Modify: `backend/src/auth/auth.service.ts` — daily expired-session purge sweep.

**Behaviour:**
- Page lists 6 log tables with: row count, oldest entry date, "Delete entries older than [7d/30d/90d/1y/all]" action button.
- Tables exposed: `AuditLog`, `TransactionImport`, `AllocationEvent`, `CategorisationEvent` (with warning about AI training impact), `AiCall`, `Session`.
- Per-table delete endpoints return `{ deleted: <count> }`. All are admin-only.
- Additionally: keep "Delete older than X" affordance on `/settings/audit` and an existing imports page if one exists, both delegating to the same backend handlers.
- Auto-prune: daily cron sweeps `Session` where `expiresAt < now()`; no UI control needed.

**Done when:** admin selects "Delete older than 30d" on AuditLog, count drops, oldest entry date moves.

---

## Phase 7 — Telegram bot rewire + system actor

**Files:**
- Modify: `backend/prisma/schema.prisma` — `TelegramAllowlist.userId String? → required`; add migration step that errors loudly if existing rows have no user.
- Modify: `backend/src/telegram/telegram.service.ts` — resolve incoming Telegram chat → allowlist row → user → role check on every command.
- Modify: bot tasks calls — pass linked user to `TasksService` calls so audit log gets the actor.
- Create: `SYSTEM_TOKEN` env var; recurring processor + bulk-suggest worker sets `request.user = systemUser` (a hidden role above admin) so role guard short-circuits.

**Done when:** bot replies "you're not authorised" if the linked user lacks the capability; recurring invoice generation still works post-auth.

---

## Phase 1b — Env-driven service bootstrap

**Files:**
- Create: `backend/src/bootstrap/bootstrap.service.ts` (called from `onModuleInit` after admin seed).
- Modify: `.env.example`, `.env.prod.example`, `docker-compose.yml`.

**Goal:** SimpleBooks must be fully functional out of the box (mail, Telegram, AI) if the right env vars are populated — without anyone touching the UI. Each bootstrap step is one-shot and idempotent:

- If the target DB row(s) already exist → leave alone (UI edits win after first run).
- If absent but required envs present → create.
- If absent and envs missing → log a one-line warning naming what's skipped, continue.

### SMTP (MailConfiguration)
Existing `MailConfiguration` is a single-row config. New envs:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_ENCRYPTION` (NONE/SSL/TLS/STARTTLS), `SMTP_USER`, `SMTP_PASSWORD`.
- All five required to bootstrap; partial → log + skip.

### Telegram allowlist
The bot token (`TELEGRAM_BOT_TOKEN`) and webhook (`TELEGRAM_WEBHOOK_DOMAIN`) envs already exist. New:
- `TELEGRAM_ALLOWLIST_USERNAMES` — comma-separated Telegram usernames (no `@`). On boot, every username gets a `TelegramAllowlist` row linked to the env admin user. UI can later relink.
- Single env var, multiple values; partial seed is fine.

### AI providers (two slots)
Existing `AiProvider` model. Slot 1 marked primary, slot 2 fallback. Both optional.
- `AI_PROVIDER_1_NAME` (display label, e.g. "Gemini 2.0 Flash"), `AI_PROVIDER_1_MODEL`, `AI_PROVIDER_1_API_BASE_URL`, `AI_PROVIDER_1_API_KEY`, `AI_PROVIDER_1_RPM` (optional, default 15).
- `AI_PROVIDER_2_*` — same shape.
- Per slot: if `NAME` + `MODEL` + `API_KEY` + `API_BASE_URL` all present → create row if a row with that name doesn't exist; else skip. Slot 1 → `isPrimary=true`; Slot 2 → `isPrimary=false`; both `isEnabled=true`.

### Resend (already in env, no change)
`RESEND_API_KEY` continues to work as it does today — no DB row needed.

**Done when:** docker compose up on a fresh DB with all envs set yields a working app where mail sends, Telegram bot responds to allowlisted users, and AI Review can suggest categories — zero UI configuration required.

---

## Cross-cutting tasks (run alongside phases)

1. **Seed adjustment** — remove any reference to user seeding in `seed.ts`. Confirmed it already doesn't seed users; just verify.
2. **Docs updates**:
   - `DEPLOY.md` + `DEPLOY-PORTAINER.md`: add "Initial admin setup" section, list `ADMIN_USERNAME` + `ADMIN_PASSWORD` + `SYSTEM_TOKEN` env vars, the recommendation to link your Telegram username to admin for full bot capability.
   - `.env.example` / `.env.prod.example`: add the three new vars with explanation.
   - `docs/user-guide-banking.md`: add a section on users/roles, what each role can/can't see, the Telegram-admin recommendation, and the data-retention page.
   - `CLAUDE.md`: add to "Known gotchas" — env-admin password is canonical, role override TTL = 60s, etc.
   - `Architecture.md` + `DatabaseSchema.md`: new tables.
3. **PWA manifest start_url** — leave `/` so installed PWAs land per-role after login.

---

## Build order recommendation

1, 2 ship together (auth + role enforcement = first usable state).
3 ships next (so external integrations can begin).
4, 5, 6 in any order.
7 last so we don't churn the bot.

Total estimated time: 1–2 long sessions.

# Architecture.md

End-to-end tech stack and service topology for SimpleBooks.

For module-by-module data, business logic, and UI specs see [modules_and_logic.md](modules_and_logic.md), [DatabaseSchema.md](DatabaseSchema.md), and [DesignSystem.md](DesignSystem.md).

## Service topology

```
                          ┌────────────────────┐
                          │  frontend :3000    │
                          │  Next.js 15 / RSC  │
                          └─────────┬──────────┘
                                    │  HTTP (JSON)
                                    ▼
┌──────────────┐         ┌────────────────────┐         ┌────────────────────┐
│  postgres    │◄────────│  backend :4000     │────────►│  redis             │
│  17-alpine   │  Prisma │  NestJS 10         │  ioredis│  7-alpine          │
│  port 55432  │         │                    │  BullMQ │  port 56379        │
└──────────────┘         └──────┬─────┬───────┘         └────────────────────┘
                                │     │
                                │     │  Telegraf (long-poll or webhook)
                                │     ▼
                                │    ┌────────────────────┐
                                │    │  api.telegram.org  │
                                │    └────────────────────┘
                                │
                                │  HTTPS (Phase C — AiClient)
                                ▼
                          ┌────────────────────┐
                          │  AI providers      │
                          │  (OpenAI-compat.)  │
                          └────────────────────┘
```

All four services run under one `docker compose` project named `simplebooks`. Postgres and Redis host ports are intentionally remapped (`55432`, `56379`) to avoid clashing with other projects on the host. **Inside the compose network they remain `5432` / `6379`.**

## Stack by service

### Frontend — `frontend/` (Next.js 15 App Router)
| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node 22 (alpine) | inside the `simplebooks-frontend-1` container |
| Framework | **Next.js 15.5+** App Router, standalone output | server components for data load, client components (`"use client"`) for interactivity |
| React | **React 19** | required by Next 15 |
| Language | TypeScript 5 | strict mode |
| Styling | **Tailwind CSS 3** + `tailwindcss-animate` | content scoped to `app/` + `components/` |
| Component primitives | **Radix UI** | Dialog, Dropdown Menu, Label, Select, Slot, Tooltip — used through our local `components/ui/*` wrappers |
| Icons | **`@phosphor-icons/react`** (sidebar, fill weight) + **`lucide-react`** (everywhere else) | never mix in one component |
| Class utilities | `class-variance-authority`, `clsx`, `tailwind-merge` (`cn` helper) | |
| Animation | `framer-motion` | page-entry fade + slide-up via `PageShell` |
| Fonts | **Noto Sans** variable (app chrome) + 7 invoice-template fonts (Inter, Source Sans 3, Oswald, DM Sans, Manrope, Lora, Plus Jakarta Sans) via `next/font/google` | all exposed as CSS vars on `<html>`; per-design components opt in via `style={{ fontFamily: 'var(--font-inv-…)' }}`. Font files are only fetched when a variable is referenced. |
| Build | `next build` (standalone) | image runs `node server.js` |

Routing pattern (per module):
- `app/<module>/page.tsx` — server component, fetches via `lib/api.ts`, hands data to a client component.
- `app/<module>/new/page.tsx` — wraps a client `*-form.tsx` (no `initial`).
- `app/<module>/[id]/page.tsx` — wraps the same client `*-form.tsx` with the loaded row.
- List interactivity (sort + filter + pagination) lives in `components/data/{list-table,filtered-list,filter-panel,pagination}.tsx` — single source of truth.
- **Public customer-facing route** `app/i/[token]/page.tsx` — fetches from `/public/invoices/:token`, renders via `components/public-invoice/`. The root layout's chrome (`Sidebar`, `CommandBar`) is bypassed by the `AppShell` wrapper at `components/layout/app-shell.tsx`, which skips chrome for any path starting with `/i/`.

### Backend — `backend/` (NestJS 10)
| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node 22 (alpine) | |
| Framework | **NestJS 10** | `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/config` |
| Language | TypeScript 5 | CommonJS output (`tsc` + `nest build`) |
| ORM | **Prisma 5** (`@prisma/client`, `prisma` CLI) | schema at `backend/prisma/schema.prisma`; **no migrations** — `prisma db push --accept-data-loss` on every boot via `entrypoint.sh` |
| HTTP framework | Express (via `@nestjs/platform-express`) | |
| Validation | **`class-validator` + `class-transformer`** | DTOs are the single source of truth; the Telegram bot reuses the same `CreateTaskDto` |
| Queues | **BullMQ 5** via `@nestjs/bullmq` | `ioredis` driver. Two queues: `recurring-invoices` (1-minute repeat sweep) and `invoice-mail` (retry queue for failed sends). |
| Bot | **Telegraf 4** | injects `TasksService` directly to mirror HTTP behavior; long-poll unless `TELEGRAM_WEBHOOK_DOMAIN` is set |
| CSV parsing | **`papaparse` 5** (+ `@types/papaparse` devDep) | used by `transaction-imports` for sniff + commit |
| PDF | **`@react-pdf/renderer` 4** + `react` 18 | Renders React components to PDF in Node — no headless browser. Templates live at [backend/src/pdf/templates/](backend/src/pdf/templates/), one TSX per `InvoiceTemplate.templateKey`; the registry at [backend/src/pdf/templates/index.ts](backend/src/pdf/templates/index.ts) maps each key to its component. All 10 production templates (`design-1` … `design-10`) are wired — `default.tsx` is kept as a fallback for unknown keys. Soft size target ≤ 180 KB/page — `PdfService.renderInvoice` logs a warning when exceeded. No raster images; fonts are subsetted Latin WOFFs from `@fontsource/*`. TSX support: `jsx: "react"` in `backend/tsconfig.json` with `src/**/*.tsx` in `include`. |
| Invoice typography | **Subsetted Google Fonts** via `@fontsource/*` | Each template registers only the families it uses. Today: **Inter** (design-1/2/3/4/6), **Oswald + Source Sans 3** (design-5), **DM Sans** (design-7), **Manrope** (design-8), **Lora** (design-9), **Plus Jakarta Sans** (design-10). 1–3 weights per family, ~25 KB per weight WOFF — stays comfortably within the 180 KB/page budget even with all fonts loaded in one render session. |

NestJS module layout (one per backend domain):
- `tasks`, `customers`, `companies`, `items`, `invoices`, `recurring`, `dashboard` — CRUD/aggregate.
- `telegram` — Telegraf-based bot + allowlist sub-module. **(v0.10)** Every incoming update is resolved Telegram handle → `TelegramAllowlist` → linked `User` (via the new `userId` FK); the resolved user is attached to `ctx.state.user` and every command runs through `RolesService.hasCapability` before any side effect. Surfaces: `/start`, `/help`, `/cancel`, `/newtask <title>` (or `/newtask` alone → force-reply prompt), `/tasks` (lists open tasks with inline keyboards `[ ✓ Done ] [ ✏️ Edit ] [ 🗑 Delete ]` per row — Delete only rendered when `action.delete` is granted). Callback handlers: `task:done:<id>`, `task:edit:<id>`, `task:delete:<id>` (followed by a Yes/Cancel confirm step → `task:delete:confirm:<id>`). The edit + new-task flows use an in-memory `Map<chatId, pendingFlow>` to capture the next free-text message. DTO validation reuses the same `CreateTaskDto` as the HTTP API — the bot never re-implements validation. Webhook mode when `TELEGRAM_WEBHOOK_DOMAIN` is set; long-poll otherwise. `notify(text)` broadcasts to every chat that has ever run `/start`.
- `tax-types`, `mail-configuration`, `invoice-templates`, `email-templates`, `preferences` — settings.
- `pdf` — React-PDF render service, used by `invoices` (for `GET /invoices/:id/pdf`), by `mail` (when the Send dialog's "Attach PDF invoice" checkbox is ticked), and by `public-invoices` (for the customer-facing PDF download).
- `public-invoices` — unauthenticated customer-facing endpoints `GET /public/invoices/:token` (JSON for the HTML view) and `GET /public/invoices/:token/pdf` (force-download). Handles the SENT → VIEWED status transition on first open.
- `accounts` — CRUD for bank accounts. Route prefix `/accounts`. Includes current-balance computation (`openingBalance + SUM(Transaction.amount)`) and transaction count.
- `account-types` — settings catalog. Route prefix `/account-types`. Seeded; user-editable.
- `transactions` — read + server-side filter/sort/pagination. Route prefix `/transactions`. Supports account-scoped queries (`?accountId=`) and global queries. Extended in Phase B with stats endpoint, splits endpoints, and manual category patch. No create endpoint — transactions enter only via CSV import.
- `transaction-imports` — CSV import flow. Two multipart endpoints: `POST /transaction-imports/sniff` (column detection, 10 MB limit) and `POST /transaction-imports/commit` (insert rows, 10 MB limit). Both use `FileInterceptor`. Parses CSV via `papaparse`; deduplicates by `@@unique([accountId, importHash])`. Extended in Phase B: `commit` accepts an opt-in `categorise` boolean that runs the rule engine over just-inserted transactions after the import Prisma transaction commits.
- `import-logs` — read-only. Route prefix `/import-logs`. Exposes list and detail for `TransactionImport` rows. No delete or write endpoints — records are immutable.
- `categories` — **(Phase B)** CRUD for transaction categories. Route prefix `/categories`. 15-row seed. Delete blocked (409) when any Transaction, TransactionSplit, or Rule references the category.
- `tags` — **(2026-05-28, replaces vendors)** CRUD for tags + auto-alias pass. Route prefix `/tags`. 39-row seed (same merchant/bank names that used to be Vendors, with their alias lists). `TagsService.autoAliasApply()` scans transaction descriptions against `tag.name + tag.aliases[]` (word-boundary regex, case-insensitive, longest-pattern-first) and inserts `TransactionTag` rows. Exposes `POST /tags/auto-apply` (global re-scan) and `POST /tags/:id/auto-apply` (per-tag re-scan) for use from the `/tags` page. `PATCH /transactions/:id/tags` replaces the tag set on a transaction (source=USER).
- `rules` — **(Phase B)** CRUD for categorisation rules with conditions. Route prefix `/rules`. Exposes reorder (`PATCH /rules/:id/move`), state change (`PATCH /rules/:id/state`), and active toggle (`PATCH /rules/:id/toggle-active`). **As of 2026-05-28, rules apply category only** — vendor outcome and `VENDOR` condition field dropped.
- `rule-engine` — **(Phase B)** Orchestrator module. No database table of its own. Single-pass: evaluates active rules in ascending `priority` order; the first rule whose AND-conditions all match wins. Exposes `POST /rule-engine/recategorise` (batch run over selected transactions) and `POST /rule-engine/test` (dry-run sandbox with no side effects). Engine writes are wrapped in a single Prisma `$transaction`; a `CategorisationEvent` row is written for every category change. `Rule.hitCount` and `lastFiredAt` are incremented per pass. **(2026-05-28)** Vendor-match pass removed; tag application is no longer a rule-engine concern — see the `tags` module's auto-alias pass instead.
- `categorisation-events` — **(Phase B)** Read-only. Route prefix `/categorisation-events`. Exposes the `CategorisationEvent` audit log. No write endpoints — rows are append-only.
- `ai` — **(Phase C)** AI categorisation runtime. Route prefix `/ai`. Endpoints: `POST /ai/suggest-category`, `POST /ai/apply`, `POST /ai/bulk-suggest`, `GET /ai/bulk-suggest/:runId/status`, `POST /ai/bulk-suggest/:runId/cancel`, `GET /ai/review-queue`, `POST /ai/mine-rules`. The `AiClient` is the only file that makes outbound HTTPS to LLM providers. Provider chain order: `[isPrimary desc, sortOrder asc, createdAt asc]`. 4xx misconfig surfaces; 5xx/408/429/timeout/network falls through to the next provider. Every HTTP attempt writes an `AiCall` row.
- `ai-providers` — CRUD for `AiProvider` config rows. Route prefix `/ai-providers`. Includes `PATCH /ai-providers/:id/set-primary` (atomically sets one provider as primary) and `PATCH /ai-providers/:id/move` (swaps `sortOrder` with the immediate non-primary neighbour; direction `'up'|'down'`).
- `payments` — **(Phase D)** Invoice payment matching. Route prefix `/payments`. Houses `PaymentsService` (`getCandidates`, `applyAllocations`, `deleteAllocation`, `getQueue` / `getQueueCount`, `dismiss` / `undismiss`, `getCustomerCredit`) and three pure helpers (`recomputeInvoicePayment`, `scoreInvoice`, `findBundleSuggestion`). One-shot idempotent backfill runs from `onModuleInit`. Audit log lives in `AllocationEvent`. `/customers/:id/credit` is wired in `CustomersController` via PaymentsService injection.
- `statements` — **(Phase E)** Customer Statements. Route prefix `/statements`. `StatementsService.getStatement` computes opening balance, body rows, and summary from `Invoice` + `Allocation` + `Transaction` data (no schema changes). `PdfService.renderStatement` produces the PDF via the new `customer-statement.tsx` React-PDF template. `MailService.sendStatement` dispatches the statement email with the rendered PDF attached. Endpoints: `GET /statements`, `GET /statements/pdf`, `GET /statements/send-context`, `POST /statements/send`.
- `reports` — **(2026-05-26)** Expense + income totals grouped by parent category. Route prefix `/reports`. Two endpoints — `GET /reports/expense`, `GET /reports/income`. Both return `{ parents: [{ id, name, total, children: [...] }], uncategorised, grandTotal }` from a single raw-SQL `COALESCE(parentId, id)` GROUP BY (Prisma's typed `groupBy` doesn't compose with `COALESCE` over a joined column). Date boundaries respect the user's timezone via `localStartOfDay` / `localEndOfDay` (in `backend/src/util/dates.ts`). Sign convention: expense sums `ABS(amount)` for negative-sided rows on EXPENSE-kind categories; income sums positive-sided rows on INCOME-kind. Uncategorised transactions of the matching sign are bucketed into a separate row.
- `prisma` — shared global module exposing `PrismaService`.
- `auth` — **(v0.9)** Identity + session core. Route prefix `/auth`. Endpoints: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/capabilities`. `AuthService.onModuleInit` reconciles the env admin row from `ADMIN_USERNAME` + `ADMIN_PASSWORD` and calls `process.exit(1)` with a `[FATAL]` log line when either is missing. Passwords are argon2id; the env admin's `passwordHash` is NULL and validated against env directly. `SessionGuard` is registered globally — it accepts the `sb_session` cookie OR `Authorization: Bearer sb_live_<key>` and short-circuits routes annotated `@Public()` (public-invoice link, Telegram webhook, login). `RolesGuard` runs after — applies `@Roles`/`@Capability`/`@AdminOnly` and auto-blocks DELETE for roles without `action.delete`. Login attempts have an IP rate limit (5 fails / 10min) plus a per-user lockout (5 fails / 30min) tracked on `User.failedLoginAttempts` + `lockedUntil`.
- `users` — **(v0.9)** Admin-only CRUD for `User` rows. Route prefix `/users`. Self-protection: actor can't change own role, deactivate self, or delete self; the last active ADMIN can't be demoted/deactivated/deleted; the env-admin row is never deletable. Password changes happen here (admin sets new password for any user); there's no self-service password change endpoint.
- `api-keys` — **(v0.9)** Admin-only bearer-key management. Route prefix `/api-keys`. `POST /api-keys` returns the plaintext secret exactly once (the "show once" UI) and stores only its argon2id hash. Keys can only be issued to `API_USER` accounts. `SessionGuard` resolves Bearer tokens by argon2-verifying against every non-revoked, non-expired key — fine at single-tenant scale.
- `roles` — **(v0.9)** Per-role capability override matrix. Route prefix `/roles`. `RolesService` merges hard-coded defaults (`backend/src/auth/capabilities.ts`) with `RoleOverride` rows and caches the result in-process for 60 s (invalidated on every write). The `ADMIN` row is locked at all-true server-side. Frontend mirrors the capability list in `frontend/lib/capabilities.ts`; both must stay in sync.
- `audit` — **(v0.9)** Append-only audit log. Route prefix `/audit` (admin-only). `AuditInterceptor` is registered as a global Nest interceptor and records `RESOURCE_DELETED` for every successful DELETE; `AuthService` emits `LOGIN_SUCCESS`/`LOGIN_FAILURE`/`LOGOUT` inline. Writes are fire-and-forget — an audit failure never breaks the primary request.
- `retention` — **(v0.9, auto-purge added v0.10.3)** Admin-only data retention. Route prefix `/data-retention`. `GET /data-retention/stats` returns count + oldest-entry date per managed table; `POST /data-retention/purge` deletes entries older than a chosen bucket (`7d`/`30d`/`90d`/`1y`/`all`). Six tables exposed: `AuditLog`, `TransactionImport`, `AllocationEvent`, `CategorisationEvent` (with a UI warning re: AI training impact), `AiCall`, `Session`. Expired sessions are also auto-pruned hourly by `AuthService`. **Auto-purge:** `GET /data-retention/policies` + `PUT /data-retention/policies/:table` persist a per-table `RetentionPolicy { cutoffAge, enabled }`. A daily BullMQ repeatable sweep (`retention-purge` queue, cron `15 3 * * *`) reads enabled policies and calls `service.purge()` for each. Each auto-run writes an `AuditLog` row with `metadata.auto=true` and stamps `RetentionPolicy.lastRunAt`.
- `bootstrap` — **(v0.9)** Env-driven first-run service seeder. No HTTP surface; runs from `BootstrapService.onModuleInit`. Three idempotent steps: (1) `MailConfiguration` from `SMTP_*` (all five fields required), (2) `TelegramAllowlist` rows from `TELEGRAM_ALLOWLIST_USERNAMES` linked to the env admin (sets `TelegramAllowlist.user` to `admin.username`), (3) `AiProvider` rows from `AI_PROVIDER_1/2_*` (slot 1 primary). Each step creates rows only when absent; UI edits made after first run always win.

#### Banking Phase B — endpoint summary

| Method | Path | Notes |
|---|---|---|
| `GET/POST` | `/categories` | list all / create |
| `GET/PATCH/DELETE` | `/categories/:id` | read / update / delete (409 if referenced) |
| `GET/POST` | `/tags` | list all (with `?includeInactive=true`) / create |
| `GET/PATCH/DELETE` | `/tags/:id` | read / update / delete |
| `POST` | `/tags/auto-apply` | re-scan ALL transactions against current tag aliases (idempotent) |
| `POST` | `/tags/:id/auto-apply` | re-scan ALL transactions against this tag only |
| `PATCH` | `/transactions/:id/tags` | replace the tag set on a transaction (source=USER) |
| `GET/POST` | `/rules` | list all / create |
| `GET/PATCH/DELETE` | `/rules/:id` | read / update / delete |
| `PATCH` | `/rules/:id/move` | swap priority with neighbour (up or down) |
| `PATCH` | `/rules/:id/state` | change `RuleState` (USER / AI_DRAFTED / APPROVED / DENIED) |
| `PATCH` | `/rules/:id/toggle-active` | flip `isActive` |
| `POST` | `/rule-engine/recategorise` | run engine over supplied transaction IDs (live write) |
| `POST` | `/rule-engine/test` | dry-run engine against a sample set; returns matches with no side effects |
| `GET` | `/transactions/stats` | aggregate stats (total in/out/net) for `?accountIds=` |
| `POST` | `/transactions/:id/splits` | create or replace splits for a transaction |
| `DELETE` | `/transactions/:id/splits` | remove all splits (revert to single-category) |
| `PATCH` | `/transactions/:id/category` | manually set category (writes CategorisationEvent with `source=MANUAL`) |
| `GET` | `/categorisation-events` | read-only audit log |

All wired in [backend/src/app.module.ts](backend/src/app.module.ts).

#### AI Providers — endpoint summary

| Method | Path | Notes |
|---|---|---|
| `GET/POST` | `/ai-providers` | list all / create |
| `GET/PATCH/DELETE` | `/ai-providers/:id` | read / update / delete (deleting primary auto-promotes oldest remaining) |
| `PATCH` | `/ai-providers/:id/set-primary` | atomically sets this provider as primary, clears all others |
| `PATCH` | `/ai-providers/:id/move` | swaps `sortOrder` with the immediate non-primary neighbour; body `{ direction: 'up'|'down' }` |

#### AI — endpoint summary (Phase C)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/ai/suggest-category` | `{ transactionId, force? }` — returns `SuggestResult` (fresh or cached draft) |
| `POST` | `/ai/apply` | `{ transactionId, decision }` — accept / edit / reject an AI draft |
| `POST` | `/ai/bulk-suggest` | `{ filter }` — dispatches bulk categorisation; returns `{ runId, totalQueued }` |
| `GET` | `/ai/bulk-suggest/:runId/status` | poll status of a bulk run |
| `POST` | `/ai/bulk-suggest/:runId/cancel` | cancel an in-progress bulk run |
| `GET` | `/ai/review-queue` | list transactions with unresolved `AI_DRAFT` (cap 500) |
| `POST` | `/ai/mine-rules` | trigger cluster-mining + LLM polish; returns `{ drafted: number }` |

#### Statements — endpoint summary (Phase E)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/statements` | `?customerId&billingCompanyId&dateFrom?&dateTo?` — returns `StatementResponse` (customer, billingCompany, dateFrom/To, openingBalance, rows, summary). Math computed live from `Invoice` + `Allocation` + `Transaction` — VOIDs excluded across all three queries. Date filters via `localStartOfDay` / `localEndOfDay` against `Preferences.timezone`. |
| `GET` | `/statements/pdf` | Same query params — streams the rendered statement PDF as `Content-Disposition: inline`. Uses `PdfService.renderStatement` → `customer-statement.tsx` React-PDF template. Filename pattern `Statement-<customerNumber>-<from>-<to>.pdf` (with `all` when a bound is null). |
| `GET` | `/statements/send-context` | Same query params — pre-fill envelope for the Send dialog: `{ from, to, cc, bcc, subject, html }`. From = `billingCompany.accountsEmail`, To = `customer.billingEmail1`, CC = `customer.billingEmail2`, BCC = `billingCompany.invoiceBcc`. Subject `Statement for <customer> · <range>`. HTML body hardcoded, embeds `billingCompany.paymentDetails` raw (it's already HTML). |
| `POST` | `/statements/send` | Body: `SendStatementDto` (`customerId`, `billingCompanyId`, optional date range, `fromEmail`, `toEmail`, `ccEmail?`, `bccEmail?`, `subject`, `html`). Renders the PDF then dispatches via `MailService.sendStatement` — PDF is ALWAYS attached. Uses the billing company's SMTP route (CUSTOM_SMTP if configured, else the system `MailConfiguration`). No retry queue. |

#### Auth + Admin — endpoint summary (v0.9)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/login` | Body: `{ username, password }`. On success sets `sb_session` cookie (httpOnly / SameSite=Lax / Secure in prod / 7d), returns `{ user }`. `@Public()` |
| `POST` | `/auth/logout` | Clears the cookie; deletes the `Session` row. |
| `GET` | `/auth/me` | Returns `{ user, capabilities }` for the current user. |
| `GET` | `/auth/capabilities` | Returns just the capability map for the current user. |
| `GET/POST` | `/users` | List / create. Admin-only. |
| `GET/PATCH/DELETE` | `/users/:id` | Read / update (role, displayName, password, isActive) / delete. Admin self-protection enforced server-side. |
| `GET/POST` | `/api-keys` | List / create. Admin-only. POST returns the plaintext secret exactly once. |
| `DELETE` | `/api-keys/:id` | Revoke (sets `revokedAt`). |
| `GET` | `/roles/capabilities` | Returns `{ capabilities: [string] }` — the full capability key list. |
| `GET` | `/roles/matrix` | Returns `{ matrix: { [role]: { [capability]: boolean } } }` — defaults merged with overrides. |
| `PUT` | `/roles/override` | Body: `{ role, capability, allowed }`. Upserts a `RoleOverride` and invalidates the cache. ADMIN cannot be denied any capability. |
| `DELETE` | `/roles/override/:role/:capability` | Removes the override (falls back to default). |
| `GET` | `/audit` | `?action&actorId&from&to&take` — returns the most recent matching events with the actor inlined. Admin-only. |
| `GET` | `/audit/stats` | `{ count, oldestAt }`. |
| `GET` | `/data-retention/stats` | Per-table `{ count, oldestAt }` for the six managed log tables. Admin-only. |
| `POST` | `/data-retention/purge` | Body: `{ table, age }` where `age ∈ {7d,30d,90d,1y,all}`. Returns `{ deleted }`. |
| `GET` | `/data-retention/policies` | Returns `[{ table, cutoffAge, enabled, lastRunAt }]` for the six managed tables (defaults to `1y` / disabled when no row exists yet). Admin-only. |
| `PUT` | `/data-retention/policies/:table` | Body: `{ cutoffAge, enabled }` where `cutoffAge ∈ {7d,30d,90d,1y}` (note: `all` is not a valid auto-purge bucket). Upserts the policy. Admin-only. |

Public routes (no auth required): `/auth/login`, `GET /public/invoices/:token`, `GET /public/invoices/:token/pdf`, `POST /telegram/webhook/:secret`, the Next.js `/login` page, and the PWA static assets.

#### Banking — shared types
`backend/src/transaction-imports/types.ts` defines the `ImportReport`, `ImportReportRow`, and column-mapping interfaces shared across the sniff/commit/log pipeline. The frontend counterpart lives at `frontend/lib/types.ts` (Banking section). Both files must stay in sync — the shape is serialised into `TransactionImport.reportJson` and read back by `<ImportReportPopup>`.

#### Banking — ts-node tests
CSV parser and column-sniffer have standalone ts-node test scripts (no Jest). The production runner image strips `src/`, so the tests must run against the build-stage image:
```
cd backend && docker build --target build -t simplebooks-backend-test .
docker run --rm simplebooks-backend-test npx ts-node src/transaction-imports/csv-parser.test.ts
docker run --rm simplebooks-backend-test npx ts-node src/transaction-imports/csv-sniffer.test.ts
```
`backend/tsconfig.json` has `"types": ["node"]` (added Task 5) for ts-node compatibility. A `package-lock.json` was also added to the backend directory at that point (it didn't exist before).

#### Production invoice templates
Ten React-PDF templates ship under [backend/src/pdf/templates/](backend/src/pdf/templates/), one per `InvoiceTemplate.templateKey`:

| templateKey | File | Brand | Font(s) |
|---|---|---|---|
| `design-1` | `grey-1.tsx` | Slate grey band, no accent | Inter |
| `design-2` | `orange-1.tsx` | Rust `#c4451c` | Inter |
| `design-3` | `blue-1.tsx` | Sky `#3182CE` + navy `#1A365D` | Inter |
| `design-4` | `orange-2.tsx` | Rust `#ea580c` | Inter |
| `design-5` | `blue-grey-1.tsx` | Slate `#2d3748` + sky `#4299e1` | Oswald (display) + Source Sans 3 (body) |
| `design-6` | `pink-berry.tsx` | Berry `#b51449` | Inter |
| `design-7` | `green-pro.tsx` | Teal `#2c8a92` | DM Sans |
| `design-8` | `green-elegance.tsx` | Sage `#6b958f` | Manrope |
| `design-9` | `brown-black.tsx` | Dark orange `#b3541a` on black band | Lora (serif) |
| `design-10` | `blue-simple.tsx` | Navy `#1849a6` | Plus Jakarta Sans |

Templates are assigned to `BillingCompany` rows at creation via the rotation rule `displayOrder = ((creationOrder - 1) % 10) + 1` and snapshotted onto each `Invoice` it issues — see [DatabaseSchema.md](DatabaseSchema.md) and [modules_and_logic.md](modules_and_logic.md) for the mechanics.

### Database — Postgres 17 (alpine)
- Single database, schema `public`.
- Volume `simplebooks_postgres_data` (project-scoped via `name: simplebooks` in `docker-compose.yml`).
- Healthcheck: `pg_isready` every 5s.
- The backend depends on Postgres being **healthy** before it starts.

### Cache / Queue — Redis 7 (alpine)
- AOF persistence on (`--appendonly yes`).
- Volume `simplebooks_redis_data`.
- Healthcheck: `redis-cli ping` every 5s.
- Used only by BullMQ. Not used for HTTP caching.

## Cross-cutting

### Frontend ↔ backend networking
`lib/api.ts` chooses base URL by execution context:
- **Server-side (inside the frontend container)** → `http://backend:4000` (compose service name, from `NEXT_PUBLIC_API_URL_INTERNAL`).
- **Browser** → value of `NEXT_PUBLIC_API_URL`, defaulting to `http://localhost:4000`.

Both paths matter — App Router pages fetch on the server *and* the client.

**Production URL convention.** Deploy the frontend at `https://<your-domain>` and route the backend behind the same origin under `/api`:

```
                                      ┌─────────────────────────┐
                                      │ frontend (Next.js)      │
https://billing.mysite.com ─────►│  internal :3000         │
                                      └─────────────────────────┘
                                      ┌─────────────────────────┐
                                      │ backend  (NestJS)       │
https://billing.mysite.com/api ─►│  internal :4000         │
                                      └─────────────────────────┘
```

Why `/api`:
- The backend does **not** strip `/api` itself. The reverse proxy (Nginx Proxy Manager in the supported deploy, or any equivalent) strips `/api/*` → `backend:4000/*` before forwarding.
- Without `/api`, the frontend would hit `https://<domain>/companies`, `https://<domain>/invoices`, etc. directly and collide with frontend page routes (`/companies` is a real Next.js page).
- Single-origin avoids CORS configuration.

See [DEPLOY-PORTAINER.md](DEPLOY-PORTAINER.md) for the supported Nginx Proxy Manager routing recipe; [DEPLOY.md](DEPLOY.md) covers the bare-`docker compose -f docker-compose.prod.yml` path for anyone fronting it with a different proxy.

`NEXT_PUBLIC_*` values are baked into the JS bundle at `next build`. Changing `NEXT_PUBLIC_API_URL` requires `docker compose build frontend` + restart — exporting the var at run time has no effect.

### Environment variables (host `.env`)
| Var | Purpose |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres init |
| `DATABASE_URL` | Backend Prisma connection (internal hostname) |
| `REDIS_URL` | Backend BullMQ connection |
| `PORT` | Backend port (4000) |
| `NODE_ENV` | `production` in compose |
| `TELEGRAM_BOT_TOKEN` | Empty = bot disabled. Live token activates the bot on backend start. |
| `TELEGRAM_WEBHOOK_DOMAIN` | If set, bot uses webhook mode. If unset, long-polling. |
| `TELEGRAM_WEBHOOK_SECRET` | Path component for webhook URL (defaults to `telegram`). |
| `NEXT_PUBLIC_API_URL` | Browser-side backend URL — **baked into the JS bundle at build time**. Local dev: `http://localhost:4000`. Production with the `/api` convention above: `https://<your-domain>/api` (the `/api` suffix is required). Used by `lib/api.ts` for every browser-side fetch, the "View PDF" button, and any other `apiBase()`-anchored URL. Changing it needs a frontend rebuild. |
| `PUBLIC_APP_URL` | Customer-facing absolute URL where the public invoice page is reachable (e.g. `http://localhost:3000` locally, `https://billing.mysite.com` in prod — **no `/api` suffix**; this is the frontend root). Used by the backend to build the `/i/<token>` link injected via `{{invoice link}}` / `{{invoice link button}}` into outgoing invoice emails. **Required for sending** — `MailService.sendInvoice` throws if unset. `InvoicesService.sendContext` falls back to `http://localhost:3000` if unset, so set it explicitly in production to avoid the preview showing a localhost link. |
| `RESEND_API_KEY` | Resend API key for the direct-email channel used by invoice-send failure notifications. Used so a broken customer-facing SMTP can't suppress its own failure alert. If unset, the notification email path becomes a no-op and Telegram remains the primary channel. Free tier 100/day. |
| `RESEND_FROM` | "From" address for Resend-sent failure notifications (e.g. `alerts@yourdomain.com`). |
| `NOTIFICATION_EMAILS` | Comma-separated list of extra recipients for the failure-alert email. Merged with the failing invoice's billing-company `accountsEmail` (deduped, lowercased). Use it for admin-ops "always copy me" in multi-billing-co setups. One Resend call per alert regardless of recipient count. |
| `AI_TIMEOUT_INLINE_MS` | Timeout in ms for inline (modal) AI calls. Default `20000`. |
| `AI_TIMEOUT_BULK_MS` | Timeout in ms for bulk and mining AI calls. Default `60000`. |
| `AI_BULK_CONCURRENCY` | Max concurrent LLM calls during bulk categorisation and mining. Default `5`. Acts as an upper bound only; the effective outbound rate is governed by each provider's `requestsPerMinute` (see below). |

### AI rate limiting

`AiClientService` enforces two layers of protection against provider rate limits:

1. **Per-provider self-pacing.** Each `AiProvider` row carries a `requestsPerMinute` field (default `15`). Before every outbound HTTP call, `AiClientService.pace(providerId, rpm)` atomically claims the next time slot (`gap = 60000 / rpm` ms) and waits until that slot. Concurrent callers each claim a unique slot, so 5 bulk workers against an RPM-15 provider serialise at 4-second gaps automatically.
2. **429 retry-with-backoff.** A 429 response from a provider triggers up to 2 in-provider retries (delays `1000ms`, `3000ms`, plus jitter). The `Retry-After` header is honoured if present (seconds). Only after retries exhaust does the chain advance to the next provider. 408 / 5xx still fall through immediately — only 429 retries in place.

Both layers compose: pacing prevents 429s under steady-state load; the backoff is defence-in-depth for transient bursts and for the moment a provider's per-minute window flips over.

### AI provider enable/disable

`AiProvider.isEnabled` (default `true`) gates participation in the provider chain. `AiClientService.complete()` reads providers via `findMany({ where: { isEnabled: true }, ... })` — disabled rows are filtered out before sorting, so they don't fire, don't count as a failed attempt, and produce no `AiCall` log rows. Toggled per-card from `/settings/ai-setup` with an immediate `PATCH /ai-providers/:id { isEnabled }` (no Save click). Independent of `isPrimary`: if the only enabled provider is non-primary, the chain still runs; if **no** providers are enabled, `complete()` returns the same `{ ok: false, error: 'no-providers' }` shape as an empty chain.

### AI categorisation provenance

Each AI-sourced `CategorisationEvent` (`AI_DRAFT` / `AI_APPLIED` / `AI_REJECTED`) records the producing provider via `CategorisationEvent.providerId` (nullable FK to `AiProvider`, `ON DELETE SET NULL`). `AiCategoriserService` passes the resolved `providerId` from `AiClientService.complete()`'s result into the event row at write time. Two read surfaces consume the FK: `GET /ai/review-queue` returns `providerName` per draft (rendered as the `Suggested by <Provider>` caption); `GET /transactions/:id` returns a `categorisationProvenance` block derived from the latest event (rendered under the Category dropdown on the edit modal). Old events without `providerId` (pre-column, or after a provider was deleted) fall back to a no-provider caption.

### Build & run
| Task | Command |
|---|---|
| Bring stack up | `docker compose up -d` |
| Rebuild a service | `docker compose build <service>` then `docker compose up -d <service>` |
| Tail backend logs | `docker logs simplebooks-backend-1 -f` |
| Wipe DB + Redis volumes | `docker compose down -v` |

There is currently no host-side `npm` workflow, no test suite, and no host linter. The frontend builds via Next.js standalone; the backend builds via the NestJS CLI inside its Dockerfile.

### Optimistic concurrency (ETag / If-Match)
- Backend: `EtagInterceptor` (global) emits a strong `ETag` header derived from `updatedAt` on single-resource GETs. `assertIfMatch(updatedAt, ifMatch)` in `common/etag.ts` throws `PreconditionFailedException` (HTTP 412) when the client-supplied `If-Match` doesn't match. Wired into PATCH on six entities: invoices, customers, companies, items, recurring rules, tasks. Express's default weak ETag is disabled in `main.ts` via `app.set('etag', false)` so the strong ETag isn't overwritten.
- Frontend: every edit form (`invoice-form.tsx`, `customer-form.tsx`, `company-form.tsx`, `item-form.tsx`, `recurring-form.tsx`) seeds an `etag` state from `etagFor(initial.updatedAt)`, passes `{ ifMatch: etag }` to `apiClient.patch`, refreshes the ETag from the PATCH response so two consecutive saves in the same session work without a reload, and shows a toast + inline alert ("Stale data — reload required") on 412.
- `ApiError.isPreconditionFailed` (in `lib/api.ts`) is the convention forms use to branch on the conflict case.

### PWA shell (v0.5)
- `app/manifest.ts` returns the Web App Manifest (Next 15 `MetadataRoute.Manifest` convention); served at `/manifest.webmanifest`. Entries: name, short_name, description, start_url `/`, display `standalone`, orientation `portrait`, background_color `#EDEEF3`, theme_color `#323D59`.
- Icons in `public/`: `icon.svg` (favicon), `icon-192.png`, `icon-512.png`, `icon-maskable.png` (full-bleed for Android maskable slot), `apple-icon-180.png` (iOS home screen). Hand-rendered from the `$` glyph at build-prep time — no external image dep.
- Service worker at `public/sw.js`. Strategies: cache-first for `/_next/static/*`, `/icon*`, `/apple-icon*`, `/manifest.webmanifest`; network-first for HTML navigation with cached-shell fallback for offline; **never** caches `/api/*` (always network-only). `CACHE_VERSION` bump on every release purges stale caches on `activate`.
- Registration: `components/pwa/sw-register.tsx` runs only when `NODE_ENV === 'production'` and `serviceWorker` is supported. Mounted in `app/layout.tsx`.

### Mobile UI architecture
- Layout chrome (`CommandBar`, `PageShell`, `EditPageChrome`) stacks header content vertically below `md` (768px) and reverts to horizontal at `md:` and up. Search input in CommandBar is hidden below `md`.
- `components/layout/app-shell.tsx` applies `min-w-0` to the right flex column so wide content (tables) can't expand the viewport — a flexbox sizing quirk that defeats `overflow-x-auto` if not set.
- List tables (`list-table.tsx`, `tasks-board.tsx`, `transactions-table.tsx`) wrap their header + rows in a two-layer container: outer `overflow-x-auto` (mobile-only), inner `min-w-[640/700/820]px` so columns keep natural widths and the user scrolls horizontally to see remaining columns. Pattern reverts to no-scroll at `md:`.
- Invoice line-item rows reshape on mobile: description spans full width row 1, amount + tax select + delete share row 2 in a 3-col grid.
- `LabeledRow` in `invoice-body-editor.tsx` stacks label above input on mobile, reverts to right-aligned label + 160px input on `md:`.

### API documentation (Swagger / OpenAPI)
- `@nestjs/swagger` is mounted at `/docs` on the backend (`main.ts`). Local dev: `http://localhost:4000/docs`. Production: `https://<domain>/api/docs` (the reverse proxy strips `/api` before forwarding to the backend at `/docs`).
- Raw OpenAPI JSON spec at `/docs-json` — feed it to Postman, Bruno, or any OpenAPI 3.0 codegen.
- Schema introspection is automatic via the `@nestjs/swagger` CLI plugin configured in `nest-cli.json`. DTOs decorated with `class-validator` (`@IsString()`, `@MinLength()`, `@IsOptional()`, etc.) are picked up at build time — no `@ApiProperty()` needed on every field. Enums and union types currently render as `object` unless explicitly decorated; that's a known polish gap.
- Every controller is decorated with `@ApiTags('<route-prefix>')` so endpoints group by domain in the UI (`/customers` → "customers", `/ai` → "ai", etc.).
- **Exposure caveat:** `/docs` is unauthenticated and publicly reachable on every deploy. The boilerplate is single-tenant operator-only, so this is acceptable today. If multi-tenant or stricter, gate it behind an auth guard or env-toggle in `main.ts`.

### Background jobs
- **Recurring invoice sweep** — `recurring.processor.ts`, BullMQ `recurring-invoices` queue with repeat pattern `* * * * *`. Timezone read from `Preferences.timezone` once at boot. Generates at most one invoice per rule per sweep; `SEND_DIRECTLY` rules route the generated invoice straight into `InvoiceMailService.send`.
- **Invoice mail retry queue** — BullMQ `invoice-mail` queue. Triggered by `POST /invoices/:id/send` (manual send) when the synchronous first attempt fails, and by the recurring sweep's `SEND_DIRECTLY` path on the same failure. **3 retry attempts** (so 4 total tries including the synchronous first attempt), **fixed 10-minute backoff** between attempts. On final failure: flips the invoice's `status` to `FAILED_TO_SEND` and fires Telegram + Resend notifications.
- Telegraf message handler runs in-process inside the backend (no separate worker).

### Known operational caveats
- Schema changes that aren't strictly additive (column drops, type changes, new required-without-default columns on populated tables) cause `prisma db push` to fail. Recovery: `docker compose down -v` (wipes data; seed repopulates).
- **Non-additive `RecurringRule` replacement (May 2026):** migrating to the new recurring-invoices schema requires `docker compose down -v` once. The old `RecurringRule` shape (`name`, `amount`, `frequency`, `nextRunAt`) cannot be coerced into the new shape (`startDate`, `recurringScheduleId`, `sendingOption`, etc.) automatically — `prisma db push` will refuse the migration. Wipe the volume; the seed repopulates demo data including the six seeded `RecurringSchedule` rows and one sample `RecurringRule`.
- **Vendor → Tag migration (2026-05-28):** destructive. The entire `Vendor` model and surrounding columns (`Transaction.vendorId`, `Rule.vendorId`, `CategorisationEvent.{old,new}VendorId`, `RuleField.VENDOR`, `EventSource.VENDOR_MATCH`, `VendorKind` enum) were dropped. Replaced by `Tag` + `TransactionTag` join + `EventSource.AUTO_ALIAS`. Existing dev DBs with vendor data must `docker compose down -v` before booting the new schema. Frontend `/vendors` route is gone; `/tags` replaces it.
- Bot token in `.env` is read **once** at backend startup. Adding/changing the token requires `docker compose restart backend`.
- Changing the timezone in Preferences requires a backend restart to re-register the BullMQ cron with the new tz.
- The `screenshots/` folder is gitignored and is the only directory where automated UI captures should land — never the project root.

## Data Fetching & State Rules
- All frontend data fetching must use React Server Components (RSC) by default for page loads.
- Client-side mutations must use Server Actions or standard fetch calls to the NestJS API.
- Do not introduce Global State (Zustand/Redux) unless explicitly requested; rely on URL state (searchParams) or local React state.

## Shared Logic Rule
- The Telegram bot and the web frontend are two windows into the same engine.
- All core business logic (e.g., `createTask`, `toggleInvoiceStatus`) must live as services in the NestJS backend. 
- The Telegram bot must invoke these services via internal API/module injections, never by querying the database directly.
- **(v0.10)** The Telegram bot is subject to the same role/capability checks as the HTTP API. Every command runs through `RolesService.hasCapability(linkedUser.role, capability)` before reaching a service — the bot never bypasses authorization just because the user is on the allowlist. A bot tied to a bookkeeper can `/tasks` and `/newtask` but cannot delete; a bot tied to admin can do everything.
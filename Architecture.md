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
└──────────────┘         └─────────┬──────────┘         └────────────────────┘
                                   │
                                   │  Telegraf (long-poll or webhook)
                                   ▼
                          ┌────────────────────┐
                          │  api.telegram.org  │
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
- `telegram` — bot service, controller, allowlist sub-module.
- `tax-types`, `mail-configuration`, `invoice-templates`, `email-templates`, `preferences` — settings.
- `pdf` — React-PDF render service, used by `invoices` (for `GET /invoices/:id/pdf`), by `mail` (when the Send dialog's "Attach PDF invoice" checkbox is ticked), and by `public-invoices` (for the customer-facing PDF download).
- `public-invoices` — unauthenticated customer-facing endpoints `GET /public/invoices/:token` (JSON for the HTML view) and `GET /public/invoices/:token/pdf` (force-download). Handles the SENT → VIEWED status transition on first open.
- `accounts` — CRUD for bank accounts. Route prefix `/accounts`. Includes current-balance computation (`openingBalance + SUM(Transaction.amount)`) and transaction count.
- `account-types` — settings catalog. Route prefix `/account-types`. Seeded; user-editable.
- `transactions` — read + server-side filter/sort/pagination. Route prefix `/transactions`. Supports account-scoped queries (`?accountId=`) and global queries. Extended in Phase B with stats endpoint, splits endpoints, and manual category patch. No create endpoint — transactions enter only via CSV import.
- `transaction-imports` — CSV import flow. Two multipart endpoints: `POST /transaction-imports/sniff` (column detection, 10 MB limit) and `POST /transaction-imports/commit` (insert rows, 10 MB limit). Both use `FileInterceptor`. Parses CSV via `papaparse`; deduplicates by `@@unique([accountId, importHash])`. Extended in Phase B: `commit` accepts an opt-in `categorise` boolean that runs the rule engine over just-inserted transactions after the import Prisma transaction commits.
- `import-logs` — read-only. Route prefix `/import-logs`. Exposes list and detail for `TransactionImport` rows. No delete or write endpoints — records are immutable.
- `categories` — **(Phase B)** CRUD for transaction categories. Route prefix `/categories`. 15-row seed. Delete blocked (409) when any Transaction, TransactionSplit, or Rule references the category.
- `vendors` — **(Phase B)** CRUD for vendors/payees. Route prefix `/vendors`. 39-row seed. Includes `vendor-extractor.service` used by the extraction wizard (`POST /vendors/extract`, `POST /vendors/extract/commit`).
- `rules` — **(Phase B)** CRUD for categorisation rules with conditions. Route prefix `/rules`. Exposes reorder (`PATCH /rules/:id/move`), state change (`PATCH /rules/:id/state`), and active toggle (`PATCH /rules/:id/toggle-active`).
- `rule-engine` — **(Phase B)** Orchestrator module. No database table of its own. Two-pass engine: vendor-match pass (longest-alias tiebreak) then rule-match pass (first-match-wins, AND-only conditions). Exposes `POST /rule-engine/recategorise` (batch run over selected transactions) and `POST /rule-engine/test` (dry-run sandbox with no side effects). Engine writes are wrapped in a single Prisma `$transaction`; a `CategorisationEvent` row is written for every change. `Rule.hitCount` and `lastFiredAt` are incremented per pass.
- `categorisation-events` — **(Phase B)** Read-only. Route prefix `/categorisation-events`. Exposes the `CategorisationEvent` audit log. No write endpoints — rows are append-only.
- `ai-providers` — **(Phase C scaffolding)** CRUD for `AiProvider` config rows. Route prefix `/ai-providers`. Includes `PATCH /ai-providers/:id/set-primary` (atomically sets one provider as primary). **No LLM is called anywhere yet** — this module persists config that Phase C will consume.
- `prisma` — shared global module exposing `PrismaService`.

#### Banking Phase B — endpoint summary

| Method | Path | Notes |
|---|---|---|
| `GET/POST` | `/categories` | list all / create |
| `GET/PATCH/DELETE` | `/categories/:id` | read / update / delete (409 if referenced) |
| `GET/POST` | `/vendors` | list all / create |
| `GET/PATCH/DELETE` | `/vendors/:id` | read / update / delete |
| `POST` | `/vendors/extract` | propose vendor rows from unrecognised transaction descriptions |
| `POST` | `/vendors/extract/commit` | accept proposed vendors and save |
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

#### AI Providers — endpoint summary (Phase C scaffolding)

| Method | Path | Notes |
|---|---|---|
| `GET/POST` | `/ai-providers` | list all / create |
| `GET/PATCH/DELETE` | `/ai-providers/:id` | read / update / delete (deleting primary auto-promotes oldest remaining) |
| `PATCH` | `/ai-providers/:id/set-primary` | atomically sets this provider as primary, clears all others |

**No LLM calls are made anywhere yet.** The module persists provider config for Phase C.

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
- **Server-side (inside the frontend container)** → `http://backend:4000` (compose service name).
- **Browser** → `http://localhost:4000` (host-mapped port).

Both paths matter — App Router pages fetch on the server *and* the client.

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
| `NEXT_PUBLIC_API_URL` | Browser-side backend URL (baked at build time). |
| `PUBLIC_APP_URL` | Customer-facing absolute URL where the public invoice page is reachable (e.g. `http://localhost:3000` locally, `https://books.example.com` in prod). Used by the backend to construct the link injected via `{{invoice link}}` / `{{invoice link button}}` into outgoing invoice emails. **Required for sending** — `MailService` throws if unset. |
| `RESEND_API_KEY` | Resend API key for the direct-email channel used by invoice-send failure notifications. Used so a broken customer-facing SMTP can't suppress its own failure alert. If unset, the notification email path becomes a no-op and Telegram remains the primary channel. Free tier 100/day. |
| `RESEND_FROM` | "From" address for Resend-sent failure notifications (e.g. `alerts@yourdomain.com`). |

### Build & run
| Task | Command |
|---|---|
| Bring stack up | `docker compose up -d` |
| Rebuild a service | `docker compose build <service>` then `docker compose up -d <service>` |
| Tail backend logs | `docker logs simplebooks-backend-1 -f` |
| Wipe DB + Redis volumes | `docker compose down -v` |

There is currently no host-side `npm` workflow, no test suite, and no host linter. The frontend builds via Next.js standalone; the backend builds via the NestJS CLI inside its Dockerfile.

### Background jobs
- **Recurring invoice sweep** — `recurring.processor.ts`, BullMQ `recurring-invoices` queue with repeat pattern `* * * * *`. Timezone read from `Preferences.timezone` once at boot. Generates at most one invoice per rule per sweep; `SEND_DIRECTLY` rules route the generated invoice straight into `InvoiceMailService.send`.
- **Invoice mail retry queue** — BullMQ `invoice-mail` queue. Triggered by `POST /invoices/:id/send` (manual send) when the synchronous first attempt fails, and by the recurring sweep's `SEND_DIRECTLY` path on the same failure. **3 retry attempts** (so 4 total tries including the synchronous first attempt), **fixed 10-minute backoff** between attempts. On final failure: flips the invoice's `status` to `FAILED_TO_SEND` and fires Telegram + Resend notifications.
- Telegraf message handler runs in-process inside the backend (no separate worker).

### Known operational caveats
- Schema changes that aren't strictly additive (column drops, type changes, new required-without-default columns on populated tables) cause `prisma db push` to fail. Recovery: `docker compose down -v` (wipes data; seed repopulates).
- **Non-additive `RecurringRule` replacement (May 2026):** migrating to the new recurring-invoices schema requires `docker compose down -v` once. The old `RecurringRule` shape (`name`, `amount`, `frequency`, `nextRunAt`) cannot be coerced into the new shape (`startDate`, `recurringScheduleId`, `sendingOption`, etc.) automatically — `prisma db push` will refuse the migration. Wipe the volume; the seed repopulates demo data including the six seeded `RecurringSchedule` rows and one sample `RecurringRule`.
- **`vendorCustomerId` → `vendorId` rename (Phase B):** this rename is non-additive. Existing dev DBs with Phase A data must `docker compose down -v` before applying the Phase B schema. `prisma db push --accept-data-loss` will drop the old column.
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
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SimpleBooks — a docker-composed accounting boilerplate. NestJS 10 + Prisma + PostgreSQL backend, Next.js 15 (App Router, React 19) frontend, Redis + BullMQ for recurring-invoice scheduling, Telegraf for a Telegram bot. Everything runs under docker compose with project name `simplebooks`.

## Development commands

Run from the repo root. There is no host-side `npm` workflow — everything goes through Docker.

| Task | Command |
|---|---|
| Bring the stack up | `docker compose up -d` |
| Rebuild after code changes | `docker compose build <service>` then `docker compose up -d <service>` |
| Tail backend logs | `docker logs simplebooks-backend-1 -f` |
| Wipe DB + Redis volumes | `docker compose down -v` (re-seeds on next `up`) |
| Hit the API | `curl http://localhost:4000/<endpoint>` |
| Open the UI | `http://localhost:3000` |

**Host ports are remapped** to avoid clashes with other projects on this machine: Postgres on `55432`, Redis on `56379`. Inside the compose network they remain `5432` / `6379`.

There is currently no test suite, no linter, no host-side build script. The backend uses NestJS's CLI inside its Dockerfile; the frontend is built via `next build` in standalone mode.

## Architecture

### Service topology

```
frontend (Next.js :3000)  →  backend (NestJS :4000)  →  postgres + redis
                                       │
                                       └─ Telegraf bot (long-poll or webhook)
```

The frontend calls the backend over `NEXT_PUBLIC_API_URL`. When rendering on the server (inside Docker), `lib/api.ts` swaps to the internal hostname `http://backend:4000`; in the browser it uses `http://localhost:4000`. **Both paths matter** — fetches happen on both sides for App Router pages.

### Backend (NestJS)

Module structure mirrors top-level domains: `tasks`, `customers`, `companies`, `items`, `invoices`, `recurring`, `dashboard`, `telegram`, `payments`. Each is a `*.module.ts` with controller + service + DTO (where applicable). All wired in `src/app.module.ts`.

- **`ai` module** — **(Phase C)** AI categorisation runtime. Route prefix `/ai`. Houses `AiClient` (provider-chain HTTP), `AiCategoriser` (inline and bulk suggest), and `AiRuleDrafter` (cluster mining + LLM rule writer). See `Architecture.md` for endpoint summary.

- **`payments` module** — **(Phase D)** Invoice payment matching. Route prefix `/payments`. Houses `PaymentsService` (`getCandidates`, `applyAllocations`, `deleteAllocation`, `getQueue` / `getQueueCount`, `dismiss` / `undismiss`, `getCustomerCredit`) plus three pure helpers (`recomputeInvoicePayment`, `scoreInvoice`, `findBundleSuggestion`). One-shot idempotent backfill runs from `onModuleInit`. Audit log lives in `AllocationEvent`. See `Architecture.md` for endpoint summary.

- **Prisma is the source of truth.** Schema lives at `backend/prisma/schema.prisma`. Migrations are *not* used — the entrypoint runs `prisma db push --accept-data-loss` on every boot. This is fine for additive changes; **destructive schema edits (column drops, type changes, new required columns on populated tables) will fail the push and require `docker compose down -v` to wipe the volume.**
- **Seed runs only when the User table is empty** (see `prisma/seed.ts`). Adding new dev data without wiping requires editing the seed and resetting volumes.
- **DTO validation is the single source of truth** for all input shapes. The Telegram bot deliberately runs the same `CreateTaskDto` through `class-validator` that the HTTP API uses — never duplicate validation rules client-side or in the bot.
- **Auto-incrementing numbers** (invoiceNumber, customerNumber) are computed in services as `MAX + 1` with seed-defined starting points (invoices start at 1000, customers at 1001). Not Postgres sequences.
- **BullMQ recurring job** (`recurring/recurring.processor.ts`) sweeps every minute and generates invoices from due `RecurringRule` rows. Constants live in `recurring.constants.ts` separately to avoid circular imports — preserve this split if you touch it.
- **Telegram bot** auto-disables if `TELEGRAM_BOT_TOKEN` is empty. Long-poll mode is used unless `TELEGRAM_WEBHOOK_DOMAIN` is set. Every incoming message passes through an allowlist middleware that checks `TelegramAllowlist.username` (lowercased, leading `@` stripped). The bot injects `TasksService` directly to mirror HTTP behavior.
- **PDF rendering** uses `@react-pdf/renderer`. All 10 production templates live at `backend/src/pdf/templates/<name>.tsx` and are wired to `design-1` … `design-10` in `templates/index.ts`. `default.tsx` stays only as a fallback for unknown keys. Each template registers its own `@fontsource/*` font(s) at module load — installed today: `inter`, `oswald`, `source-sans-3`, `dm-sans`, `manrope`, `lora`, `plus-jakarta-sans`. Backend `tsconfig.json` enables `"jsx": "react"` and includes `src/**/*.tsx`.
- **Templates are immutable from the UI.** The old `/settings/email-templates` and `/settings/invoice-templates` pages are gone; the two backend controllers retain only GET endpoints. To change template content, edit the seed (`backend/prisma/seed.ts`) and either reseed via `docker compose down -v` or run a direct `UPDATE` against `EmailTemplate` / `InvoiceTemplate`.

### Frontend (Next.js 15 App Router)

- **Pattern per module**: server-component page (`app/<module>/page.tsx`) loads data via `lib/api.ts`, then hands off to a client `<ModuleList>` component (e.g. `components/customers/customers-list.tsx`) that wraps `<FilteredList>` from `components/data/filtered-list.tsx`. Edit pages follow the same split: server page loads, client `*-form.tsx` renders form + handles submission.
- **Edit pages share `EditPageChrome`** (`components/layout/edit-page-chrome.tsx`) — every form (invoice / customer / company / item / task / recurring) wraps itself in it. The chrome renders the page padding, framer-motion entry, and a header row with `[← Back] Title ... [Cancel] [Edit?] [Save] [rightActions]`. Save submits the wrapped form via the `form="<formId>"` HTML attr. There is **no bottom action bar** anywhere — the old `FormActions` row was removed. New edit pages must follow this pattern.
- **List page filtering** is in-memory client-side via `<FilteredList>` + `FilterPanel`. Rows are loaded once on the server; filtering does not round-trip. This is fine at the scale of the seeded data; if a module grows past a few hundred rows, push filters into the backend instead.
- **Tasks is bespoke** — uses its own client component (`tasks-board.tsx`) with a dialog-based create flow, not the route-based `/new` pattern. It reuses `FilterPanel` directly.
- **Sidebar uses a single `SidebarBody`** rendered into either a desktop `<aside>` or a mobile `<Dialog>` sheet (`mobile-sidebar.tsx`). Don't duplicate nav definitions — edit the `nav` array in `sidebar.tsx`.
- **Icons**: sidebar uses `@phosphor-icons/react` with `weight="fill"`. Everywhere else (CommandBar, form actions, table actions) uses `lucide-react`. Don't mix these in one component.

### Project docs you must read before changing things

Four sibling docs sit alongside this file. Read the relevant one **before** the change, and update it **after**. The user expects this and audits.

| Doc | Read before… | Update when… |
|---|---|---|
| [modules_and_logic.md](modules_and_logic.md) | Touching any module's data model, list page, edit page, or business logic. Documents per-module fields (with required flags), list columns + filters + default sort, edit page row layout, non-obvious behaviour. | Behaviour or structure of any module changes. |
| [DatabaseSchema.md](DatabaseSchema.md) | Adding/renaming columns, tables, FKs, or enums. Documents every Prisma model, defaults, FK cascade rules. | Anything in `backend/prisma/schema.prisma` changes. |
| [Architecture.md](Architecture.md) | Adding a service, swapping a library, changing build/deploy. Documents the full stack per service, env vars, networking, build/run commands, operational caveats. | Stack or service topology changes. |
| [DesignSystem.md](DesignSystem.md) | Any UI change. Documents palette, radii, fonts, list-table sorting/pagination/filter rules, sidebar tokens, motion. | Tokens / patterns introduced or modified. |

Quick design-system highlights (full detail in the file):
- Page bg `#EDEEF3`, sidebar `#323D59`, navy on-dark text `slate-300` (always — no active-state color change on sub-nav).
- Cards/dialog `rounded-lg` (0.5rem). Buttons/form fields `rounded-[0.3rem]`.
- Font is Noto Sans via `next/font/google`.
- Filter panel uses `bg-[rgb(212_215_225_/_79%)]`.
- Lists: 100 rows/page, every column sortable, default sort is active-first then alphabetical for entities with `isActive`.

## Project rules (from prior CLAUDE.md, retained)

### Coding
1. **Think before coding.** State assumptions explicitly. Push back when a simpler approach exists.
2. **Simplicity first.** Minimum code that solves the problem. No speculative abstractions.
3. **Surgical changes.** Touch only what you must. Don't improve adjacent code or refactor what isn't broken.
4. **Goal-driven.** Define success criteria. Loop until verified.

### Tone
- No preamble. No filler ("Great question!", "I'll help you..."). Do the thing.
- When you don't know, say "I don't know" and stop.
- No emojis anywhere — code, comments, commits, chat.
- Concise. One-line answers stay one line.

### UI changes
- Refer to `DesignSystem.md` and existing patterns before building any UI.
- Match existing list/edit/modal patterns. Don't introduce new design tokens or layouts without asking.

### After changes
- Rebuild and verify the change is visible. If a Docker service is affected, restart it. The frontend rebuild takes ~30s; the backend ~60s including Prisma client regen.
- Test changes in the browser at the relevant viewport (desktop 1440, mobile 375 — both supported).
- **Screenshots go in `screenshots/`** — never the project root. The folder is gitignored. Save Playwright captures with relative paths like `screenshots/whatever.png`.
- Don't screenshot every change. Reserve screenshots for new components, layout changes, palette/icon swaps, or anything where rendered output can drift from intent. For trivial text/label edits, the diff is enough.

## Known gotchas

- **Schema changes that aren't additive** require `docker compose down -v`. The entrypoint will not auto-recover from `db push` failures.
- **Volume name `simplebooks_postgres_data`** is project-scoped via `name: simplebooks` in `docker-compose.yml`. Don't remove that line — historical work used the default project name `accounting` and the volume names will collide with other projects on this machine.
- **Prisma `Decimal` columns** come back as strings over JSON. Always wrap reads in `Number(...)` on the frontend before maths.
- **Date helpers must use local calendar parts, not `toISOString().slice(0, 10)`.** When the user is in a positive UTC offset (e.g. Australia/Perth at +08:00), the round-trip through UTC silently shifts the date back by one day, which surfaces as off-by-one bugs in computed fields (e.g. the auto Due Date on the invoice form). Use a `localIsoDate(d)` helper that builds `yyyy-mm-dd` from `getFullYear()` / `getMonth()` / `getDate()`. See the helper in `frontend/components/invoices/invoice-form.tsx`.
- **Bot token in `.env`** activates the bot on next backend restart. The Settings → Telegram page has a "Bot Token" *reference* field per allowlisted user — that field is informational only and never read at runtime. Only `TELEGRAM_BOT_TOKEN` from `.env` is used.
- **`RESEND_API_KEY` in `.env`** activates the HTTPS-based failure-notification email channel (used by `NotificationsService.notifyInvoiceSendFailed` so a broken customer-facing SMTP can't suppress its own failure alerts). Leave empty to skip the email path; Telegram remains the primary notification channel. Free tier at https://resend.com gives 100 sends/day. Sender defaults to `onboarding@resend.dev` (Resend's shared domain) — override via `RESEND_FROM` once a custom sending domain is verified. Both vars are listed in `.env.example`.
- **Mobile responsiveness** works for the dashboard and basic edit forms (single-column at < `md`). List-page tables have fixed-width grid columns and will horizontally scroll on phones — known limitation.
- **`vendorCustomerId` → `vendorId` rename (Phase B)** is non-additive. Existing dev DBs that ran Phase A must `docker compose down -v` before booting Phase B. `prisma db push --accept-data-loss` drops the old column.
- **`CategorisationEvent` is append-only.** Never UPDATE these rows. Phase C's AI reads recent events as few-shot training examples — mutating the history breaks that signal.
- **Rule priority is INT spaced by 10.** The `PATCH /rules/:id/move` endpoint swaps with the immediate neighbour. If repeated moves collapse the gap to 1, a future improvement should rebalance all priorities in a single transaction (not implemented in Phase B — manually adjust via direct UPDATE if needed).
- **Rule engine and CSV import interact via a two-phase commit.** When "Categorise based on rules" is ticked at import time, the engine runs in a separate query after the import's Prisma transaction has committed — the engine needs the new rows to be visible. This is synchronous and should complete in under 2s for a typical 200-row import.
- **`POST /rule-engine/test` is always a dry-run.** No rows are written. The rule editor's sample-matches preview calls this endpoint on debounce — safe to call frequently.
- **`AiCall` table grows unbounded.** A retention job is a future improvement; for now, occasional manual cleanup via `DELETE FROM "AiCall" WHERE "createdAt" < NOW() - INTERVAL '30 days'` is fine.
- **Phase C schema is fully additive.** Adding the `AI_REJECTED` enum value, the `sortOrder` / `clusterHash` / `reasoning` / `aiMiningThreshold` columns, and the `AiCall` table all survive `prisma db push` without `down -v`.
- **`AiProvider.apiKey` is stored verbatim** (matches the existing SMTP password precedent). Future improvement: encrypt at rest with a key from env. Not implemented.
- **AI outbound rate is governed per-provider, not per-process.** Each `AiProvider` row carries a `requestsPerMinute` field (default `15`, editable in `/settings/ai-setup`). `AiClientService.pace()` enforces it by atomically claiming time slots before every fetch — so `AI_BULK_CONCURRENCY=5` against a free Gemini key at RPM 15 will serialise to one request every 4s automatically rather than blowing the quota. On a 429, the client retries up to 2 times within the same provider with exponential backoff (1s, 3s + jitter, honouring `Retry-After`) before falling through to the next provider in the chain. 408/5xx still fall through immediately — only 429 retries in place.
- **AI Draft rule suppression** is keyed on `(clusterKey, categoryId)` only — denying a draft permanently suppresses *any* future rule with the same intent for the same category. Approving a draft does the same. To re-mine an intent you must delete the rule row entirely.
- **Invoice payment columns are denormalised**. `Invoice.amountPaid` / `amountOutstanding` are kept in sync by `recomputeInvoicePayment` inside every allocation transaction. Don't write them directly from outside `PaymentsService`. The manual status control on the invoice edit page is gated to `DRAFT` / `VOID` — `SENT` / `VIEWED` / `PARTIAL_PAID` / `PAID` are derived; flipping them by hand will be overwritten on the next allocation event.
- **Transaction balance is derived (server-computed via SQL window function), not stored.** The `Transaction.runningBalance` column was dropped on 2026-05-25. The list endpoint computes `Account.openingBalance + SUM(amount) OVER (PARTITION BY accountId ORDER BY date, id)` over the **unfiltered, unpaginated** per-account history and attaches it to each visible row, so balance stays correct under pagination and date/category/q filters. Same-day rows have a deterministic-but-arbitrary tiebreaker (`id ASC`) — the per-row balance for same-day rows may not match what the bank's statement showed. Account-level current balance (sum aggregation) is unaffected.
- **Import dedupe hash is `date|amount.toFixed(2)|normalisedDesc|ordinal`** where `ordinal` is the row's 1-based position within its `(date|amount|desc)` group inside the input batch. Single-occurrence rows always get ordinal `1`. Two identical rows in the same file get ordinals 1 and 2 and therefore distinct hashes — both land. Re-importing the same file produces the same hash SET (rows in a group are indistinguishable by definition, so any consistent ordinal assignment yields the same multiset) and dedupe still works. The importer also runs a post-insert sanity check: it counts rows actually landed for the new `importId` and compares against (distinct-hashes-in-batch minus already-in-DB). If they differ, the import transaction throws `BadRequestException` and rolls back — surfaces silent drops loudly. Changing the hash formula breaks dedupe for any pre-existing rows; pair any change with `TRUNCATE Transaction, TransactionImport CASCADE` on dev DBs.
- **Category hierarchy is one level deep, parents are pure grouping.** `Category.parentId` is nullable; rows with `parentId IS NULL` are either leaves (no children) or groups (≥1 child). Groups cannot hold transactions — `TransactionsService.setCategory` rejects assigning a categoryId whose row has children. Subcategories cannot have their own subcategories (one-level cap enforced in `CategoriesService.assertParentValid`). Name uniqueness is **per-parent, case-insensitive** (not global) so "Fees" can exist under both Banking and Education.
- **Converting a leaf to a parent via `POST /categories/:id/split` is idempotent.** It auto-creates `"<Parent> (general)"` as the first child and migrates every transaction pointing at the leaf to that new child in a single Prisma transaction. Calling split on a category that already has children is a no-op. The frontend triggers split only on the inline `+ Sub` flow for leaves with transactions.
- **`CategorisationEvent.providerId` is the audit source of truth for AI provenance.** Old events from before this column existed stay `NULL`. The provenance caption on transaction edit and the "Suggested by X" line on AI Review join through this FK.
- **`AiProvider.isEnabled` filters at the chain level.** `AiClientService.complete()` reads `findMany({ where: { isEnabled: true }, ... })`. A disabled provider is invisible: it doesn't fire, doesn't count as a failed attempt, doesn't appear in AiCall logs. If all enabled providers are disabled, the chain returns `{ ok: false, error: 'no-providers' }` (same shape as empty chain).
- **Reports endpoints use raw SQL** because Prisma's typed `groupBy` cannot compose with `COALESCE` over a joined column. `ReportsService.getReport` builds a parameterized `Prisma.sql` template — `from`/`to`/`accountIds` are validated by the DTO before hitting the query so SQL injection isn't possible, but **any new filter must use the `Prisma.sql` template-literal form, never string concatenation**.
- **Date-range filters use `localStartOfDay` / `localEndOfDay`** from `backend/src/util/dates.ts`. `new Date("YYYY-MM-DD")` parses as UTC midnight which rolls back a day in positive-offset zones (Perth +08:00). The helpers convert via Intl to the correct UTC instant for the given calendar day in the user's timezone (from `Preferences.timezone`). Reports and any future date-range query MUST go through these helpers.
- **`exceljs` is dynamic-imported on the Export click** in `frontend/lib/export-excel.ts`. It must NEVER be statically imported anywhere — it adds ~700KB to the main bundle. The pattern `const ExcelJS = (await import('exceljs')).default;` keeps it out.
- **Recharts donut slice click handlers receive the data object** (`entry`), not an event. When binding `onClick={(entry: any) => onSelect(entry.id)}`, the `id` must be a field on each pie data object — Recharts forwards the whole row.
- **`Transaction.accountId` is `text`, not `uuid`** in Postgres (Prisma maps `String @id @default(uuid())` to text). When using a raw `ANY(...)` filter, cast the parameter array to `::text[]`, not `::uuid[]`, or Postgres throws `operator does not exist: text = uuid`.
- **`Category.customerId` boosts the Payments scorer by +30.** Nullable FK on `Category` → `Customer` (ON DELETE SET NULL). When set on the leaf category a transaction is categorised under, and that same `customerId` matches an invoice's `customerId`, `scoreInvoice` adds +30 — stronger than the name-token match (+15) but weaker than invoice-number (+60) and exact-amount (+40). The UI offers this link only for INCOME-kind categories (`CategoryFormDialog` shows the Linked customer select only when effective kind is INCOME).
- **`PaymentsService.getCandidates` now unions vendor.customerId and category.customerId** when pulling candidate invoices. Before this change a transaction with only a category→customer link (no vendor link) would short-circuit to zero candidates; now category-only links also pull that customer's open invoices into the candidate pool so the +30 signal does meaningful ranking work.
- **AI Review page is tabbed: Review / Queue.** Review shows pending AI drafts awaiting human accept/reject; Queue shows the in-flight bulk-suggest run's pending transactions. The Queue tab polls `GET /ai/bulk-suggest/active` every 2s while a run is active (10s when idle). "Cancel All" hits `POST /ai/bulk-suggest/active/cancel` which sets `BulkRun.cancelled` on the active run — workers check it on each iteration and skip the rest. Per-transaction cancel is intentionally not implemented in v1.
- **`BulkRuns.active()` returns the most recent run with `pendingTxIds.size > 0`.** Used by the Queue UI which doesn't track runIds. If multiple runs ever overlap (single-user app, unlikely today) only the latest is shown.
- **Nest route order matters for `bulk-suggest/active` vs `bulk-suggest/:runId/*`.** The literal `active` paths must be declared *before* the `:runId`-parameterised ones in `ai.controller.ts`, otherwise Nest matches `:runId = "active"` and the literal route is unreachable.
- **Edit Transaction modal uses two-stage category selection.** The single Category dropdown was replaced by Category (top-level only) + Subcategory (children of the picked parent). When the picked parent is a leaf with no children, the Subcategory dropdown shows a disabled "no subcategories" hint and the parent's own id is submitted as `categoryId`. When the parent has children, Save is disabled until a subcategory is picked (transactions can't attach to a parent — enforced by the existing service-layer guard in `setCategory`).

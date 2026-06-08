# SimpleBooks — Admin User Guide

> v0.10.6. Covers Users, Roles, API Keys, Audit Log, Data Retention, env-driven bootstrap, the Telegram bot, and the SMTP vs Resend email split. Banking is documented separately in `user-guide-banking.md`.

## 1. Roles at a glance

| Role | Sees | Cannot |
|---|---|---|
| **Admin** | Everything. | Nothing (locked-true on every capability). |
| **Accountant** | Full nav including Dashboard, Cashflow, Income/Expense/Tags reports, Statements, Banking. Export buttons. API docs. | Delete anything. See Users / Roles / API Keys / Audit Log / Data Retention / AI Setup / Mail Configuration / Telegram (under Settings). |
| **Bookkeeper** | Banking, Sales, Companies, Customers, Tasks, Tags Report, Statements, Expense Report. | Dashboard, Cashflow, Income Report. Any delete action. Any export. Preferences / AI Setup / Mail Configuration / Telegram / Roles / Users (under Settings). |
| **API User** | Same as Accountant if they ever log in. Primarily authenticates programmatically via `Authorization: Bearer sb_live_<key>`. | Delete actions. |

Default landing after login: admin → Dashboard, everyone else → Invoices.

## 2. Bootstrap admin

The first admin is created from env vars on every boot. The backend refuses to start without both:

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<long-random-string>
```

The env credentials remain valid for the lifetime of the deploy — there is no UI to rotate them. Edit `.env` and restart to change. The env admin has `passwordHash=NULL` in the database; logins are verified against the env directly. Failed logins from the same IP are rate-limited (5 failures in 10 minutes → blocked for the rest of the window). Per-user, 5 failed attempts triggers a 30-minute account lock.

## 3. Settings → Users

Admin-only.

**Create a user.**  Username + display name + role + initial password. Email is optional contact info (not used for login). Share the initial password through a secure channel — there is no self-service password change, so users use whatever you set.

**Reset a password.**  Key icon next to each row. Sets a new password on the user's behalf.

**Delete a user.**  Trash icon. Blocked when the user is yourself; when they are the last active admin; and when they are the env-admin row.

**Self-protection rules** (enforced server-side, not just UI):
- You cannot change your own role.
- You cannot deactivate or delete yourself.
- The last active admin cannot be demoted, deactivated, or deleted.
- The env-admin row cannot be deleted.

## 4. Settings → API Keys

Admin-only. Used to issue bearer tokens for programmatic access (Zapier, custom dashboards, scripts).

**Issue a key.**
1. Create an `API_USER` row in Settings → Users.
2. Settings → API Keys → New API key → pick the user, label it ("Zapier integration"), optional expiry → Create.
3. The plaintext key is shown **once**. Copy it now; it cannot be recovered.

Keys begin with `sb_live_`. Use them as:

```
Authorization: Bearer sb_live_<rest-of-the-key>
```

**Revoke.**  Trash icon. The next request with that token returns 401.

API users are subject to the same role/capability rules as their UI counterparts — DELETE requests with an API key whose user lacks `action.delete` return 403.

## 5. Settings → Roles (override matrix)

Admin-only. The default capability set per role is hard-coded; this page lets you flip individual cells. ADMIN's column is locked-true and cannot be weakened — this prevents a single click from locking every admin out of admin functions.

Changes propagate within ~60 seconds (in-process cache TTL) for every signed-in user. Capabilities are grouped:

- **Navigation** — top-level page access (Dashboard, Cashflow, etc.).
- **Settings sections** — sub-pages under `/settings`.
- **Actions** — cross-cutting (`action.delete`, `action.export`, `action.docs_access`).

Backend enforces every capability — frontend hiding is a UX improvement, not the security boundary.

## 6. Settings → Audit Log

Admin-only. Append-only record of:

- Logins (success + failure with reason).
- Logouts.
- User CRUD.
- Role changes + override matrix edits.
- API key creation + revocation.
- Every successful DELETE request (captured automatically).
- Retention purges.

Filter by action, date range, or actor. Failed logins record an unauthenticated row (no actor) with the attempted username and reason in `metadata`.

To control growth, purge from Settings → Data Retention.

## 7. Settings → Data Retention

Admin-only. Shows per-table current row count and oldest-entry date. Each row has two independent controls:

**Manual purge** (right-hand side)
Pick a cutoff (`7d`, `30d`, `90d`, `1y`, or `all` — default `1y`) and click **Purge now** to delete entries older than that. One-shot. Audited as you.

**Auto-purge daily** (v0.10.3, left-hand side)
Flip the **Auto-purge** switch and pick a cutoff (`7d`, `30d`, `90d`, `1y`). A nightly sweep at **03:15** deletes anything older than your chosen cutoff for every table where the switch is on. The "Last auto-run" caption under the switch shows the most recent successful run. Each auto-run writes a `DATA_RETENTION_PURGE` audit entry tagged `auto: true`, so you can always reconstruct what was deleted and when.

> **Note:** the `all` cutoff is intentionally not offered for auto-purge — it's only available for manual, one-shot purges. The schedule never wipes a table to zero on its own.

Tables managed here:

| Table | Notes |
|---|---|
| Audit Log | Login events, role changes, deletes |
| Import Logs | CSV import receipts |
| Allocation Events | Payment apply / un-apply audit |
| Categorisation Events | **AI training signal — purge cautiously.** The AI Categoriser uses recent events as few-shot examples; deleting them degrades suggestion quality for a while. Leaving auto-purge off here is reasonable. |
| AI Calls | One row per LLM request/response |
| Sessions | Expired sessions are auto-purged hourly independent of any policy. This row is here for diagnostic clarity. |

Purges write their own `DATA_RETENTION_PURGE` audit entry so the action itself is recoverable in case you need to trace what was removed.

## 8. Env-driven first-run setup

Populate the env once and SimpleBooks comes up fully functional. Every block is idempotent: written only when the corresponding row(s) are absent, so subsequent edits in the UI always win.

- **SMTP** — `SMTP_HOST`, `SMTP_PORT`, `SMTP_ENCRYPTION` (`NONE`/`SSL`/`TLS`/`STARTTLS`), `SMTP_USER`, `SMTP_PASSWORD`. All five required. Customer-facing email — see §10 for the full SMTP vs Resend explanation.
- **Resend (failure-alert channel)** — `RESEND_API_KEY` (+ optional `RESEND_FROM`, defaults to the shared `onboarding@resend.dev`). Separate from SMTP — only fires when an invoice send fails. See §10.
- **Telegram allowlist** — `TELEGRAM_ALLOWLIST_USERNAMES` — comma-separated handles (no `@`). Each becomes a `TelegramAllowlist` row labelled with the env admin's username. **Recommendation:** link your own Telegram username to admin for full bot capability — the bot acts as the linked SimpleBooks user, so admin gives it full access to add / list / edit / delete tasks and receive notifications.
- **AI providers** — two optional slots. Per slot: `AI_PROVIDER_{1,2}_NAME`, `_MODEL`, `_API_BASE_URL`, `_API_KEY`, optional `_RPM` (default 15). Slot 1 is marked primary, slot 2 fallback.

Partial blocks are logged as warnings and skipped.

## 9. Telegram bot

**(v0.10)** The bot runs as the SimpleBooks user linked to each allowlisted Telegram handle. Every command goes through that user's role + capabilities — the bot is never a privileged backdoor.

**Setup**
1. Settings → Telegram → **Add user**. Enter the Telegram handle (with or without `@`), pick the SimpleBooks user it should act as, and save. **For a personal-use bot, link to admin** — that gives the bot full task capability including delete. For a team bot, link each handle to the user whose role you want the bot to inherit.
2. (Optional) populate `TELEGRAM_ALLOWLIST_USERNAMES` in `.env` — comma-separated handles. Each is created on first boot linked to the env admin. UI edits afterwards always win.

**Commands**

```
/start       Connect this chat and show which SimpleBooks user the bot is linked to.
/help        Command reference.
/tasks       List open tasks with inline buttons.
/newtask <t> Create a task with title <t>.
/newtask     Create a task — bot will ask for the title.
/cancel      Abandon any pending edit/new-task prompt.
```

**Inline buttons (`/tasks`)** — each open task renders as:

```
⏳ Reconcile bank statement
   [ ✓ Done ]  [ ✏️ Edit ]  [ 🗑 Delete ]
```

- ✓ **Done** — marks the task COMPLETED. Message updates to `✅ <title>`.
- ✏️ **Edit** — bot replies "Send the new title for this task." The next free-text message becomes the new title.
- 🗑 **Delete** — confirm dialog `[Yes, delete] [Cancel]`. Yes = permanent delete.

The Delete button is only rendered when the linked user has `action.delete`. A bookkeeper-linked bot sees `[ ✓ Done ] [ ✏️ Edit ]` only. A user with `nav.tasks` denied entirely sees `Your linked SimpleBooks role does not permit you to view tasks.`

**Notifications.** Invoice send failures already publish here. Future channels (payment matches, recurring-rule generation) will reuse `TelegramService.notify(text)` and arrive at every chat that has ever run `/start`.

**Allowlist-row hygiene.** If you delete the linked SimpleBooks user, the FK is set to NULL and the bot rejects further commands from that handle with `Sorry, @… is not authorized.` Admin must re-link via Settings → Telegram. This is by design — bot capability without a linked user would silently default to allowing everything.

## 10. Email — SMTP vs Resend

SimpleBooks uses **two different email channels for two different jobs**. They never overlap, and you should configure both.

### SMTP — customer-facing email

Sends invoices and statements *to your customers* over standard SMTP (port 25 / 465 / 587). Configured per-billing-company in **Settings → Mail Configuration** (or seeded once from `SMTP_HOST` / `_PORT` / `_ENCRYPTION` / `_USER` / `_PASSWORD` env on first boot). Used every time you click **Send** on an invoice or statement.

You'll want a real transactional provider — Brevo / SendGrid / Mailgun / Postmark / your hosting provider's SMTP. All five env fields are required together; partial config is logged and skipped.

### Resend — admin failure-alert channel

`RESEND_API_KEY` (free tier 100 sends/day at https://resend.com) activates a totally separate **HTTPS** email channel the backend uses *to alert you when something breaks*. This exists precisely because **the customer SMTP itself might be the thing that's broken** — using that same SMTP to email yourself about its own outage obviously won't work. Resend rides over HTTPS to a separate provider, so a broken customer SMTP can't suppress its own alarms.

When an invoice send fails (synchronous + 3 retry attempts, 10-minute fixed backoff, ~30 minutes total), the backend fires a notification through `NotificationsService.notifyInvoiceSendFailed()`:

1. **Telegram first** — pings every chat that has ever `/start`-ed the bot. If that succeeds, stop.
2. **Resend as fallback** — if Telegram is down or no handles are allowlisted, sends a plain-text alert via Resend's HTTPS API.

If neither is configured, the failure is logged to the backend container only — you'll never see it.

**`RESEND_FROM`** defaults to Resend's shared `onboarding@resend.dev`. Override once you've verified your own sending domain in Resend (recommended for anything beyond local dev).

### Quick truth table

| Scenario | Channel used |
|---|---|
| Click **Send** on an invoice | SMTP (customer-facing) |
| Send a customer statement | SMTP |
| Recurring invoice auto-generates + sends | SMTP |
| Background queue retries an invoice and gives up | Telegram → Resend (fallback) |
| Customer SMTP itself is broken | Telegram → Resend (the whole point of Resend) |

### Setup recommendation

- **SMTP** — required for customer email. Configure in **Settings → Mail Configuration** per billing company, or env-seed it.
- **Telegram allowlist** — the primary alert channel (instant on your phone, no domain to maintain). Configure in **Settings → Telegram** or env-seed via `TELEGRAM_ALLOWLIST_USERNAMES`.
- **Resend** — the belt-and-suspenders backup so failure alerts still land if SMTP and Telegram are both unreachable. Set `RESEND_API_KEY` in env. Once you have a sending domain verified in Resend, set `RESEND_FROM` to your own address.

You can leave Resend unset — Telegram is the primary channel. But you lose the alarm-of-last-resort if Telegram is also unreachable.

## 11. Public surfaces (no auth)

These remain reachable without a SimpleBooks login by design:

- `/i/<token>` — customer-facing invoice link.
- `POST /telegram/webhook/:secret` — Telegram delivers updates here; authenticated by the URL-embedded shared secret.
- `/login` — the login page itself.
- PWA static (`/manifest.webmanifest`, `/sw.js`, app icons).

Everything else (`/`, `/invoices`, `/transactions`, every `/settings/*`, every `/reports/*`, every `/api/*` non-public route) requires authentication.

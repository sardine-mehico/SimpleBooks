# Telegram Bot Conversational Flows

The Telegram bot is implemented in `backend/src/telegram/telegram.service.ts` using `telegraf`. It activates at backend boot when `TELEGRAM_BOT_TOKEN` is set in `.env`; otherwise it's silently disabled. Every incoming message passes through an allowlist gate that checks the sender's Telegram username against the `TelegramAllowlist` table (lowercased, leading `@` stripped). Rejected senders get a polite refusal.

## Universal Rules
- Every response must be concise (optimised for mobile screens).
- Use inline keyboard buttons instead of raw text replies whenever options are limited.

## Command Matrix (user-initiated)

| Command | Behaviour |
|---|---|
| `/start` | Upserts a `TelegramChat` row keyed by `chatId` (binds the chat to the user's last-seen username). Replies "Connected as @username. Type /help to see commands." |
| `/help` | Replies with a short list of the available commands. |
| `/tasks` | Loads all tasks with status `PENDING` or `IN_PROGRESS`. For each task, sends one message with the title prefixed by the status emoji (`⏳` / `🔵` / `✅` / `⛔`) and two inline buttons: `✓ Complete` (transitions to `COMPLETED`) and `✗ Cancel` (transitions to `CANCELLED`). Empty list → "No open tasks." |
| `/newtask <title>` | Creates a task using the same `CreateTaskDto` + `class-validator` chain the HTTP API runs. The bot is **not** a separate validation surface — DTOs are the single source of truth. On validation failure, the bot echoes the constraint message prefixed with `❌`. |

## Inline Button Callbacks

Clicking a `✓ Complete` or `✗ Cancel` button on a `/tasks` response fires a callback. The bot calls `TasksService.update(id, { status })` directly (mirroring the HTTP path) and edits the original message to prepend the new status emoji. If the task was already deleted, the bot replies "Already gone" without throwing.

## Outbound Notifications (system → user)

In addition to the command flow above, the bot can broadcast system notifications to **every connected chat** (all `TelegramChat` rows). Currently the only consumer is `NotificationsService.notifyInvoiceSendFailed`, which fires when an invoice's email send has failed all 4 attempts in the `invoice-mail` BullMQ queue (1 synchronous attempt + 3 retries 10 minutes apart). The broadcast message format:

```
INV-1024 (ABC Corp) failed to send after 4 attempts.

Last error:
<verbatim SMTP error from nodemailer>

Open the invoice in SimpleBooks to retry once the SMTP issue is resolved.
```

The broadcast is best-effort: per-chat errors are caught and logged so a single stale `chatId` doesn't kill the rest of the broadcast or the BullMQ worker. The same notification is also sent via Resend HTTPS (not SMTP) to the billing company's `accountsEmail`, so a broken outbound SMTP can't suppress its own failure alert.

## Error Handling
- If a database operation fails inside a command handler, the bot must reply: "⚠️ Sorry, I couldn't process that request right now. Please try again."
- Network/Telegram-side failures at bot boot (webhook registration, long-poll launch) are logged and swallowed — the rest of the backend boots normally.

## Webhook vs Long-Poll
- If `TELEGRAM_WEBHOOK_DOMAIN` is set, the bot registers a webhook at `${domain}/telegram/webhook/${TELEGRAM_WEBHOOK_SECRET}` (secret defaults to `telegram`).
- Otherwise it runs in long-poll mode.
- The choice is made once at boot — changing the env var requires a backend restart.

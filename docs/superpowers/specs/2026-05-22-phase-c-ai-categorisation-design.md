# Phase C — AI-Assisted Categorisation: Design

**Date:** 2026-05-22
**Scope:** All four Phase C features (per user-guide-banking.md §14):
1. Multi-provider fallback runtime (OpenAI-compatible HTTP client with primary → backup chain).
2. AI category suggestions on transactions (inline, bulk, and review queue).
3. AI-drafted rules (pattern-mined from user history, surfaced in the AI Drafts tab of `/rules`).
4. CategorisationEvent history drawer (audit surface on each transaction).

**Constraint:** all schema changes are additive — no `docker compose down -v` is required to apply Phase C.

**Out of scope:** SDK-style rate-limit backoff, prompt-result caching beyond the 24h unresolved-draft window, streaming responses, provider-specific code paths (everything talks `/chat/completions` with `response_format: json_schema`), retention policy for the `AiCall` table (left for a future cleanup job).

---

## 1. Architecture and module layout

Phase C is one new backend module, three new (or extended) frontend areas, and a small additive schema layer. No existing module is rewritten.

### Backend — new `ai` module

```
backend/src/ai/
  ai.module.ts              Nest module; imports PrismaModule, AiProvidersModule
  ai-client.service.ts      Provider-chain HTTP client (fallback, retry, AiCall logging)
  ai-categoriser.service.ts Few-shot builder + suggest-category orchestration
  ai-rule-drafter.service.ts Cluster mining + LLM rule writer
  ai.controller.ts          HTTP endpoints
  ai.dto.ts                 Validation
  prompts/
    categorise.ts           System prompt + JSON schema for category suggestions
    draft-rule.ts           System prompt + JSON schema for rule drafting
  types.ts
```

`AiProvidersModule` retains its existing CRUD responsibilities and is the only seam to the new module. `RuleEngineModule` and `CategorisationEventsModule` are untouched.

### Frontend additions

- `frontend/components/transactions/transaction-edit-modal.tsx` — gains an AI suggestion banner slot and an "Ask AI for a different opinion" link for already-categorised transactions.
- `frontend/app/transactions/ai-review/page.tsx` + `frontend/components/transactions/ai-review-list.tsx` — new dedicated review queue.
- `frontend/app/transactions/page.tsx` + table — adds a "Categorise with AI" bulk action.
- `frontend/components/rules/rules-list.tsx` — gains the "Find candidates from history" button and per-row Approve / Modify / Deny actions on AI_DRAFTED rules.
- `frontend/components/transactions/transaction-history-drawer.tsx` — new component, opens from a button in the transaction edit modal.
- `frontend/components/settings/ai-setup-page.tsx` — extended with up/down arrows on backup cards and a "Rule drafting threshold" field.

### Lib client

`frontend/lib/ai.ts` — thin module mirroring `lib/banking-rules.ts`: `suggestCategory(txId, opts?)`, `bulkSuggest(query)`, `applyAiSuggestion(txId, decision)`, `rejectAiSuggestion(txId)`, `mineRuleDrafts()`, `moveProvider(id, direction)`.

### Data flow — primary path (inline AI suggest in edit modal)

```
[modal opens, tx is uncategorised]
   POST /ai/suggest-category { transactionId }
      AiCategoriser.suggest(tx)
         Build few-shot (Prisma read, 30 rows, stratified by category)
         AiClient.complete(prompt, jsonSchema)  -> primary -> backups -> ...
            writes one AiCall row per HTTP attempt
         writes CategorisationEvent { source: AI_DRAFT, newCategoryId, newVendorId, reasoning }
      returns { categoryId, vendorId?, confidence, reasoning }
   UI shows banner with [Accept] [Edit] [Reject]

[user clicks Accept | Edit | Reject]
   POST /ai/apply { transactionId, decision }
      accept: update Transaction; write CategorisationEvent AI_APPLIED accepted=true
      edit:   update Transaction; write CategorisationEvent AI_APPLIED accepted=false
      reject: no tx update;       write CategorisationEvent AI_REJECTED
```

---

## 2. Schema changes

All additive. Postgres adds enum values and nullable columns without data loss, so `prisma db push` succeeds without `--force-reset` and without wiping volumes.

```prisma
// CHANGE: extend AiProvider — sortOrder column for backup ordering
model AiProvider {
  id         String   @id @default(uuid())
  name       String
  model      String
  apiBaseUrl String
  apiKey     String
  isPrimary  Boolean  @default(false)
  sortOrder  Int      @default(1000)   // NEW — consulted only for isPrimary=false rows
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  calls      AiCall[]                  // NEW inverse
  @@index([isPrimary, sortOrder])      // NEW
}

// CHANGE: add AI_REJECTED to EventSource enum
enum EventSource {
  USER
  RULE
  VENDOR_MATCH
  AI_DRAFT
  AI_APPLIED
  AI_REJECTED                          // NEW
}

// CHANGE: extend CategorisationEvent with reasoning text
model CategorisationEvent {
  // ...existing fields unchanged...
  reasoning String?                    // NEW — AI's free-text justification (<=200 chars)
}

// CHANGE: extend Rule with clusterHash for mining suppression
model Rule {
  // ...existing fields unchanged...
  clusterHash String?                  // NEW — populated when state in (AI_DRAFTED, APPROVED, DENIED)
  @@index([clusterHash])
}

// CHANGE: extend Preferences with mining threshold
model Preferences {
  // ...existing fields unchanged...
  aiMiningThreshold Int @default(5)    // NEW
}

// NEW: enums for AiCall
enum AiCallPurpose { CATEGORISE DRAFT_RULE }
enum AiCallStatus  { OK FAILED }

// NEW: AiCall — one row per HTTP attempt for full observability of the provider chain
model AiCall {
  id               String        @id @default(uuid())
  providerId       String
  provider         AiProvider    @relation(fields: [providerId], references: [id], onDelete: Cascade)
  purpose          AiCallPurpose
  promptTokens     Int?
  completionTokens Int?
  latencyMs        Int
  status           AiCallStatus
  httpStatus       Int?                // null on network failure
  errorMessage     String?
  transactionId    String?             // populated when purpose=CATEGORISE
  ruleId           String?             // populated when purpose=DRAFT_RULE
  createdAt        DateTime      @default(now())

  @@index([providerId, createdAt])
  @@index([status, createdAt])
  @@index([transactionId])
}
```

### Provider-chain sort

```ts
const chain = await prisma.aiProvider.findMany({
  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
});
// -> [primary, backup1, backup2, ..., createdAt-tiebreak]
```

### Reseed expectations

- The Preferences singleton is not currently seeded (the table is empty until the first PATCH lands). The new `aiMiningThreshold` column gets its `@default(5)` directly from Prisma — no seed change needed. The settings page will lazy-create the row on first save if absent (mirroring the existing read-then-upsert pattern of preferences endpoints).
- No `AiProvider` seed (still user-created).
- No `AiCall` seed.

---

## 3. AI runtime — `AiClient`

The only file in the codebase that makes HTTPS calls to LLM providers.

### Public API

```ts
export interface AiCompleteInput {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: JsonSchema;       // for response_format
  purpose: AiCallPurpose;       // CATEGORISE | DRAFT_RULE — recorded on AiCall
  timeoutMs: number;            // 20_000 inline, 60_000 bulk/mining
  contextIds?: { transactionId?: string; ruleId?: string };
}

export type AiCompleteResult<T> =
  | { ok: true;  data: T; providerId: string; attempts: number;
                 promptTokens: number | null; completionTokens: number | null }
  | { ok: false; error: 'no-providers' | 'chain-exhausted';
                 lastError?: { providerId: string; httpStatus?: number; message: string } };

class AiClient {
  async complete<T>(input: AiCompleteInput): Promise<AiCompleteResult<T>>;
}
```

The result is a discriminated union — callers cannot accidentally use `data` on a failure. Failure cases never throw.

### Provider chain algorithm

```
chain = load providers ordered [isPrimary desc, sortOrder asc, createdAt asc]
if chain is empty: return { ok: false, error: 'no-providers' }

for provider in chain:
  t0 = now
  try:
    response = await fetch(`${provider.apiBaseUrl}/chat/completions`, {
      method: POST,
      headers: { Authorization: `Bearer ${provider.apiKey}`, Content-Type: 'application/json' },
      body: {
        model: provider.model,
        messages: [{ role: 'system', content: systemPrompt },
                   { role: 'user', content: userPrompt }],
        response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } },
        temperature: 0,
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if response.status in [408, 429] or 500..599:
       write AiCall(FAILED, http=status), continue chain
    if response.status >= 400:
       write AiCall(FAILED, http=status), STOP — misconfig, surface (sub-clause below for bulk)

    parsed = parse JSON; validate against jsonSchema
    if validation fails:
       one repair retry: same provider, append validation error to user prompt
       if still fails: write AiCall(FAILED), continue chain

    write AiCall(OK, tokens, latency)
    return { ok: true, data: parsed, providerId, attempts: <chain index+1>, ...tokens }

  catch (network/timeout/abort):
    write AiCall(FAILED, http=null, err=e.message), continue chain

return { ok: false, error: 'chain-exhausted', lastError: <last failure> }
```

### What counts as "not available" (= move to next)

- Network failure (DNS, ECONNREFUSED, TLS).
- HTTP 408 (timeout), 429 (rate limited), 5xx.
- Request timeout (no response within `timeoutMs`).
- Invalid response body (non-JSON, or JSON failing schema after one repair retry).

### What does NOT trigger fallback

- HTTP 4xx other than 408/429 (401 wrong key, 400 bad request, 404 wrong base URL). These are misconfigurations; surfacing is more useful than masking.

### 4xx misconfig clause — bulk vs inline

- **Inline path:** a 4xx (not 408/429) on a provider surfaces immediately; the chain does NOT continue.
- **Bulk path** (categorise multiple transactions, or rule mining over multiple clusters): each row independently restarts the chain. A misconfigured primary records its 4xx on row N and continues to row N+1 (which restarts the chain from the top, hitting the same primary again). This is intentional — the misconfig signal stays loud rather than being silently routed around for the rest of the batch.

### Retry policy: R-A (straight chain)

No retry per provider. If primary returns a fallback-worthy error, we move directly to the next provider. The one exception is the JSON-schema repair retry on the same provider (because the provider responded — it just gave us malformed JSON; one more try is cheap).

### Concurrency

- Bulk and mining paths: hard cap of `pLimit(5)` (concurrency limiter). Configurable via `AI_BULK_CONCURRENCY` env var. `p-limit` is not currently in `backend/package.json`; add it during implementation (or inline a ~20-line semaphore implementation in `backend/src/ai/utils/p-limit.ts` to avoid the dep). Either is fine — inline is preferred for a small utility we fully own.
- Inline path: one call in flight per user action — no concurrency control needed.

### Timeouts

- Inline (modal): `timeoutMs = 20_000`.
- Bulk + mining: `timeoutMs = 60_000`.
- Env-overridable: `AI_TIMEOUT_INLINE_MS`, `AI_TIMEOUT_BULK_MS`.

### When the chain is exhausted

- **Inline modal:** banner shows "AI unavailable — provider chain exhausted" with a `[Retry]` link that re-fires with `force: true`. Modal remains functional for manual categorisation. No event written (no `AI_DRAFT`).
- **Bulk:** results summary marks failed rows with the chain's last error. User can re-run just the failed rows.
- **Mining:** error toast; AI_DRAFTED tab unchanged.

### AiCall row lifecycle

One row per HTTP attempt. A chain primary-fail → backup1-fail → backup2-OK writes three `AiCall` rows: two FAILED + one OK. The OK row's `transactionId` matches the request context. `purpose=CATEGORISE` rows correspond 1:1 with the `AI_DRAFT` event they produced; `purpose=DRAFT_RULE` rows correspond 1:1 with the inserted `Rule(state=AI_DRAFTED)` they produced.

### Deliberately not done

- No streaming (we need the full JSON validated server-side before the UI shows it).
- No provider-specific branching.
- No client-side prompt cache (temperature=0 and stable few-shots let provider-side caching do the work).
- No retry-storm logic on 429 (a 429 just moves to the next provider).

---

## 4. `AiCategoriser` service

### Public API

```ts
class AiCategoriser {
  async suggest(transactionId: string, opts?: { force?: boolean }): Promise<SuggestResult>;
  async bulkSuggest(query: BulkSuggestQuery): Promise<BulkSuggestResult>;
  async apply(transactionId: string, decision: ApplyDecision): Promise<void>;
}

type SuggestResult =
  | { kind: 'fresh';  draft: AiDraftView }     // AI was called, AI_DRAFT written
  | { kind: 'cached'; draft: AiDraftView }     // recent unresolved AI_DRAFT reused
  | { kind: 'failed'; error: string };

interface AiDraftView {
  eventId: string;
  categoryId: string | null;     // null if AI could not pick
  categoryName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  confidence: 'high' | 'med' | 'low';
  reasoning: string;
  providerId: string;
  createdAt: string;
}

type ApplyDecision =
  | { action: 'accept' }
  | { action: 'edit'; chosenCategoryId: string; chosenVendorId?: string | null }
  | { action: 'reject' };
```

### Idempotency rule for `suggest()`

```
if not force:
  latestDraft = newest CategorisationEvent for tx where source=AI_DRAFT
                AND no subsequent AI_APPLIED|AI_REJECTED for this tx since
  if latestDraft and latestDraft.createdAt > now - 24h:
    return { kind: 'cached', draft: <project latestDraft to AiDraftView> }

// else call AI
```

The "Ask AI for a different opinion" link sets `force: true`.

### Prompt — system (stable, cacheable on provider side)

```
You are a bookkeeping assistant for SimpleBooks. You categorise bank
transactions for a small business. The user has defined a fixed list of
categories and vendors; you must choose from those lists only.

Output strict JSON matching the provided schema. If you cannot pick a
category with at least "low" confidence, return categoryId=null and
explain in `reasoning` what's missing. Never invent an id.

The user's recent manual categorisations are provided as examples.
Mimic the user's patterns, do not impose your own taxonomy.
```

### Prompt — user (rebuilt per call)

Sections:
- `CATEGORIES (id | name | kind | times-used-by-user)` — all `isActive=true` categories.
- `VENDORS (id | name | known aliases)` — all `isActive=true` vendors, capped at the 50 most-used by transaction count.
- `RECENT MANUAL CATEGORISATIONS` — few-shot block built by Q-A + S-B (see below).
- `TRANSACTION TO CATEGORISE` — date, signed amount, description, optional vendor-matcher guess, account name.

### Response JSON schema

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["categoryId", "vendorId", "confidence", "reasoning"],
  "properties": {
    "categoryId": { "type": ["string", "null"] },
    "vendorId":   { "type": ["string", "null"] },
    "confidence": { "type": "string", "enum": ["high", "med", "low"] },
    "reasoning":  { "type": "string", "maxLength": 200 }
  }
}
```

### Post-validation hardening

```
if categoryId is not null and not in active categories: FAIL (chain moves on or surfaces error)
if vendorId   is not null and not in active vendors:    set vendorId = null (degrade, don't fail)
if reasoning length > 200: truncate
```

Category-id hallucination is hard fail (the field is the point). Vendor-id hallucination is soft fail.

### Few-shot builder — Q-A + S-B, N=30

Qualification (Q-A):
```ts
{
  OR: [
    { source: 'USER' },
    { source: 'AI_APPLIED', acceptedAiSuggestion: true },
  ],
  newCategoryId: { not: null },
}
```

Selection (S-B, stratified by category):
```ts
const N_PER_CATEGORY = 2;
const TOTAL_CAP = 30;
// Group qualifying events by newCategoryId, take first N_PER_CATEGORY per group
// in createdAt-desc order, flatten, cap at TOTAL_CAP, then sort ASC by createdAt
// for prompt readability.
```

If a category has fewer than `N_PER_CATEGORY` events, it gets fewer (or zero) examples. Empty history = no `RECENT MANUAL CATEGORISATIONS` block; system prompt is honest about this.

### Event writes — `apply()` behaviour

```
load latest unresolved AI_DRAFT for this tx (must exist; 409 if not)
load tx for old values

within $transaction:
  accept:
    update tx: categoryId = draft.newCategoryId, vendorId = draft.newVendorId or keep,
               categorisedAt = now
    write CategorisationEvent {
      source: AI_APPLIED, acceptedAiSuggestion: true,
      old/newCategoryId, old/newVendorId, reasoning: draft.reasoning,
    }

  edit:
    update tx: categoryId = decision.chosenCategoryId, vendorId = decision.chosenVendorId,
               categorisedAt = now
    write CategorisationEvent {
      source: AI_APPLIED, acceptedAiSuggestion: false,
      old/newCategoryId, old/newVendorId, reasoning: draft.reasoning,
    }

  reject:
    no tx update
    write CategorisationEvent {
      source: AI_REJECTED,
      newCategoryId: draft.newCategoryId, reasoning: draft.reasoning,
    }
```

### Bulk

`bulkSuggest(query)` accepts the same filter shape as the rule engine (`accountIds[]`, `dateFrom`, `dateTo`, `scope: 'uncategorised'|'all'`), enumerates matching transactions, dispatches `suggest(id, { force: false })` through `pLimit(5)`. Returns `{ runId, totalQueued }`. Status polled via `/ai/bulk-suggest/:runId/status`. Cancellable via `/ai/bulk-suggest/:runId/cancel`. The `runId` map is in-memory backend state (no new DB table); the per-transaction events are the durable record.

### Endpoints

```
POST /ai/suggest-category               body: { transactionId, force?: boolean }     -> SuggestResult
POST /ai/apply                          body: { transactionId, decision }             -> 204
POST /ai/bulk-suggest                   body: filter                                  -> { runId, totalQueued }
GET  /ai/bulk-suggest/:runId/status                                                   -> { done, ok, cached, failed }
POST /ai/bulk-suggest/:runId/cancel                                                   -> 204
GET  /ai/review-queue                                                                 -> list of unresolved AI_DRAFTs (cap 500)
POST /ai/mine-rules                                                                   -> { drafted: number }
PATCH /ai-providers/:id/move            body: { direction: 'up'|'down' }              -> updated row
```

---

## 5. UI — category suggestions (entry points A, B, D)

### A. Inline AI banner in the transaction edit modal

Banner slot lives between the read-only block and the editable block of the existing `transaction-edit-modal.tsx`.

States:

| State | Trigger | Look |
|---|---|---|
| Loading | Modal opens on uncategorised tx; suggest-category in flight | grey, spinner, "Asking AI…" |
| Suggestion | Response returned (fresh or cached) | bordered, colour by confidence (green=high / amber=med / slate=low); category + optional vendor + reasoning; `[Accept] [Edit] [Reject]` |
| Already-categorised, idle | Modal opens on categorised tx | banner hidden; inline link below Category: "Ask AI for a different opinion" |
| No providers | API: `{ ok:false, error:'no-providers' }` | thin amber: "AI is not configured. [Set up providers]" → `/settings/ai-setup` |
| Chain exhausted | API: `{ ok:false, error:'chain-exhausted' }` + lastError | red banner with verbatim provider error; `[Retry]` re-fires with `force:true` |
| Applied / rejected | After button click | accept/reject closes banner (accept/reject closes modal); edit collapses banner to thin reminder |

Three-button behaviour:

- **Accept** — `POST /ai/apply { action: 'accept' }`; modal closes on success.
- **Edit** — banner shrinks to one-line reminder; Category select pre-fills with AI's pick; modal Save now routes through `POST /ai/apply { ... }` with the decision computed *at Save time*: if final `(chosenCategoryId, chosenVendorId)` equals the AI draft's pick, send `{ action: 'accept' }`; otherwise `{ action: 'edit', chosenCategoryId, chosenVendorId }`. (This means clicking Edit then Saving without modifying anything still records `AI_APPLIED accepted=true`, not a false negative.) Cancelling the modal after Edit writes no further event; the AI_DRAFT remains unresolved (cached on next open within 24h).
- **Reject** — `POST /ai/apply { action: 'reject' }`; banner hides; modal stays open in normal manual-edit mode. Subsequent Save writes a normal `USER` event.

**"Ask AI for a different opinion" link** appears under the Category select for already-categorised transactions. Click → `force: true` request. If user accepts and AI's pick equals existing category, AI_APPLIED is still written with `acceptedAiSuggestion: true` and `oldCategoryId === newCategoryId` (re-validation signal).

**Implicit edit:** if the user changes the Category select while the banner is in Suggestion state without clicking Accept/Edit/Reject, the banner transparently switches to Edit mode (shrinks). Save then follows the same accept-vs-edit comparison described above. We never silently drop an AI_DRAFT — every modal session that received a suggestion ends with one of: AI_APPLIED(accept), AI_APPLIED(edit), AI_REJECTED, or unresolved + modal cancelled (no further event).

### B. Bulk "Categorise with AI" on `/transactions`

Table bulk-actions menu gains "Categorise with AI". Click → `<BulkAiCategoriseDialog>` with filter fields mirroring the existing rule-engine recategorise dialog: accounts multi-select, date range, scope (`uncategorised` default | `all`), summary "X transactions match", note "~X transactions × 1 AI call each" (no token estimate — we don't have one).

On Start: `POST /ai/bulk-suggest` → backend assigns `runId`, returns `{ runId, totalQueued }`. Dialog polls `/ai/bulk-suggest/:runId/status` every 1s for `{ done, ok, cached, failed }`. When `done === totalQueued`: summary + `[Review now]` button → `/transactions/ai-review?runId=<id>`. Closing the dialog mid-run calls `/ai/bulk-suggest/:runId/cancel`.

### D. AI Review queue page — `/transactions/ai-review`

New page listing transactions with unresolved `AI_DRAFT` (no subsequent AI_APPLIED / AI_REJECTED). Loaded via `GET /ai/review-queue` (cap 500). Per-row UI shows transaction header, suggestion banner with category + vendor + confidence + reasoning, and inline `[Accept] [Edit] [Reject]`.

- **Accept** — immediate apply(accept); row fades; count decrements.
- **Edit** — opens the standard `<TransactionEditModal>` in Edit mode (banner pre-shrunk, Category select pre-filled with AI's pick). The same `apply(edit)` flow on Save. Reuses the modal — the queue has no bespoke form.
- **Reject** — immediate apply(reject); row fades.

Toolbar batch action: `[Approve all "high" ▼]` — confirmation dialog, then `apply(accept)` over every visible row with `confidence === 'high'`. No "Approve all" without confidence filter.

Client-side filters: account, confidence, date range, sort. Empty state copy: "Nothing for AI to review. Categorise some transactions with rules and try the bulk action on `/transactions`."

---

## 6. AI-drafted rules — `AiRuleDrafter`

Two halves: deterministic clustering finds candidates; one LLM call per surviving candidate writes a clean rule.

### Phase 1 — clustering (no LLM)

Input events:
```ts
{
  OR: [{ source: 'USER' }, { source: 'AI_APPLIED', acceptedAiSuggestion: true }],
  createdAt: { gt: now - 180 days },
  newCategoryId: { not: null },
}
// cap at 5000 rows
```

`clusterKey(description: string)` normalisation:
1. Uppercase, collapse whitespace.
2. Strip trailing digits / locations (e.g. "COLES 1234 SUBIACO" → "COLES").
3. Take first 2 alphabetic tokens, joined by space.
4. Returns null if the normalised key is < 3 chars.

Group events by `(clusterKey, newCategoryId)`. A cluster qualifies if:
```
cluster.size >= preferences.aiMiningThreshold          // M=5 default
AND
cluster.size / total_events_with_same_clusterKey >= 0.8   // 80% agreement
```

The agreement check kills clusters where the user has been inconsistent (e.g. AMAZON sometimes Office Supplies, sometimes Software).

`clusterHash` derivation:
```ts
clusterHash = sha256(`${clusterKey}|${newCategoryId}`).slice(0, 16);
```
Keyed on `(clusterKey, categoryId)` only — not the operator or conditions. If the LLM polish rewrites the same intent two months later as `STARTS_WITH` instead of `CONTAINS`, suppression still catches it.

Suppression: drop any cluster whose `clusterHash` already exists on a Rule with `state IN (AI_DRAFTED, APPROVED, DENIED)`. USER rules are not in the suppression set, but they self-suppress because rule-matched transactions write `source=RULE` (not `USER`/`AI_APPLIED`) and are excluded from the input set.

### Phase 2 — LLM polish (one call per surviving cluster)

System prompt (excerpt):
```
You are a bookkeeping assistant. The user wants you to write a categorisation
rule that captures a pattern in their history.

A rule has:
  - name (<= 60 chars)
  - one outcome category
  - 1-3 conditions, AND-only, each: { field, operator, value } from these enums:
      field: DESCRIPTION | AMOUNT | VENDOR | ACCOUNT
      operator: CONTAINS | EQUALS | STARTS_WITH | ENDS_WITH | GT | LT | BETWEEN | IN

Prefer the simplest rule that matches. Use DESCRIPTION CONTAINS most often.
Reach for STARTS_WITH only when descriptions share a clear prefix.
Use AMOUNT GT/LT/BETWEEN only when the pattern is amount-bounded.
Never use VENDOR field unless the matched vendor name is identical across all examples.

Output strict JSON matching the schema.
```

User prompt: `CLUSTER: { category, event count } / SAMPLE DESCRIPTIONS: { up to 10 lines } / Propose a rule.`

Response schema:
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["name", "conditions", "reasoning"],
  "properties": {
    "name":     { "type": "string", "maxLength": 60 },
    "conditions": {
      "type": "array", "minItems": 1, "maxItems": 3,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["field", "operator", "value"],
        "properties": {
          "field":    { "enum": ["DESCRIPTION", "AMOUNT", "VENDOR", "ACCOUNT"] },
          "operator": { "enum": ["CONTAINS", "EQUALS", "STARTS_WITH", "ENDS_WITH", "GT", "LT", "BETWEEN", "IN"] },
          "value":    { "type": "string" },
          "value2":   { "type": ["string", "null"] }
        }
      }
    },
    "reasoning": { "type": "string", "maxLength": 200 }
  }
}
```

Post-validation:
- `name` non-empty after trim, else fall back to `"<Category> from <clusterKey>"`.
- All conditions reference valid enum values, else discard this draft.
- For `BETWEEN`: `value2` must be set, else discard.
- For `IN`: schema uses single `value` — split on comma at parse into `valueList` for the Prisma write.

Persistence:
```ts
const rule = await tx.rule.create({
  data: {
    name: validated.name,
    state: 'AI_DRAFTED',
    isActive: false,             // drafts never fire
    priority: 1000,
    categoryId: cluster.newCategoryId,
    clusterHash: cluster.hash,
    noteOnApply: null,
    conditions: { create: validated.conditions.map((c, i) => ({ ...c, position: i })) },
  },
});

await tx.aiCall.update({ where: { id: callId }, data: { ruleId: rule.id } });
```

### Trigger UI (T-A)

`/rules` toolbar gains `[Find candidates from history]` next to `[Test rules]` / `[New rule]`. Click → `POST /ai/mine-rules` → spinner toast → `router.refresh()` → AI Drafts tab badge increments.

A subsequent run within minutes (no new user events) produces zero candidates because all clusters are suppressed — no LLM calls, near-instant response. Self-throttling.

### AI Drafts tab — row UI

Each AI_DRAFTED row shows the rule name, condition summary, AI's reasoning, and inline `[Approve] [Modify] [Deny]`:

- **Approve** — `PATCH /rules/:id/state` body `{ state: 'APPROVED' }`. Server sets `state=APPROVED, isActive=true` in one transaction. Rule joins active set.
- **Modify** — routes to `/rules/:id/edit` (existing editor) preloaded with the draft's name/conditions. Saving from the editor transitions `state=APPROVED, isActive=true` regardless of whether the user changed anything (Save = ratification). `clusterHash` stays attached.
- **Deny** — `PATCH /rules/:id/state` body `{ state: 'DENIED' }`. Server sets `state=DENIED, isActive=false`. Row moves to Denied tab. `clusterHash` stays attached so the same intent won't be re-mined.

Toolbar batch action: `[Approve all]` appears when ≥ 2 drafts. Confirmation dialog → APPROVED + isActive=true for each in one server call.

No edit-in-place on AI Draft rows — Modify is the explicit ratification path.

---

## 7. CategorisationEvent history drawer

The smallest feature. Pure read of `/categorisation-events?transactionId=:id&limit=50` (endpoint already exists).

Entry point: small icon button in the transaction edit modal header next to the title, labelled `[⏱ History (N)]` where N is the joined event count.

Drawer is right-side; uses existing `Sheet` primitive or fixed-position panel with the same `rounded-lg` chrome as the modal.

Per row: badge (colour by source), relative timestamp, change lines (`old → new` arrows where they differ; omit lines where both are null), italic reasoning block when non-null. `source=RULE` rows show a chip with the rule name, clickable to `/rules/:id/edit`.

Badge colours:

| source | badge |
|---|---|
| USER | slate |
| RULE | indigo |
| VENDOR_MATCH | violet |
| AI_DRAFT | grey-amber |
| AI_APPLIED (accepted=true) | green |
| AI_APPLIED (accepted=false) | amber |
| AI_REJECTED | red-orange |

Empty state: "No history yet. This transaction hasn't been touched by anything but its CSV import."

Drawer is read-only — no actions. Name/vendor display values are computed client-side from props (categories + vendors already loaded by the parent modal). No new backend joins.

---

## 8. Settings, env vars, docs, testing

### `/settings/ai-setup` additions

Per backup card — `[↑]` and `[↓]` arrows alongside existing actions. `PATCH /ai-providers/:id/move` swaps `sortOrder` with the immediate non-primary neighbour. Primary card has no arrows (Make Primary is the existing path).

New bottom section "Rule drafting":
```
Minimum cluster size to draft a rule
[  5  ]   transactions must agree before AI proposes a rule (1-50)
[Save]
```
Reads/writes `Preferences.aiMiningThreshold` via the existing preferences endpoints (extend the DTO).

### Env vars — additions to `.env.example`

```
# Phase C — AI runtime
AI_TIMEOUT_INLINE_MS=20000
AI_TIMEOUT_BULK_MS=60000
AI_BULK_CONCURRENCY=5
```

All three optional with hard-coded defaults. None required for boot. No new secret-key env vars; provider keys remain in the `AiProvider` table (matches existing SMTP/Telegram precedent).

### Docs to update post-merge

| Doc | Update |
|---|---|
| `CLAUDE.md` | Phase C overview; gotchas (AiCall grows unbounded — future retention; clusterHash suppression semantics) |
| `Architecture.md` | New `ai` module endpoint summary; topology note about outbound HTTPS to providers |
| `DatabaseSchema.md` | New `AiCall` model; new columns on AiProvider/Rule/CategorisationEvent/Preferences; new enum values; mark Phase C as fully additive |
| `modules_and_logic.md` | New AI module section; transaction edit modal AI banner; `/transactions/ai-review` page; Rules AI Drafts actions; `/settings/ai-setup` upgrade from scaffolding |
| `DesignSystem.md` | New confidence banner colours and AI source badge swatches |
| `docs/user-guide-banking.md` | Replace "Phase C preview" §14 with shipped §15 "AI categorisation"; document three entry points + AI Drafts + history drawer |

### Testing

The repo has no test suite. Two narrow exceptions where tests pay back:

1. **`backend/src/ai/ai-client.service.spec.ts`** — table-driven tests of the chain decision logic against a mock fetch. Cases: 5xx fallback, 4xx no-fallback (inline path), 408/429 fallback, timeout fallback, JSON schema repair retry, all-providers-fail, no-providers, single-provider success. ~100 LOC.
2. **`backend/src/ai/ai-rule-drafter.service.spec.ts`** — table-driven cluster-detection tests on synthetic events. Asserts size + agreement filters and clusterHash determinism. No LLM dependence. ~80 LOC.

The LLM call paths themselves are tested by hand against a real provider in dev, matching the existing convention.

### Operational rollout

1. `prisma db push` (no `down -v` — additive only).
2. `docker compose build backend frontend && docker compose up -d`.
3. Configure ≥ 1 provider at `/settings/ai-setup` (without one, the inline banner shows "AI is not configured").
4. Optionally configure backups; `sortOrder` defaults to 1000, use up/down arrows to order.
5. Adjust `aiMiningThreshold` from the new settings section if 5 is too eager / too conservative.

---

## Appendix A — Endpoint summary (added by Phase C)

```
POST   /ai/suggest-category               { transactionId, force? }            -> SuggestResult
POST   /ai/apply                          { transactionId, decision }           -> 204
POST   /ai/bulk-suggest                   { filter }                            -> { runId, totalQueued }
GET    /ai/bulk-suggest/:runId/status                                            -> { done, ok, cached, failed }
POST   /ai/bulk-suggest/:runId/cancel                                            -> 204
GET    /ai/review-queue                                                          -> unresolved AI_DRAFT list (<=500)
POST   /ai/mine-rules                                                            -> { drafted: number }
PATCH  /ai-providers/:id/move             { direction: 'up' | 'down' }          -> updated row
```

(Existing endpoints unchanged: `/ai-providers/*` CRUD, `/categorisation-events`, `/rule-engine/*`, `/transactions/*`, `/rules/*`.)

## Appendix B — Event semantics summary

| Trigger | Transaction changed? | Event written |
|---|---|---|
| AI returns a suggestion | no | `AI_DRAFT` with `newCategoryId`, `newVendorId`, `reasoning` |
| User Accept | yes — to AI's picks | `AI_APPLIED` with `acceptedAiSuggestion=true`, old/new ids, reasoning |
| User Edit | yes — to user's picks | `AI_APPLIED` with `acceptedAiSuggestion=false`, old/new ids, reasoning |
| User Reject | no | `AI_REJECTED` with `newCategoryId` (rejected pick), reasoning |
| User cancels modal without acting | no | nothing (AI_DRAFT remains unresolved for next open within 24h) |
| User manually changes Category select then Saves while banner up | yes — to user's picks | `AI_APPLIED`. `acceptedAiSuggestion=true` if final values equal AI's pick, else `false`. |
| Rule engine fires | yes | `RULE` (unchanged from Phase B) |
| Vendor matcher fires | yes (vendor only) | `VENDOR_MATCH` (unchanged from Phase B) |
| User manually edits in modal with no AI involvement | yes | `USER` (unchanged from Phase B) |

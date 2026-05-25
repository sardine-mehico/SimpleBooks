# Category Subcategories + AI Provenance + AI Enable Toggle — Design

> **Status:** approved design, ready for plan
> **Date:** 2026-05-25
> **Author:** brainstormed with Claude
> **Predecessors:** Phase A (Banking import) · Phase B (Rules) · Phase C (AI categorisation) · AI provider self-pacing
> **Successor (planned next):** Parent-rollup reports — see §10.

## Goal

Four related improvements to the categorisation + AI configuration system:

1. **Subcategories.** Let users group related expenses under a parent ("Banking" → "Bank Fees", "International Fees", "Overdraft Fees", etc.). Reports roll up by parent (in the **next** phase — see §10). AI still suggests at the leaf level.
2. **AI provenance.** Every AI-categorised transaction records which provider produced the suggestion and when, surfaced inline next to the category on both the AI Suggest review queue and the transaction edit page.
3. **Inline category management.** An "Add Category" button on the AI Suggest page opens a shared modal that can add or edit any category or subcategory, so the user never has to leave the categorisation flow to extend the taxonomy.
4. **AI provider enable/disable toggle.** A switch on each provider card in `/settings/ai-setup` so users can keep an API key configured but pause that provider without deleting it. Disabled providers are skipped entirely by the chain — they don't even count as a failed attempt.

## Non-goals (v1)

- More than one level of nesting. "Banking" can have children but those children cannot themselves have children. If a real three-level use case appears later, generalise to a closure table then.
- Tagging or multi-axis classification. A transaction has exactly one category, as today.
- Bulk category seeding from existing transactions. The user has a separate plan to use Claude to mine 4000+ historical transactions for category suggestions; that work will use the same APIs this design exposes but is out of scope here.
- Migration of older `CategorisationEvent` rows with no `providerId`. Pre-existing events stay `NULL` (best-effort audit).
- Rules targeting parents. A rule's `categoryId` must point to a leaf, same constraint as a transaction's.

## Architecture

The data model is two columns added to existing tables. `Category` becomes self-referential via `parentId`; `CategorisationEvent` records `providerId` on AI-sourced events. No new tables, no new services, no destructive schema changes.

The leaf-only-for-transactions invariant lives in service-layer guards in `CategoriesService` and `TransactionsService` (not a DB trigger). A row is a "group" if it has at least one child; otherwise a "leaf." Validation rejects (a) assigning a group as a transaction's category and (b) converting a category into a parent while it still holds transactions — except via the migration helper described below.

The AI prompt sends leaves with parent breadcrumbs ("Banking > Bank Fees") so the LLM gets the semantic grouping for free. The response schema still requires `categoryId` (a leaf), which `AiCategoriserService` validates against the active-leaves set. No change to the JSON schema sent to providers.

Provenance is recorded by passing the resolved `providerId` from `AiClientService.complete()`'s result into the `CategorisationEvent.create()` call inside `AiCategoriserService` and `AiRuleDrafterService`. The provenance caption is a single join from `CategorisationEvent` to `AiProvider`.

The shared category modal is used by three surfaces: `/categories`, `/settings/ai-setup` (AI review queue), and `/categories/[id]/edit`. It encapsulates one `<CategoryFormDialog>` client component; its only inputs are the optional `initial` category (for edit mode) and an `onSaved` callback.

## Tech stack

No new dependencies. NestJS + Prisma backend, Next.js client. Same audit pattern as existing `CategorisationEvent` (append-only). Same dialog pattern as the existing Allocation modals.

---

## 1. Schema changes

All additive — survives `prisma db push --accept-data-loss` without `down -v`.

### `Category.parentId`

```prisma
model Category {
  id        String     @id @default(uuid())
  name      String
  kind      CategoryKind
  isActive  Boolean    @default(true)
  parentId  String?    // NEW — self-referential FK; null for top-level
  parent    Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id], onDelete: Restrict)
  children  Category[] @relation("CategoryHierarchy")
  // ... existing fields
}
```

- `onDelete: Restrict` on the parent side — must delete or reparent children before removing a parent. Prevents accidental orphans.
- Children inherit `kind` from the parent (validation enforces match on insert/update). UI hides the kind field when creating a subcategory.
- Name uniqueness is **scoped to siblings**, case-insensitive: a category name must be unique among rows that share the same `parentId` (including `parentId IS NULL` for top-level categories). This lets "Fees" exist as a child under both "Banking" and "Education" — they're meaningfully different and roll up to different totals in future reports. The existing global-uniqueness rule from commit `602aa83` is being relaxed by this change. Because names alone are now ambiguous, the AI prompt **must** send breadcrumbs (`"Banking > Fees"`) rather than bare names — already the planned design in §2, now load-bearing.

### `AiProvider.isEnabled`

```prisma
model AiProvider {
  // ... existing fields
  isEnabled Boolean @default(true)   // NEW — disabled providers are skipped by AiClientService
}
```

- Default `true` so existing rows stay active after the migration.
- A disabled provider is **invisible to the chain** — `AiClientService.complete()` filters `findMany({ where: { isEnabled: true }, ... })` so a disabled provider doesn't count as a failed attempt and doesn't show up in 429 backoff statistics.
- The provider's `isPrimary` flag is independent of `isEnabled`. If the only enabled provider is non-primary, the chain still works (it just uses the first enabled provider by the existing sort order). If **all** providers are disabled, `complete()` returns the existing `{ ok: false, error: 'no-providers' }` shape — same handling as an empty chain.
- The "Test" button on the provider card stays clickable when disabled (so users can verify the key before re-enabling).

### `CategorisationEvent.providerId`

```prisma
model CategorisationEvent {
  // ... existing fields
  providerId String?     // NEW
  provider   AiProvider? @relation(fields: [providerId], references: [id], onDelete: SetNull)
}
```

- Nullable. Set on `AI_DRAFT`, `AI_APPLIED` (when sourced from AI), `AI_REJECTED`. Null on `USER`, `RULE`, `IMPORT`.
- `onDelete: SetNull` — deleting a provider preserves the audit row but loses the link. Acceptable: the event still records `source = AI_*` and a timestamp, just without the specific provider name.
- No backfill. Old AI events stay null. The UI shows `Suggested by AI on <date>` (no provider name) when null.

### Service-layer invariants

- `TransactionsService.update()` rejects `categoryId` whose row has `children.count > 0`. Error: `Cannot assign transactions to a parent category. Pick a subcategory.`
- `CategoriesService.delete()` rejects deletion when `children.count > 0`. Error: `Delete or reparent subcategories first.`
- `CategoriesService.update()` rejects setting `parentId` (turning a leaf into a child) when the moving row itself has children, until those children are reparented. Two-level cap.
- New endpoint `POST /categories/:id/split` — the "convert leaf to group" helper described in §4. Idempotent.

---

## 2. AI behaviour

The prompt builder (`buildCategoriseUserPrompt`) renders each leaf as `"<parent name> > <leaf name>"` for grouped leaves and `"<leaf name>"` for ungrouped ones. The JSON schema still requires `categoryId` (the leaf's UUID), so the LLM can't return a parent even if it wanted to.

`AiCategoriserService` already validates `categoryId` against the active set; that check now naturally rejects parent IDs because parents are filtered out of `loadCategoriesForPrompt()` (only `children.count == 0` and `isActive` rows are sent).

`AiRuleDrafterService` follows the same rule: clusters mine to a leaf, never a parent.

When the user accepts/edits an AI draft, `CategorisationEvent.providerId` is set to the `providerId` returned by `AiClientService.complete()` so the audit trail captures which model made the call.

---

## 3. UI surfaces

### `/categories` (existing list page)

Re-renders as a 1-deep tree, sorted by parent name then child name:

```
Banking                          Group · 4 subcategories     [+ Sub]  [Edit]
  └ Bank Fees                    EXPENSE · 12 txns                    [Edit]  [Delete]
  └ International Fees           EXPENSE · 3 txns                     [Edit]  [Delete]
  └ Interest Charged             EXPENSE · 8 txns                     [Edit]  [Delete]
  └ Overdraft Fees               EXPENSE · 1 txn                      [Edit]  [Delete]
Office Supplies                  EXPENSE · 47 txns          [+ Sub]  [Edit]  [Delete]
...
```

- Parent rows show child count and an inline `[+ Sub]` button that opens the modal pre-filled with "Subcategory under [parent name]".
- Leaf rows show their kind + transaction count. `[+ Sub]` on a leaf converts it via the split flow (see §4).
- No drag-handle reordering in v1. Default sort is alphabetical within each level (matches existing behaviour).

### AI Suggest page — `/transactions/ai-review`

Top-right of the page header gains a `[+ Add Category]` button (same `lucide-react` Plus icon, same outline-button styling as other page-header actions in this codebase). Opens the shared modal.

Each row in the review queue now shows a small caption under the suggestion:

```
Suggested by Google Gemini · 25 May 2026, 5:32 PM
```

Pulled from `CategorisationEvent` joined to `AiProvider` (one extra include in `listReviewQueue()`). When `providerId` is null, falls back to `Suggested by AI · <date/time>`.

### Transaction edit page — `/transactions/[id]`

A single-line caption appears directly under the Category dropdown, derived from the most recent `AI_APPLIED` or `USER` event for the transaction (already an existing concept — `categorisedAt`). One of:

- `Categorised by AI (Google Gemini) on 25 May 2026, 5:32 PM`
- `Categorised by user on 24 May 2026, 9:14 AM`
- `Categorised by rule "Coles → Groceries" on 23 May 2026`
- `Not yet categorised` (when `categoryId` is null)

Loaded server-side from a single Prisma query at page render.

### `/settings/ai-setup` — enable/disable toggle

Each provider card gains a small switch in the card header, to the left of the existing PRIMARY / Set Primary controls:

```
[●] Enabled    Google Gemini - officecleaners2009   [PRIMARY]   [🗑]
```

- A simple shadcn-style switch component (or the existing `<Switch>` if present; otherwise a tiny inline button toggle to match the rest of the form's minimal styling). When off, the rest of the card dims to `opacity-60` and the "Save" button label changes to "Save (disabled)" — but the card is still fully editable so users can update keys/RPM while paused.
- Toggling fires `PATCH /ai-providers/:id` with `{ isEnabled: false }` immediately (no need to click Save) — same pattern as the existing "Set Primary" link.
- The badge `Disabled` (slate-300 background, slate-700 text) appears next to the name when off.
- The categories list and AI Suggest page do not need to know about this flag — they hit the AI endpoints which already filter through `AiClientService`.

### Shared `<CategoryFormDialog>` component

Lives at `frontend/components/categories/category-form-dialog.tsx`. Used by the categories list page and the AI Suggest page. Two modes:

- **Create top-level**: Name + Kind (EXPENSE / INCOME) + Active toggle.
- **Create subcategory**: Name + Active toggle (kind inherited from parent, shown as read-only). A `Parent` dropdown lets the user reassign, defaulted from the trigger context.
- **Edit**: same fields populated from the existing row. If the row is a parent, editing the kind is disabled (would orphan children semantics).

Save calls `POST /categories` (create) or `PATCH /categories/:id` (edit), then closes and triggers `router.refresh()` on the calling page.

---

## 4. Migration: converting a leaf to a parent

The "auto-create a 'General' child on first split" flow:

1. User clicks `[+ Sub]` on an existing leaf (say "Banking" with 47 transactions) in the categories list.
2. Frontend calls `POST /categories/:id/split` first.
3. Backend, in a single transaction:
   - Creates a new child `Banking (general)` with the same kind, the parent's `isActive`, and `parentId = banking.id`.
   - Updates all transactions where `categoryId = banking.id` to point at the new "Banking (general)" child.
   - Returns the new child row.
4. Frontend then opens the modal pre-filled to add the *actual* subcategory the user wanted (`Bank Fees`, etc.).
5. The user can later rename or delete "Banking (general)" once they've reassigned its transactions to more specific subcategories.

The endpoint is idempotent: if the category already has children (i.e. is already a group), `POST /split` is a no-op that returns 200 with the existing row. The frontend only calls split when the row is a leaf with `transactionCount > 0`; for leaves with zero transactions, it skips the split and goes straight to the modal (no auto-child needed).

The "(general)" suffix is localised in code but not currently translatable — single-locale app for now.

---

## 5. Reports & rollups (out of scope for v1, but design-aware)

The existing reports module (Profit & Loss, category-grouped lists) reads `Transaction.categoryId` directly. After this change, those reports keep working because all transactions still point at leaves. To show parent-grouped subtotals later, the reports query joins `Category → parent` and `GROUP BY COALESCE(parentId, id)`. **Not implemented in v1** — call out in the docs as the future improvement so it doesn't get forgotten.

---

## 6. API surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/categories` | Existing. Response gains `parentId`, `children: [{id, name, isActive, transactionCount}]`, `transactionCount`. |
| POST | `/categories` | Existing. Body gains optional `parentId`. Validates kind matches parent's kind when set. |
| PATCH | `/categories/:id` | Existing. Body gains optional `parentId`. Service guards leaf-with-transactions reparent. |
| DELETE | `/categories/:id` | Existing. Rejects if `children.count > 0`. |
| POST | `/categories/:id/split` | **NEW.** Idempotent. Creates "(general)" child if needed and migrates transactions. |
| GET | `/ai/review-queue` | Existing. Each row gains `providerId`, `providerName`. |
| GET | `/transactions/:id` | Existing. Gains `categorisationProvenance: { source, providerName?, ruleName?, at }` derived from latest event. |
| PATCH | `/ai-providers/:id` | Existing. Body gains optional `isEnabled: boolean`. |
| GET | `/ai-providers` | Existing. Response gains `isEnabled`. |

DTOs updated:
- `CreateCategoryDto` / `UpdateCategoryDto` get optional `parentId: string | null` plus validation that parent's `kind` matches child's `kind` when set.
- `UpdateAiProviderDto` gets optional `isEnabled: boolean`.

---

## 7. Testing

- `categories.service.spec` — guard tests: rejects assigning group as txn category, rejects deleting parent with children, rejects two-level nesting, kind-mismatch on subcategory, sibling-name uniqueness (case-insensitive) but allows the same name under different parents.
- `categories.service.spec` — `split()` test: idempotent on group; correctly moves transactions and creates "(general)" child for leaf.
- `ai-categoriser.service.spec` — prompt sends breadcrumbs, no parent IDs in active set, `providerId` recorded on draft events.
- `ai-client.service.spec` — gains: disabled providers are excluded from the chain entirely (don't fire, don't appear as failed attempts). Existing 429/backoff tests remain unchanged.

Frontend tests are minimal (no test suite today); manual verification per the existing pattern.

---

## 8. Open questions resolved

- **Parents holding transactions?** No (option A — pure grouping).
- **Migration on first split?** Auto-create "(general)" child (option ii).
- **Three-level nesting?** No — single `parentId` cap, generalise later if needed.
- **AI prompt format?** Breadcrumbs ("Banking > Bank Fees"), leaves only.
- **Provenance audit table or column?** Column on existing `CategorisationEvent`.
- **Provenance UI placement?** Caption under category dropdown on transaction edit; caption under suggestion on AI review queue.
- **Rules targeting parents?** No — same leaf-only constraint as transactions.
- **Name uniqueness — global or per-parent?** Per-parent (sibling-scoped). "Fees" can exist under both "Banking" and "Education" because they represent different real-world things.
- **Disabled provider behaviour?** Filtered out at `AiClientService.complete()`'s `findMany`. Card stays editable so users can update keys while paused.

---

## 9. Acceptance criteria

A successful v1 ships when:

1. `/categories` lists categories in a 1-deep tree with `[+ Sub]` per parent.
2. Clicking `[+ Sub]` on a leaf with transactions auto-creates "(general)", reassigns transactions, and opens the modal for the real subcategory.
3. Trying to assign a parent category to a transaction (via UI or API) returns a 400.
4. AI categorisation prompts include parent breadcrumbs in the leaf names. AI never returns a parent's UUID.
5. Every AI-applied categorisation records `CategorisationEvent.providerId`. The provenance caption appears on the transaction edit page and AI review queue.
6. The `[+ Add Category]` button on AI review queue opens the shared modal; saving a new category makes it immediately available in the next AI suggestion's chosen category dropdown.
7. The enable/disable switch on a provider card immediately toggles its participation in the chain. A categorisation attempt with the only enabled provider disabled returns the "no providers" error and does not appear in `AiCall` logs.
8. Tests at §7 all pass.
9. CLAUDE.md, modules_and_logic.md, DatabaseSchema.md, Architecture.md updated.

---

## 10. Next planned phase — Parent-rollup reports

Immediately after this spec ships, the follow-up brainstorm covers parent-rollup reports. Scope sketch (to be expanded into its own design doc):

- **What changes:** The Profit & Loss view, the Categories report, and the dashboard "spend by category" tile all start showing parent subtotals with indented child rows. Drilldown / collapse on the parent.
- **What doesn't change:** No schema change. The data is already there — `Category.parentId` is the join. A single SQL change per report query: `GROUP BY COALESCE(c.parentId, c.id), c.id` and post-process into a tree.
- **UX:** Existing report tables get a small chevron column on parent rows. Default state is expanded. Saved view preference persists per user (Preferences row already exists).
- **Goal:** `P&L for May 2026` shows `Banking $234.50` as a rolled-up subtotal with `Bank Fees`, `Overdraft Fees`, etc. nested underneath, summing correctly.
- **Open questions for that spec:** Should the dashboard show parents only (collapsed), or always expanded? Should CSV export be flat (leaves only) or include subtotal rows? Print/PDF behaviour?

Tracked in this doc only as a forward reference — the actual design lives in a separate spec written next.

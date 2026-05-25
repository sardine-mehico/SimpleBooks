# Category Subcategories + AI Provenance + AI Enable Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-level subcategories with shared inline edit modal, record AI provenance on every AI categorisation, and add an enable/disable switch per AI provider — without losing any existing data (especially AI provider rows).

**Architecture:** Three additive nullable/defaulted schema columns (`Category.parentId`, `CategorisationEvent.providerId`, `AiProvider.isEnabled`); the global `@unique` on `Category.name` is replaced by service-layer sibling-scoped case-insensitive uniqueness (mirrors the existing `AccountsService.assertNameAvailable` pattern from commit `602aa83`). Service guards enforce the leaf-only-for-transactions invariant. The AI prompt sends parent breadcrumbs ("Banking > Bank Fees") so the LLM never sees parent UUIDs. A shared `<CategoryFormDialog>` is reused by `/categories`, `/transactions/ai-review`, and `/categories/[id]/edit`. The enable/disable switch fires `PATCH /ai-providers/:id` immediately; `AiClientService.complete()` filters `where: { isEnabled: true }` so disabled providers are invisible to the chain.

**Tech Stack:** NestJS 10 + Prisma 5 + Postgres, Next.js 15 (App Router, React 19, server components → client components), `class-validator` DTOs, Jest for backend specs, Playwright MCP for frontend verification (no frontend test suite by project convention).

**Spec:** `docs/superpowers/specs/2026-05-25-category-subcategories-and-ai-provenance-design.md`

---

## File map

**Backend — create**
- `backend/src/categories/categories.service.spec.ts` — new test file (no existing tests)

**Backend — modify**
- `backend/prisma/schema.prisma` — three column additions
- `backend/src/categories/dto.ts` — `parentId` on Create/Update DTOs
- `backend/src/categories/categories.service.ts` — guards, sibling name check, `split()` method, list shape change
- `backend/src/categories/categories.controller.ts` — new `POST /:id/split` route
- `backend/src/transactions/transactions.service.ts` — reject parent categoryId on update, attach `categorisationProvenance` on findOne
- `backend/src/ai-providers/dto.ts` — `isEnabled` on Update DTO
- `backend/src/ai/ai-client.service.ts` — filter `where: { isEnabled: true }`
- `backend/src/ai/ai-client.service.spec.ts` — disabled-provider test, update fixture
- `backend/src/ai/ai-categoriser.service.ts` — pass `providerId` into event create, breadcrumbs in prompt
- `backend/src/ai/prompts/categorise.ts` — breadcrumb format
- `backend/src/ai/ai-categoriser.service.spec.ts` (existing or new) — breadcrumb test, providerId test

**Frontend — create**
- `frontend/components/categories/category-form-dialog.tsx` — shared modal

**Frontend — modify**
- `frontend/lib/types.ts` — add `parentId`, `isEnabled`, `categorisationProvenance` shapes
- `frontend/lib/ai-providers.ts` — accept `isEnabled` in update
- `frontend/lib/categories.ts` (or wherever the CRUD client lives — confirm during Task 11) — add `parentId` to create/update, add `splitCategory()`
- `frontend/components/settings/ai-setup-page.tsx` — enable toggle UI
- `frontend/components/categories/categories-list.tsx` — tree rendering
- `frontend/components/categories/category-form.tsx` — surface `parentId` (used by /categories/[id]/edit page; reuses dialog content)
- `frontend/components/transactions/ai-review-list.tsx` — `[+ Add Category]` button + provenance caption per row
- `frontend/components/transactions/transaction-edit-modal.tsx` (or transaction edit page — confirm during Task 16) — provenance caption under category dropdown

**Docs — modify**
- `CLAUDE.md`, `Architecture.md`, `DatabaseSchema.md`, `modules_and_logic.md`

---

# Phase 1: Schema migration (additive, non-destructive)

Goal: get the new columns into the DB without losing any existing row. Provider rows must persist.

### Task 1: Add three additive columns + replace global `Category.name` uniqueness

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Edit `Category` model — add `parentId`, remove global `@unique` from `name`**

Locate the `Category` model (currently at lines 529-541) and update to:

```prisma
model Category {
  id        String       @id @default(uuid())
  name      String       // was @unique — replaced by service-layer sibling-scoped check
  kind      CategoryKind
  isActive  Boolean      @default(true)
  sortOrder Int          @default(100)
  parentId  String?      // NEW — self-referential FK; null for top-level
  parent    Category?    @relation("CategoryHierarchy", fields: [parentId], references: [id], onDelete: Restrict)
  children  Category[]   @relation("CategoryHierarchy")
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  transactions      Transaction[]
  transactionSplits TransactionSplit[]
  rules             Rule[]

  @@index([parentId])
}
```

- [ ] **Step 2: Edit `CategorisationEvent` model — add `providerId`**

Locate the model (around line 635 in `schema.prisma`) and add:

```prisma
model CategorisationEvent {
  // ... existing fields preserved exactly ...
  providerId String?
  provider   AiProvider? @relation(fields: [providerId], references: [id], onDelete: SetNull)

  // ... existing indexes preserved exactly ...
  @@index([providerId])
}
```

- [ ] **Step 3: Edit `AiProvider` model — add `isEnabled`**

Locate the model (currently at lines 621-633) and add the field directly after `requestsPerMinute`:

```prisma
isEnabled Boolean @default(true)
```

And add the back-relation for `CategorisationEvent` so the FK from Step 2 works. Inside `AiProvider`:

```prisma
events CategorisationEvent[]
```

- [ ] **Step 4: Snapshot existing AiProvider rows before migration**

```bash
docker exec simplebooks-postgres-1 pg_dump -U accounting -d accounting --table='"AiProvider"' --data-only --column-inserts > /tmp/ai-providers-snapshot.sql
wc -l /tmp/ai-providers-snapshot.sql
```

Expected: a small SQL file containing INSERT statements for all current providers.

- [ ] **Step 5: Rebuild backend + apply schema**

```bash
docker compose build backend
docker compose up -d backend
docker logs simplebooks-backend-1 --tail 30
```

Expected: log contains `[entrypoint] pushing prisma schema` followed by `Nest application successfully started`. No `db push` error lines.

- [ ] **Step 6: Verify columns added AND no rows lost**

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c "\d \"Category\"" | grep -E "parentId|name"
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c "\d \"AiProvider\"" | grep "isEnabled"
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c "\d \"CategorisationEvent\"" | grep "providerId"
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c "SELECT COUNT(*) AS providers, COUNT(*) FILTER (WHERE \"isEnabled\") AS enabled FROM \"AiProvider\";"
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c "SELECT id, name, model, \"isEnabled\", \"requestsPerMinute\" FROM \"AiProvider\";"
```

Expected: three columns present; provider count matches the pre-migration count (3 rows for this dev DB), all rows show `isEnabled = t`, the Gemini/llm7/Ollama names are intact.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(schema): subcategories, AI provenance FK, AI provider enable flag

Additive: Category.parentId (self-FK, ON DELETE RESTRICT),
CategorisationEvent.providerId (nullable, ON DELETE SET NULL),
AiProvider.isEnabled (default true). Global @unique on Category.name
removed and replaced by service-layer sibling-scoped check (mirrors
Account pattern from 602aa83). All existing rows preserved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 2: AI provider enable/disable toggle

Goal: a provider can be paused without being deleted. The chain skips disabled providers entirely.

### Task 2: Backend — filter chain by `isEnabled`, accept it in DTO

**Files:**
- Modify: `backend/src/ai-providers/dto.ts`
- Modify: `backend/src/ai/ai-client.service.ts:28-31`
- Modify: `backend/src/ai/ai-client.service.spec.ts`

- [ ] **Step 1: Add `isEnabled` to `UpdateAiProviderDto`**

Open `backend/src/ai-providers/dto.ts`. After the existing `@IsInt() @IsOptional() @Min(1) @Max(10000) requestsPerMinute?: number;` line inside `UpdateAiProviderDto`, add:

```typescript
@IsBoolean() @IsOptional() isEnabled?: boolean;
```

(`IsBoolean` is already imported at the top of the file.)

- [ ] **Step 2: Write failing spec — disabled provider is skipped entirely**

Open `backend/src/ai/ai-client.service.spec.ts`. Locate the existing `providers` fixture (around line 41). Append a new test after the existing "falls through on 408 timeout and 429 rate limit" block:

```typescript
  it('skips disabled providers entirely — they do not appear in AiCall logs', async () => {
    const fixture = [
      { ...providers[0], isEnabled: false },  // primary, but DISABLED
      providers[1],                            // backup, enabled
      providers[2],
    ];
    const prisma = makePrisma(fixture);
    // findMany should be called with where: { isEnabled: true }, so the test
    // verifies the chain only fetches enabled rows.
    prisma.aiProvider.findMany = jest.fn().mockResolvedValue([fixture[1], fixture[2]]);

    const fetch = mockFetch([{ status: 200, body: makeOkBody({}) }]);
    const r = await new AiClientService(prisma, fetch as any).complete(makeInput());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.providerId).toBe('p2');  // p1 was disabled
    expect(prisma.aiProvider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isEnabled: true } })
    );
    expect(prisma._aiCalls).toHaveLength(1);
    expect(prisma._aiCalls[0].providerId).toBe('p2');
  });
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
docker exec simplebooks-backend-1 npx jest src/ai/ai-client.service.spec.ts -t "skips disabled" --colors=false
```

Expected: FAIL — `findMany was called with ...` mismatch because the current implementation doesn't pass `where: { isEnabled: true }`.

- [ ] **Step 4: Add `where: { isEnabled: true }` to the provider lookup**

In `backend/src/ai/ai-client.service.ts`, find the `complete()` method (line 27) and change:

```typescript
const chain = await this.prisma.aiProvider.findMany({
  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
});
```

to:

```typescript
const chain = await this.prisma.aiProvider.findMany({
  where: { isEnabled: true },
  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
});
```

- [ ] **Step 5: Run all `ai-client.service.spec.ts` tests**

```bash
docker exec simplebooks-backend-1 npx jest src/ai/ai-client.service.spec.ts --colors=false
```

Expected: all 12 tests pass (11 existing + 1 new).

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai-providers/dto.ts backend/src/ai/ai-client.service.ts backend/src/ai/ai-client.service.spec.ts
git commit -m "feat(ai): isEnabled flag filters providers out of chain

Disabled providers don't fire, don't count as failed attempts, don't
appear in AiCall logs. UpdateAiProviderDto accepts the toggle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3: Frontend — surface `isEnabled` in types + lib

**Files:**
- Modify: `frontend/lib/types.ts:590-601`
- Modify: `frontend/lib/ai-providers.ts:7`

- [ ] **Step 1: Add `isEnabled: boolean` to `AiProvider` type**

In `frontend/lib/types.ts`, update the `AiProvider` type to add `isEnabled` right after `requestsPerMinute`:

```typescript
export type AiProvider = {
  id: string;
  name: string;
  model: string;
  apiBaseUrl: string;
  apiKey: string;
  isPrimary: boolean;
  sortOrder: number;
  requestsPerMinute: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Add `isEnabled` to `updateAiProvider` signature**

In `frontend/lib/ai-providers.ts`, update the `updateAiProvider` export to:

```typescript
export const updateAiProvider = (id: string, data: Partial<{ name: string; model: string; apiBaseUrl: string; apiKey: string; requestsPerMinute: number; isEnabled: boolean }>) =>
  apiClient.patch<AiProvider>(`/ai-providers/${id}`, data);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/ai-providers.ts
git commit -m "feat(ai/frontend): wire isEnabled through types + client

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4: Frontend — toggle UI on each provider card

**Files:**
- Modify: `frontend/components/settings/ai-setup-page.tsx`

- [ ] **Step 1: Extend the `Draft` type and `toDraft` to track `isEnabled`**

In `frontend/components/settings/ai-setup-page.tsx`, update the `Draft` type:

```typescript
type Draft = {
  id: string;
  name: string;
  model: string;
  apiBaseUrl: string;
  apiKey: string;
  isPrimary: boolean;
  requestsPerMinute: number;
  isEnabled: boolean;
  dirty: boolean;
  isNew: boolean;
  showKey: boolean;
};
```

Update `toDraft`:

```typescript
function toDraft(p: AiProvider): Draft {
  return { id: p.id, name: p.name, model: p.model, apiBaseUrl: p.apiBaseUrl, apiKey: p.apiKey, isPrimary: p.isPrimary, requestsPerMinute: p.requestsPerMinute ?? 15, isEnabled: p.isEnabled ?? true, dirty: false, isNew: false, showKey: false };
}
```

Update `addNew()` so new drafts default to enabled:

```typescript
{ id: tempId, name: "New AI Configuration", model: "", apiBaseUrl: "https://api.openai.com/v1", apiKey: "", isPrimary: curr.length === 0, requestsPerMinute: 15, isEnabled: true, dirty: true, isNew: true, showKey: false },
```

- [ ] **Step 2: Add a `toggleEnabled` handler that PATCHes immediately**

Below the existing `makePrimary` function, add:

```typescript
async function toggleEnabled(d: Draft) {
  if (d.isNew) {
    // For unsaved cards, just flip local state — it'll be saved with the rest.
    setDrafts((curr) => curr.map((x) => (x.id === d.id ? { ...x, isEnabled: !x.isEnabled, dirty: true } : x)));
    return;
  }
  const next = !d.isEnabled;
  // Optimistic update.
  setDrafts((curr) => curr.map((x) => (x.id === d.id ? { ...x, isEnabled: next } : x)));
  try {
    await updateAiProvider(d.id, { isEnabled: next });
    router.refresh();
  } catch {
    // Revert on failure.
    setDrafts((curr) => curr.map((x) => (x.id === d.id ? { ...x, isEnabled: !next } : x)));
  }
}
```

- [ ] **Step 3: Render the toggle in each card header**

Locate the JSX block that renders the card header (around line 124 starting with `<div className="flex items-start justify-between gap-3">`). Inside the inner `<div className="flex items-center gap-3">`, immediately before the `<span className="font-semibold text-slate-900">{d.name || "(unnamed)"}</span>`, insert:

```jsx
<button
  type="button"
  onClick={() => toggleEnabled(d)}
  className={cn(
    "inline-flex h-5 w-9 items-center rounded-full transition",
    d.isEnabled ? "bg-indigo-600" : "bg-slate-300"
  )}
  aria-label={d.isEnabled ? "Disable" : "Enable"}
  title={d.isEnabled ? "Enabled — click to disable" : "Disabled — click to enable"}
>
  <span
    className={cn(
      "inline-block h-4 w-4 rounded-full bg-white shadow transition",
      d.isEnabled ? "translate-x-4" : "translate-x-1"
    )}
  />
</button>
```

(`cn` is already imported at the top of the file.)

Immediately after the `<span className="font-semibold text-slate-900">{d.name || "(unnamed)"}</span>`, add the Disabled badge:

```jsx
{!d.isEnabled && (
  <span className="inline-block rounded-[0.3rem] bg-slate-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700">Disabled</span>
)}
```

- [ ] **Step 4: Dim the card body when disabled**

Wrap the existing form-fields block (the `<div className="grid grid-cols-1 gap-3 md:grid-cols-2">` and following Fields up through the Test/Save row) — at the start of the `Card`'s children right after the header block, change:

```jsx
<Card key={d.id} className="space-y-4 p-5">
```

to:

```jsx
<Card key={d.id} className={cn("space-y-4 p-5 transition", !d.isEnabled && "opacity-60")}>
```

- [ ] **Step 5: Rebuild + verify in browser**

```bash
docker compose build frontend && docker compose up -d frontend
```

Then open http://localhost:3000/settings/ai-setup, click the toggle on one provider, confirm it dims and the Disabled badge appears, click again, confirm it un-dims.

Capture verification screenshot:

```bash
# (Use Playwright MCP to navigate to /settings/ai-setup and screenshot.)
```

Save to `screenshots/ai-toggle-disabled.png`.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/settings/ai-setup-page.tsx
git commit -m "feat(ai/ui): enable/disable switch on each provider card

Toggle dims the card to 60% opacity and shows a Disabled badge.
Fires PATCH immediately (no Save click). Card stays editable while
paused so the user can update keys/RPM before re-enabling.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 3: Categories backend — guards, split, list shape

Goal: enforce the leaf-only invariant, support per-parent name uniqueness, expose hierarchy in API responses.

### Task 5: DTO changes — accept `parentId`

**Files:**
- Modify: `backend/src/categories/dto.ts`

- [ ] **Step 1: Add `parentId` to both DTOs**

Replace the file with:

```typescript
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export enum CategoryKindDto {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
  OTHER = 'OTHER',
}

export class CreateCategoryDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsEnum(CategoryKindDto) kind!: CategoryKindDto;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() sortOrder?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsUUID() @IsOptional() parentId?: string | null;
}

export class UpdateCategoryDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(120) name?: string;
  @IsEnum(CategoryKindDto) @IsOptional() kind?: CategoryKindDto;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() sortOrder?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsUUID() @IsOptional() parentId?: string | null;
}
```

- [ ] **Step 2: Quick smoke check**

```bash
docker compose build backend && docker compose up -d backend
docker logs simplebooks-backend-1 --tail 10
```

Expected: backend boots, no Nest validator errors.

(No commit yet — bundle with Task 6.)

### Task 6: Service — sibling uniqueness, guards, list shape

**Files:**
- Create: `backend/src/categories/categories.service.spec.ts`
- Modify: `backend/src/categories/categories.service.ts`

- [ ] **Step 1: Write the test file**

Create `backend/src/categories/categories.service.spec.ts`:

```typescript
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

function makePrisma(state: { categories: any[]; transactions?: any[]; splits?: any[]; rules?: any[] }) {
  const cats = state.categories;
  const txs = state.transactions ?? [];
  const splits = state.splits ?? [];
  const rules = state.rules ?? [];
  return {
    category: {
      findMany: jest.fn(async ({ where, orderBy, include } = {} as any) => {
        let rows = cats.slice();
        if (where?.parentId !== undefined) rows = rows.filter((c) => c.parentId === where.parentId);
        if (include?._count) {
          rows = rows.map((c) => ({
            ...c,
            _count: {
              transactions: txs.filter((t) => t.categoryId === c.id).length,
              transactionSplits: splits.filter((s) => s.categoryId === c.id).length,
              rules: rules.filter((r) => r.categoryId === c.id).length,
              children: cats.filter((cc) => cc.parentId === c.id).length,
            },
          }));
        }
        return rows;
      }),
      findFirst: jest.fn(async ({ where } = {} as any) => {
        const nameEq = where?.name?.equals?.toLowerCase?.();
        const excludeId = where?.NOT?.id;
        return (
          cats.find((c) =>
            (nameEq === undefined || c.name.toLowerCase() === nameEq) &&
            (where?.parentId === undefined || c.parentId === where.parentId) &&
            (excludeId === undefined || c.id !== excludeId),
          ) ?? null
        );
      }),
      findUnique: jest.fn(async ({ where: { id } }: any) => cats.find((c) => c.id === id) ?? null),
      count: jest.fn(async ({ where: { parentId } }: any) => cats.filter((c) => c.parentId === parentId).length),
      create: jest.fn(async ({ data }: any) => { const row = { id: `c${cats.length + 1}`, ...data }; cats.push(row); return row; }),
      update: jest.fn(async ({ where: { id }, data }: any) => { const i = cats.findIndex((c) => c.id === id); cats[i] = { ...cats[i], ...data }; return cats[i]; }),
      delete: jest.fn(async ({ where: { id } }: any) => { const i = cats.findIndex((c) => c.id === id); const r = cats[i]; cats.splice(i, 1); return r; }),
    },
    transaction: {
      count: jest.fn(async ({ where: { categoryId } }: any) => txs.filter((t) => t.categoryId === categoryId).length),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let updated = 0;
        for (const t of txs) {
          if (t.categoryId === where.categoryId) {
            t.categoryId = data.categoryId;
            updated++;
          }
        }
        return { count: updated };
      }),
    },
    transactionSplit: {
      count: jest.fn(async ({ where: { categoryId } }: any) => splits.filter((s) => s.categoryId === categoryId).length),
    },
    rule: {
      count: jest.fn(async ({ where: { categoryId } }: any) => rules.filter((r) => r.categoryId === categoryId).length),
    },
    $transaction: jest.fn(async (fn: any) => fn({
      category: {
        create: jest.fn(async ({ data }: any) => { const row = { id: `c${cats.length + 1}`, ...data }; cats.push(row); return row; }),
        update: jest.fn(async ({ where: { id }, data }: any) => { const i = cats.findIndex((c) => c.id === id); cats[i] = { ...cats[i], ...data }; return cats[i]; }),
      },
      transaction: {
        updateMany: jest.fn(async ({ where, data }: any) => {
          let updated = 0;
          for (const t of txs) {
            if (t.categoryId === where.categoryId) { t.categoryId = data.categoryId; updated++; }
          }
          return { count: updated };
        }),
      },
    })),
  } as any;
}

describe('CategoriesService', () => {
  describe('create', () => {
    it('allows two categories named "Fees" under different parents (sibling-scoped)', async () => {
      const prisma = makePrisma({
        categories: [
          { id: 'banking',   name: 'Banking',   kind: 'EXPENSE', isActive: true, sortOrder: 100, parentId: null },
          { id: 'education', name: 'Education', kind: 'EXPENSE', isActive: true, sortOrder: 100, parentId: null },
          { id: 'bf',        name: 'Fees',      kind: 'EXPENSE', isActive: true, sortOrder: 100, parentId: 'banking' },
        ],
      });
      const svc = new CategoriesService(prisma);
      const created = await svc.create({ name: 'Fees', kind: 'EXPENSE' as any, parentId: 'education' });
      expect(created.name).toBe('Fees');
      expect(created.parentId).toBe('education');
    });

    it('rejects two siblings with the same name case-insensitively', async () => {
      const prisma = makePrisma({
        categories: [
          { id: 'banking', name: 'Banking', kind: 'EXPENSE', isActive: true, parentId: null },
          { id: 'bf',      name: 'Bank Fees', kind: 'EXPENSE', isActive: true, parentId: 'banking' },
        ],
      });
      await expect(new CategoriesService(prisma).create({ name: 'BANK FEES', kind: 'EXPENSE' as any, parentId: 'banking' }))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects subcategory whose kind differs from parent', async () => {
      const prisma = makePrisma({
        categories: [{ id: 'banking', name: 'Banking', kind: 'EXPENSE', isActive: true, parentId: null }],
      });
      await expect(new CategoriesService(prisma).create({ name: 'Refund', kind: 'INCOME' as any, parentId: 'banking' }))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects three-level nesting (parent already has a parent)', async () => {
      const prisma = makePrisma({
        categories: [
          { id: 'banking',  name: 'Banking',  kind: 'EXPENSE', parentId: null },
          { id: 'bankfees', name: 'BankFees', kind: 'EXPENSE', parentId: 'banking' },
        ],
      });
      await expect(new CategoriesService(prisma).create({ name: 'Wire Fees', kind: 'EXPENSE' as any, parentId: 'bankfees' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('rejects deletion when category has children', async () => {
      const prisma = makePrisma({
        categories: [
          { id: 'banking', name: 'Banking', kind: 'EXPENSE', parentId: null },
          { id: 'bf',      name: 'Bank Fees', kind: 'EXPENSE', parentId: 'banking' },
        ],
      });
      await expect(new CategoriesService(prisma).remove('banking')).rejects.toThrow(ConflictException);
    });
  });

  describe('split', () => {
    it('is idempotent on a category that already has children', async () => {
      const prisma = makePrisma({
        categories: [
          { id: 'banking', name: 'Banking', kind: 'EXPENSE', isActive: true, parentId: null },
          { id: 'bf',      name: 'Bank Fees', kind: 'EXPENSE', isActive: true, parentId: 'banking' },
        ],
      });
      const r = await new CategoriesService(prisma).split('banking');
      expect(r.alreadyGroup).toBe(true);
    });

    it('creates "<Name> (general)" child and migrates existing transactions', async () => {
      const prisma = makePrisma({
        categories: [{ id: 'banking', name: 'Banking', kind: 'EXPENSE', isActive: true, parentId: null }],
        transactions: [{ id: 't1', categoryId: 'banking' }, { id: 't2', categoryId: 'banking' }],
      });
      const r = await new CategoriesService(prisma).split('banking');
      expect(r.alreadyGroup).toBe(false);
      expect(r.child.name).toBe('Banking (general)');
      expect(r.child.parentId).toBe('banking');
      expect(r.migratedCount).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run the spec — confirm it fails**

```bash
docker exec simplebooks-backend-1 npx jest src/categories/categories.service.spec.ts --colors=false
```

Expected: multiple FAILs — `svc.split is not a function`, `BadRequestException` not thrown, etc.

- [ ] **Step 3: Replace `categories.service.ts` with the full implementation**

```typescript
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  // Sibling-scoped case-insensitive uniqueness. parentId=null is the top-level
  // namespace; rows with the same parentId share a namespace.
  private async assertNameAvailable(name: string, parentId: string | null, excludeId?: string) {
    const trimmed = name.trim();
    const clash = await this.prisma.category.findFirst({
      where: {
        name: { equals: trimmed, mode: 'insensitive' },
        parentId: parentId ?? null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new BadRequestException(
        `A category named "${clash.name}" already exists under the same parent. Category names must be unique among siblings.`,
      );
    }
  }

  private async assertParentValid(parentId: string | null, childKind: string) {
    if (parentId === null) return;
    const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) throw new BadRequestException('Parent category not found.');
    if (parent.parentId !== null) {
      throw new BadRequestException('Subcategories cannot themselves have subcategories (one-level cap).');
    }
    if (parent.kind !== childKind) {
      throw new BadRequestException(`Subcategory kind (${childKind}) must match parent kind (${parent.kind}).`);
    }
  }

  async list() {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { transactions: true, transactionSplits: true, rules: true, children: true } },
      },
    });
    return rows;
  }

  async get(id: string) {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }

  async create(data: CreateCategoryDto) {
    const parentId = data.parentId ?? null;
    await this.assertParentValid(parentId, data.kind);
    await this.assertNameAvailable(data.name, parentId);
    return this.prisma.category.create({
      data: {
        name: data.name.trim(),
        kind: data.kind,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 100,
        parentId,
      },
    });
  }

  async update(id: string, data: UpdateCategoryDto) {
    const existing = await this.get(id);
    const nextParentId = data.parentId === undefined ? existing.parentId : (data.parentId ?? null);
    const nextKind = data.kind ?? existing.kind;
    const nextName = (data.name ?? existing.name).trim();

    if (nextParentId !== existing.parentId || data.kind !== undefined) {
      await this.assertParentValid(nextParentId, nextKind);
    }
    if (data.name !== undefined || data.parentId !== undefined) {
      await this.assertNameAvailable(nextName, nextParentId, id);
    }
    if (data.parentId !== undefined && data.parentId !== existing.parentId) {
      // Moving a category — disallowed if it has children (preserves 1-level cap).
      const childCount = await this.prisma.category.count({ where: { parentId: id } });
      if (childCount > 0) {
        throw new BadRequestException('Cannot reparent a category that has subcategories. Move or delete its children first.');
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: nextName } : {}),
        ...(data.kind !== undefined ? { kind: nextKind } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.parentId !== undefined ? { parentId: nextParentId } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.get(id);
    const childCount = await this.prisma.category.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new ConflictException(`Cannot delete: ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'} still attached. Delete or reparent them first.`);
    }
    const [txCount, splitCount, ruleCount] = await Promise.all([
      this.prisma.transaction.count({ where: { categoryId: id } }),
      this.prisma.transactionSplit.count({ where: { categoryId: id } }),
      this.prisma.rule.count({ where: { categoryId: id } }),
    ]);
    if (txCount + splitCount + ruleCount > 0) {
      const parts: string[] = [];
      if (txCount) parts.push(`${txCount} transaction${txCount === 1 ? '' : 's'}`);
      if (splitCount) parts.push(`${splitCount} split${splitCount === 1 ? '' : 's'}`);
      if (ruleCount) parts.push(`${ruleCount} rule${ruleCount === 1 ? '' : 's'}`);
      throw new ConflictException(`Cannot delete category: ${parts.join(', ')} reference it. Reassign first.`);
    }
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }

  async split(id: string): Promise<{ alreadyGroup: boolean; child: any; migratedCount: number }> {
    const parent = await this.get(id);
    // Idempotent: if it already has children, no-op.
    const existingChildren = await this.prisma.category.count({ where: { parentId: id } });
    if (existingChildren > 0) {
      return { alreadyGroup: true, child: null as any, migratedCount: 0 };
    }
    if (parent.parentId !== null) {
      throw new BadRequestException('Cannot split a subcategory — subcategories cannot have children.');
    }
    return this.prisma.$transaction(async (tx) => {
      const childName = `${parent.name} (general)`;
      const child = await tx.category.create({
        data: {
          name: childName,
          kind: parent.kind,
          isActive: parent.isActive,
          sortOrder: 100,
          parentId: id,
        },
      });
      const migrate = await tx.transaction.updateMany({
        where: { categoryId: id },
        data: { categoryId: child.id },
      });
      return { alreadyGroup: false, child, migratedCount: migrate.count };
    });
  }
}
```

- [ ] **Step 4: Run the spec — confirm all pass**

```bash
docker exec simplebooks-backend-1 npx jest src/categories/categories.service.spec.ts --colors=false
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/categories/dto.ts backend/src/categories/categories.service.ts backend/src/categories/categories.service.spec.ts
git commit -m "feat(categories): subcategory guards, sibling uniqueness, split endpoint logic

- assertNameAvailable scoped per-parent (case-insensitive)
- assertParentValid: 1-level cap, kind must match parent
- remove() blocked when children attached
- update() blocks reparenting a category that itself has children
- split() creates '(general)' child and migrates transactions atomically

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 7: Controller — expose `POST /:id/split`

**Files:**
- Modify: `backend/src/categories/categories.controller.ts`

- [ ] **Step 1: Add the route**

Open `backend/src/categories/categories.controller.ts`. Add the imports if missing (`Post`, `HttpCode`) and add this method to the controller class:

```typescript
@Post(':id/split')
@HttpCode(200)
split(@Param('id') id: string) {
  return this.service.split(id);
}
```

- [ ] **Step 2: Smoke check the new route**

```bash
docker compose build backend && docker compose up -d backend
docker logs simplebooks-backend-1 --tail 20 | grep -E "categories|Mapped"
```

Expected: a `Mapped {/categories/:id/split, POST} route` log line.

- [ ] **Step 3: Commit**

```bash
git add backend/src/categories/categories.controller.ts
git commit -m "feat(categories): expose POST /categories/:id/split

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 8: Transactions service — reject parent categoryId on `setCategory`

**Files:**
- Modify: `backend/src/transactions/transactions.service.ts:249` (the `setCategory` method)

- [ ] **Step 1: Add `BadRequestException` to the imports**

At the top of `backend/src/transactions/transactions.service.ts`, ensure the `@nestjs/common` import includes `BadRequestException`. The file currently imports `NotFoundException`; add `BadRequestException` alongside it.

- [ ] **Step 2: Guard inside `setCategory`**

Replace the existing `setCategory` method (starts at line 249) so the guard sits immediately after the `tx` fetch and before the `$transaction(...)` block:

```typescript
async setCategory(transactionId: string, data: { categoryId?: string; vendorId?: string; notes?: string }) {
  const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!tx) throw new NotFoundException();
  if (data.categoryId) {
    const childCount = await this.prisma.category.count({ where: { parentId: data.categoryId } });
    if (childCount > 0) {
      throw new BadRequestException('Cannot assign a parent category to a transaction. Pick a subcategory.');
    }
  }
  // ... rest of method unchanged (the $transaction(...) block)
}
```

Keep the `$transaction(...)` body byte-identical to the existing implementation — only inserting the guard above it.

- [ ] **Step 3: Smoke-verify with curl**

After the backend restarts, attempt to assign a parent (manually pick a category id from `psql` first — but only after Phase 5 has populated parents; for now just confirm the guard compiles and the existing endpoint still works for leaves):

```bash
curl -sS -X PATCH http://localhost:4000/transactions/<some-id> \
  -H 'Content-Type: application/json' \
  -d '{"categoryId":"<some-leaf-id>"}'
```

Expected: 200 with the updated transaction.

- [ ] **Step 4: Commit**

```bash
git add backend/src/transactions/transactions.service.ts
git commit -m "feat(transactions): reject parent categoryId, hint to pick subcategory

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 4: AI prompt breadcrumbs + provenance wiring

Goal: AI sees only leaves with breadcrumb names; every AI-categorisation event records which provider.

### Task 9: Prompt — render leaves with breadcrumbs

**Files:**
- Modify: `backend/src/ai/ai-categoriser.service.ts:382-389` (the `loadCategoriesForPrompt` method)
- Modify: `backend/src/ai/prompts/categorise.ts`

- [ ] **Step 1: Update `loadCategoriesForPrompt` to filter leaves and resolve parent names**

In `backend/src/ai/ai-categoriser.service.ts`, replace the `loadCategoriesForPrompt()` method (currently lines 383-390) with:

```typescript
private async loadCategoriesForPrompt() {
  const cats = await this.prisma.category.findMany({
    where: {
      isActive: true,
      children: { none: {} },  // leaves only
    },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { transactions: true } },
      parent: { select: { name: true } },
    },
  });
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    usageCount: c._count.transactions,
    parentName: c.parent?.name ?? null,
  }));
}
```

- [ ] **Step 2: Update the prompt renderer to emit breadcrumbs**

Open `backend/src/ai/prompts/categorise.ts`. Locate the `buildCategoriseUserPrompt` function. Find the section that lists categories for the LLM (look for `categories.map(...).join(...)`) and modify it so each line renders as:

```typescript
// inside buildCategoriseUserPrompt — find the categories block:
const categoryLines = categories.map((c: any) => {
  const display = c.parentName ? `${c.parentName} > ${c.name}` : c.name;
  return `- ${display} (id=${c.id}, kind=${c.kind}, used ${c.usageCount}×)`;
}).join('\n');
```

If the prompt currently uses a different shape, preserve the surrounding text and only swap the line format. Use the file's existing template-string variables.

- [ ] **Step 3: Create `ai-categoriser.service.spec.ts` with breadcrumb test**

The file does not currently exist. Create `backend/src/ai/ai-categoriser.service.spec.ts`:

```typescript
import { buildCategoriseUserPrompt } from './prompts/categorise';

describe('buildCategoriseUserPrompt', () => {
  it('renders leaves with parent breadcrumbs', () => {
    const out = buildCategoriseUserPrompt({
      categories: [
        { id: 'c1', name: 'Bank Fees', kind: 'EXPENSE', usageCount: 5, parentName: 'Banking' } as any,
        { id: 'c2', name: 'Stationery', kind: 'EXPENSE', usageCount: 2, parentName: null } as any,
      ],
      vendors: [],
      fewShots: [],
      tx: { date: '2026-05-25', amount: '-12.50', description: 'TEST', vendorGuess: null, accountName: 'Cheque' },
    });
    expect(out).toContain('Banking > Bank Fees');
    expect(out).toContain('Stationery');
    expect(out).not.toContain('Banking > Stationery');
  });
});
```

- [ ] **Step 4: Run the new spec**

```bash
docker exec simplebooks-backend-1 npx jest src/ai/ai-categoriser.service.spec.ts --colors=false
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/ai-categoriser.service.ts backend/src/ai/prompts/categorise.ts
git commit -m "feat(ai): leaves-only + parent breadcrumb in categorise prompt

LLM never sees parent UUIDs because loadCategoriesForPrompt filters
to leaves (children.none). Each candidate is rendered 'Parent > Leaf'
so the model gets the grouping context for free.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 10: Record `providerId` on every AI categorisation event

**Files:**
- Modify: `backend/src/ai/ai-categoriser.service.ts:115-123` (the `suggest` method's event create)
- Modify: `backend/src/ai/ai-categoriser.service.ts:170-181` (the `apply` method's `AI_APPLIED` event)
- Modify: `backend/src/ai/ai-categoriser.service.ts:189-201` (the `apply` method's edit-branch event)
- Modify: `backend/src/ai/ai-categoriser.service.ts:204-211` (the `apply` method's reject-branch event)

- [ ] **Step 1: Carry `providerId` into the `suggest` flow's event create**

Inside `suggest()`, find the `result = await this.ai.complete<...>` call. `result.providerId` is already available on success. Update the existing event create (currently around line 115) to:

```typescript
const event = await this.prisma.categorisationEvent.create({
  data: {
    transactionId,
    source: 'AI_DRAFT',
    newCategoryId: categoryId,
    newVendorId: vendorId,
    reasoning,
    providerId: result.providerId,
  },
});
```

- [ ] **Step 2: Carry the draft's providerId into AI_APPLIED / AI_REJECTED events**

The draft itself records `providerId`. In the `apply()` method, the draft is loaded via `loadUnresolvedDraft()`. Add `providerId` to the `AiDraftView` type (top of file) and to the `loadUnresolvedDraft` return so we can propagate it.

Update `AiDraftView` (around line 18) to include:

```typescript
export interface AiDraftView {
  eventId: string;
  categoryId: string | null;
  categoryName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  confidence: AiConfidence;
  reasoning: string;
  providerId: string | null;
  createdAt: string;
}
```

(`providerId` already exists in the type — confirm during the edit.)

Update `loadUnresolvedDraft` to return `providerId: draft.providerId ?? null` (currently returns `null` hardcoded around line 379).

In `apply()`'s three event creates (accept / edit / reject branches around lines 172, 191, 205), add `providerId: draft.providerId` to each `data: { ... }` block.

- [ ] **Step 3: Add a jest test for the providerId persistence**

Append to `backend/src/ai/ai-categoriser.service.spec.ts`:

```typescript
import { AiCategoriserService } from './ai-categoriser.service';

describe('AiCategoriserService.suggest', () => {
  it('records providerId on the AI_DRAFT CategorisationEvent', async () => {
    const created: any[] = [];
    const prisma: any = {
      transaction: { findUnique: jest.fn().mockResolvedValue({ id: 't1', date: new Date('2026-05-25'), amount: '-12.50', description: 'X', vendorId: null, account: { id: 'a1', name: 'Cheque' } }) },
      category: { findMany: jest.fn().mockResolvedValue([{ id: 'cat1', name: 'Bank Fees', kind: 'EXPENSE', isActive: true, _count: { transactions: 1 }, parent: null }]) },
      vendor: { findMany: jest.fn().mockResolvedValue([]) },
      categorisationEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(async ({ data }: any) => { const row = { id: 'e1', createdAt: new Date(), ...data }; created.push(row); return row; }),
      },
    };
    const ai: any = {
      complete: jest.fn().mockResolvedValue({ ok: true, data: { categoryId: 'cat1', vendorId: null, confidence: 'high', reasoning: 'ok' }, providerId: 'prov-1', attempts: 1, promptTokens: 10, completionTokens: 5 }),
    };
    await new AiCategoriserService(prisma, ai).suggest('t1');
    expect(created).toHaveLength(1);
    expect(created[0].providerId).toBe('prov-1');
    expect(created[0].source).toBe('AI_DRAFT');
  });
});
```

Run:

```bash
docker exec simplebooks-backend-1 npx jest src/ai/ai-categoriser.service.spec.ts --colors=false
```

Expected: both tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/ai/ai-categoriser.service.ts backend/src/ai/ai-categoriser.service.spec.ts
git commit -m "feat(ai): record providerId on AI_DRAFT/APPLIED/REJECTED events

CategorisationEvent.providerId is now set for every AI-sourced event,
enabling 'Suggested by X on date' provenance in the UI without a
fragile join through AiCall by timestamp.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 11: Expose provenance on `/ai/review-queue`

**Files:**
- Modify: `backend/src/ai/ai-categoriser.service.ts:307-351` (`listReviewQueue`)

- [ ] **Step 1: Include provider in the draft fetch**

In `listReviewQueue()` (around line 310), change:

```typescript
const drafts = await this.prisma.categorisationEvent.findMany({
  where: { source: 'AI_DRAFT' },
  orderBy: { createdAt: 'desc' },
  take: 1000,
});
```

to:

```typescript
const drafts = await this.prisma.categorisationEvent.findMany({
  where: { source: 'AI_DRAFT' },
  orderBy: { createdAt: 'desc' },
  take: 1000,
  include: { provider: { select: { id: true, name: true } } },
});
```

- [ ] **Step 2: Propagate provider into each row of the response**

In the same method, change the `out.push({...})` block (around line 337) so the loop body produces:

```typescript
out.push({
  eventId: d.id,
  categoryId: d.newCategoryId,
  categoryName: d.newCategoryId ? cat.get(d.newCategoryId) ?? null : null,
  vendorId: d.newVendorId,
  vendorName: d.newVendorId ? ven.get(d.newVendorId) ?? null : null,
  confidence: 'med',
  reasoning: d.reasoning ?? '',
  providerId: d.provider?.id ?? null,
  providerName: d.provider?.name ?? null,
  createdAt: d.createdAt.toISOString(),
});
```

Update the `AiDraftView` interface (top of file) to include `providerName: string | null`.

- [ ] **Step 3: Smoke check the response shape**

```bash
docker compose build backend && docker compose up -d backend
sleep 5
curl -sS http://localhost:4000/ai/review-queue | python3 -m json.tool 2>&1 | head -30
```

Expected: each row contains `providerId` and `providerName`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/ai/ai-categoriser.service.ts
git commit -m "feat(ai): review queue returns providerName per draft

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 12: Expose provenance on `/transactions/:id`

**Files:**
- Modify: `backend/src/transactions/transactions.service.ts` (the `findOne` / `getById` method)

- [ ] **Step 1: Identify the single-transaction GET path**

Read `backend/src/transactions/transactions.service.ts` and find the method behind `GET /transactions/:id` (likely `findOne`, `get`, or `getById`).

- [ ] **Step 2: After loading the transaction, attach the latest categorisation event**

The actual `EventSource` enum values (confirmed in `schema.prisma:520`) are `USER`, `RULE`, `VENDOR_MATCH`, `AI_DRAFT`, `AI_APPLIED`, `AI_REJECTED`. The provenance caption only cares about events that *result* in a categorisation, so we filter to `USER`, `RULE`, `AI_APPLIED`.

Inside that method, after the existing Prisma `findUnique` returns the transaction, append:

```typescript
const latest = await this.prisma.categorisationEvent.findFirst({
  where: {
    transactionId: id,
    source: { in: ['USER', 'AI_APPLIED', 'RULE'] },
  },
  orderBy: { createdAt: 'desc' },
  include: {
    provider: { select: { name: true } },
    rule: { select: { name: true } },
  },
});
const categorisationProvenance = latest ? {
  source: latest.source,
  at: latest.createdAt.toISOString(),
  providerName: latest.provider?.name ?? null,
  ruleName: latest.rule?.name ?? null,
} : null;

return { ...tx, categorisationProvenance };
```

- [ ] **Step 3: Smoke check via curl**

```bash
curl -sS http://localhost:4000/transactions/<any-id> | python3 -m json.tool | grep -A4 categorisationProvenance
```

Expected: a `categorisationProvenance` object (or `null` if the transaction has never been categorised).

- [ ] **Step 4: Commit**

```bash
git add backend/src/transactions/transactions.service.ts
git commit -m "feat(transactions): expose categorisationProvenance on GET /:id

Reads the latest USER/AI_APPLIED/RULE_APPLIED/IMPORT event and
returns { source, at, providerName?, ruleName? } so the edit page
can render 'Categorised by AI (Provider) on date' inline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 5: Frontend — categories list, shared modal, AI Review additions, provenance captions

Goal: visible hierarchy in the categories list, a shared modal usable from multiple places, captions on transaction edit and AI review pages.

### Task 13: Frontend types + categories client lib

**Files:**
- Modify: `frontend/lib/types.ts` (find the `Category` type and the transaction type)
- Modify: `frontend/lib/categories.ts` (or wherever the CRUD client lives — confirm path during Step 1)

- [ ] **Step 1: Confirm the lib path**

```bash
grep -lrnE "createCategory|/categories" /home/reallybasic/Projects/Accounting/frontend/lib/
```

Expected: prints the file(s) holding the categories API client. Note the path.

- [ ] **Step 2: Add `parentId` and counts to the `Category` type**

In `frontend/lib/types.ts`, update the `Category` type to include:

```typescript
export type Category = {
  // ... existing fields preserved ...
  parentId: string | null;
  _count?: {
    transactions: number;
    transactionSplits: number;
    rules: number;
    children: number;
  };
};
```

Add a top-level `CategorisationProvenance` type used by the transaction edit page:

```typescript
export type CategorisationProvenance = {
  source: 'USER' | 'AI_APPLIED' | 'RULE';
  at: string;
  providerName: string | null;
  ruleName: string | null;
} | null;
```

Extend the `Transaction` type (find it in `types.ts`) to include `categorisationProvenance?: CategorisationProvenance`.

Extend the `AiReviewItem` (or equivalent) type to include `providerName: string | null`.

- [ ] **Step 3: Add `parentId` and `splitCategory` to the client lib**

In the categories client lib (from Step 1), update the create + update signatures to accept `parentId?: string | null`, and add a `splitCategory` export:

```typescript
export const splitCategory = (id: string) =>
  apiClient.post<{ alreadyGroup: boolean; child: { id: string; name: string; parentId: string } | null; migratedCount: number }>(`/categories/${id}/split`);
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/categories.ts
git commit -m "feat(categories/frontend): parentId on Category, splitCategory client, provenance type

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 14: Shared `<CategoryFormDialog>` component

**Files:**
- Create: `frontend/components/categories/category-form-dialog.tsx`

- [ ] **Step 1: Read an existing dialog to follow the pattern**

```bash
cat /home/reallybasic/Projects/Accounting/frontend/components/transactions/split-modal.tsx | head -40
```

Note the dialog wrapper, the form pattern, the close handler. Match the conventions.

- [ ] **Step 2: Write the dialog component**

Create the file with this content (substituting actual `<Dialog>` import path observed in Step 1):

```tsx
"use client";

import { useState } from "react";
import type { Category } from "@/lib/types";
import { createCategory, updateCategory } from "@/lib/categories";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// Import the project's existing <Dialog> / <Modal> primitive — confirm path in Step 1.

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (cat: Category) => void;
  initial?: Category;            // edit mode
  defaultParentId?: string | null;  // for create-subcategory flow
  parents: Pick<Category, "id" | "name" | "kind">[];  // all top-level rows for the dropdown
};

export function CategoryFormDialog({ open, onClose, onSaved, initial, defaultParentId, parents }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<Category["kind"]>(initial?.kind ?? "EXPENSE");
  const [parentId, setParentId] = useState<string | null>(initial?.parentId ?? defaultParentId ?? null);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubcategory = parentId !== null;
  const parentKind = isSubcategory ? parents.find((p) => p.id === parentId)?.kind : null;

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const effectiveKind = parentKind ?? kind;
      const payload = { name, kind: effectiveKind, isActive, parentId };
      const saved = initial
        ? await updateCategory(initial.id, payload)
        : await createCategory(payload);
      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-3 text-lg font-semibold">{initial ? "Edit category" : "Add category"}</h2>
        <div className="space-y-3">
          <Field label="Type">
            <select
              value={parentId ?? ""}
              onChange={(e) => setParentId(e.target.value || null)}
              className="w-full rounded-[0.3rem] border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">Top-level group</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>Subcategory under {p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          {!isSubcategory && (
            <Field label="Kind">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Category["kind"])}
                className="w-full rounded-[0.3rem] border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
                <option value="TRANSFER">Transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
          )}
          {isSubcategory && parentKind && (
            <div className="text-xs text-slate-500">Kind inherited from parent: <strong>{parentKind}</strong></div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
          {error && <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</div>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !name.trim()}>{submitting ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/categories/category-form-dialog.tsx
git commit -m "feat(categories/ui): shared CategoryFormDialog for create + edit

Used by /categories, /transactions/ai-review, and /categories/[id]/edit.
Top-level/subcategory toggle, kind inherited from parent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 15: Categories list page — render as a 1-deep tree

**Files:**
- Modify: `frontend/components/categories/categories-list.tsx`

- [ ] **Step 1: Read the current list to understand the structure**

```bash
wc -l /home/reallybasic/Projects/Accounting/frontend/components/categories/categories-list.tsx
```

Note any existing `<FilteredList>` usage and the column shape.

- [ ] **Step 2: Group flat rows into parent→children at render time**

In `categories-list.tsx`, where it currently maps `categories` to row elements, insert a grouping step:

```typescript
const top = categories.filter((c) => c.parentId === null);
const childrenByParent = new Map<string, Category[]>();
for (const c of categories) {
  if (c.parentId) {
    const arr = childrenByParent.get(c.parentId) ?? [];
    arr.push(c);
    childrenByParent.set(c.parentId, arr);
  }
}
```

Then render each `top` row followed (when applicable) by its children, with the children indented (e.g. an extra `pl-8` on a leading cell) and a small `+ Sub` button at the end of each parent row that calls `setDialogOpen(true); setDialogDefaultParent(c.id)`.

- [ ] **Step 3: Wire the dialog into the page**

Add at the top of the component:

```tsx
const [dialogOpen, setDialogOpen] = useState(false);
const [dialogInitial, setDialogInitial] = useState<Category | undefined>(undefined);
const [dialogDefaultParent, setDialogDefaultParent] = useState<string | null>(null);
```

And render at the bottom:

```tsx
<CategoryFormDialog
  open={dialogOpen}
  initial={dialogInitial}
  defaultParentId={dialogDefaultParent}
  parents={top.filter((c) => c.kind !== 'TRANSFER')}
  onClose={() => { setDialogOpen(false); setDialogInitial(undefined); setDialogDefaultParent(null); }}
  onSaved={() => router.refresh()}
/>
```

For leaf rows with children=0 and transactions>0 that the user clicks "+ Sub" on, the handler first calls `splitCategory(leaf.id)` and *then* opens the dialog.

- [ ] **Step 4: Rebuild + verify visually**

```bash
docker compose build frontend && docker compose up -d frontend
```

Open http://localhost:3000/categories, screenshot to `screenshots/categories-tree.png` via Playwright MCP, confirm:
- Top-level categories list with `+ Sub` button
- Clicking `+ Sub` opens the dialog with the parent pre-selected
- Saving a subcategory makes it appear nested under the parent

- [ ] **Step 5: Commit**

```bash
git add frontend/components/categories/categories-list.tsx
git commit -m "feat(categories/ui): 1-deep tree rendering + inline + Sub button

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 16: AI Review page — `[+ Add Category]` button + provenance caption

**Files:**
- Modify: `frontend/components/transactions/ai-review-list.tsx`

- [ ] **Step 1: Add the header action button**

Find the page header (a heading or PageShell area at the top of `ai-review-list.tsx`). Add immediately after the title:

```tsx
<Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
  <Plus className="h-4 w-4" /> Add Category
</Button>
```

Add at the top of the component:

```tsx
const [dialogOpen, setDialogOpen] = useState(false);
const [parents, setParents] = useState<Category[]>([]);
useEffect(() => { listCategories().then((cs) => setParents(cs.filter((c) => c.parentId === null))); }, []);
```

And at the bottom of the JSX:

```tsx
<CategoryFormDialog
  open={dialogOpen}
  parents={parents}
  onClose={() => setDialogOpen(false)}
  onSaved={() => router.refresh()}
/>
```

- [ ] **Step 2: Add the provenance caption to each draft row**

For each draft row in the existing map, add under the suggestion's main text:

```tsx
<div className="mt-1 text-xs text-slate-500 italic">
  Suggested by {draft.providerName ?? 'AI'} · {new Date(draft.createdAt).toLocaleString()}
</div>
```

- [ ] **Step 3: Rebuild + verify**

```bash
docker compose build frontend && docker compose up -d frontend
```

Open http://localhost:3000/transactions/ai-review, screenshot to `screenshots/ai-review-with-provenance.png`, confirm:
- `+ Add Category` button visible top-right
- Each row's suggestion shows "Suggested by <Provider> · <date>"

- [ ] **Step 4: Commit**

```bash
git add frontend/components/transactions/ai-review-list.tsx
git commit -m "feat(ai-review): + Add Category button and provenance caption per row

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 17: Transaction edit page — provenance caption

**Files:**
- Modify: `frontend/components/transactions/transaction-edit-modal.tsx` (or the transaction edit page — confirm path)

- [ ] **Step 1: Confirm which file renders the Category dropdown on transaction edit**

```bash
grep -rln "Category.*Select\|categoryId" /home/reallybasic/Projects/Accounting/frontend/components/transactions/ | head -5
```

Note the file that contains the Category form field.

- [ ] **Step 2: Render the caption directly under the Category Field**

In the chosen file, immediately after the existing `<Field label="Category">…</Field>` block, add:

```tsx
{tx.categorisationProvenance && (
  <div className="-mt-2 mb-3 text-xs text-slate-500 italic">
    {tx.categorisationProvenance.source === 'AI_APPLIED'
      ? `Categorised by AI${tx.categorisationProvenance.providerName ? ` (${tx.categorisationProvenance.providerName})` : ''} on ${new Date(tx.categorisationProvenance.at).toLocaleString()}`
      : tx.categorisationProvenance.source === 'RULE'
      ? `Categorised by rule${tx.categorisationProvenance.ruleName ? ` "${tx.categorisationProvenance.ruleName}"` : ''} on ${new Date(tx.categorisationProvenance.at).toLocaleString()}`
      : `Categorised by user on ${new Date(tx.categorisationProvenance.at).toLocaleString()}`}
  </div>
)}
```

(Substitute the `tx` variable name actually used by the surrounding code.)

- [ ] **Step 3: Rebuild + verify**

```bash
docker compose build frontend && docker compose up -d frontend
```

Open any transaction, screenshot to `screenshots/tx-edit-provenance.png`, confirm the caption appears.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/transactions/transaction-edit-modal.tsx
git commit -m "feat(transactions/ui): provenance caption under category dropdown

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 6: Documentation

### Task 18: Update CLAUDE.md, DatabaseSchema.md, modules_and_logic.md, Architecture.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `DatabaseSchema.md`
- Modify: `modules_and_logic.md`
- Modify: `Architecture.md`

- [ ] **Step 1: Add gotchas to CLAUDE.md**

Append to the "Known gotchas" list:

```markdown
- **Category hierarchy is one level deep, parents are pure grouping.** `Category.parentId` is nullable; rows with `parentId IS NULL` are either leaves (no children) or groups (≥1 child). Groups cannot hold transactions — `TransactionsService.update` rejects assigning a categoryId whose row has children. Subcategories cannot have their own subcategories (one-level cap enforced in `CategoriesService.assertParentValid`). Name uniqueness is **per-parent, case-insensitive** (not global) so "Fees" can exist under both Banking and Education.
- **Converting a leaf to a parent via `POST /categories/:id/split` is idempotent.** It auto-creates `"<Parent> (general)"` as the first child and migrates every transaction pointing at the leaf to that new child in a single Prisma transaction. Calling split on a category that already has children is a no-op. The frontend only triggers split on the inline `+ Sub` flow for leaves with transactions.
- **`CategorisationEvent.providerId` is the audit source of truth for AI provenance.** Old events from before this column existed stay `NULL`. The provenance caption on transaction edit and the "Suggested by X" line on AI Review join through this FK.
- **`AiProvider.isEnabled` filters at the chain level.** `AiClientService.complete()` reads `findMany({ where: { isEnabled: true }, ... })`. A disabled provider is invisible: it doesn't fire, doesn't count as a failed attempt, doesn't appear in AiCall logs. If all enabled providers are disabled, the chain returns `{ ok: false, error: 'no-providers' }` (same shape as empty chain).
```

- [ ] **Step 2: Update DatabaseSchema.md**

In the `Category` table section, add the new column row and note the constraint change. In the `AiProvider` section, add `isEnabled`. Find the `CategorisationEvent` section and add `providerId`.

- [ ] **Step 3: Update modules_and_logic.md**

Find the categories module section. Add a subsection explaining parent/child rendering and the `+ Sub` button. Find the AI Setup section and add the enable/disable toggle. Find the AI Review section and add the `+ Add Category` button and provenance caption.

- [ ] **Step 4: Update Architecture.md**

In the "AI" subsystem section (which already mentions provider chain and self-pacing), add a one-paragraph note that disabled providers are excluded at the chain level and that AI provenance is now recorded per event.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md DatabaseSchema.md modules_and_logic.md Architecture.md
git commit -m "docs: subcategories, AI provenance, AI enable toggle

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Phase 7: End-to-end verification

### Task 19: Manual E2E + persistence check

- [ ] **Step 1: Full provider persistence check (the user's headline requirement)**

```bash
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c "SELECT id, name, model, \"isEnabled\", \"requestsPerMinute\" FROM \"AiProvider\" ORDER BY \"isPrimary\" DESC;"
```

Expected: all 3 provider rows (Gemini, llm7, Ollama) intact with their original names, keys, models, and `isEnabled = t`.

- [ ] **Step 2: Restart all containers and re-check**

```bash
docker compose down
docker compose up -d
sleep 15
docker exec simplebooks-postgres-1 psql -U accounting -d accounting -c "SELECT COUNT(*) FROM \"AiProvider\";"
```

Expected: same 3 rows. (Crucially, `down` without `-v` must preserve.)

- [ ] **Step 3: Full UI walkthrough**

Open in browser and exercise each surface:

1. `http://localhost:3000/categories` — confirm tree renders, "+ Sub" works on a real category, dialog saves a subcategory, it appears nested.
2. `http://localhost:3000/transactions/ai-review` — confirm `+ Add Category` opens the dialog. Confirm `Suggested by <Provider> · <date>` caption on a draft.
3. Click any transaction → confirm the `Categorised by …` caption appears under Category.
4. `http://localhost:3000/settings/ai-setup` — toggle one provider off; confirm it dims and the Disabled badge appears. Refresh the page; toggle persists. Toggle back on.
5. While one provider is disabled, run a small bulk categorise. Confirm `AiCall` log shows no entries for the disabled provider.

Capture each as a screenshot in `screenshots/` for review.

- [ ] **Step 4: Final commit (only if any cleanup needed)**

If any small follow-ups appear (typos, accidental console.logs), fix in a final commit:

```bash
git add -p
git commit -m "polish: address E2E findings

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Mark plan complete**

The work is done when:
- All commits land cleanly on master.
- `AiProvider` row count matches the pre-migration count.
- All 5 walkthrough points above check out visually.
- Backend test suite passes: `docker exec simplebooks-backend-1 npx jest --colors=false`

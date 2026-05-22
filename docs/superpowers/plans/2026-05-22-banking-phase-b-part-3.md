# Banking Phase B — Plan Part 3 (Tasks 11-16)

Continuation of [Part 2](./2026-05-22-banking-phase-b-part-2.md). Backend finishes at Task 11; frontend infrastructure (types/api helpers, Categories pages, Vendors pages + extraction wizard, Rules list + editor) takes Tasks 12-16.

---

## Task 11: Backend — Categorisation events history endpoint

**Files:**
- Create: `backend/src/categorisation-events/categorisation-events.module.ts`
- Create: `backend/src/categorisation-events/categorisation-events.controller.ts`
- Create: `backend/src/categorisation-events/categorisation-events.service.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create service**

`backend/src/categorisation-events/categorisation-events.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategorisationEventsService {
  constructor(private prisma: PrismaService) {}

  list(q: { transactionId?: string; source?: string; limit?: number }) {
    const where: any = {};
    if (q.transactionId) where.transactionId = q.transactionId;
    if (q.source) where.source = q.source;
    return this.prisma.categorisationEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 200,
      include: {
        rule: { select: { id: true, name: true } },
      },
    });
  }
}
```

- [ ] **Step 2: Create controller**

`backend/src/categorisation-events/categorisation-events.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { CategorisationEventsService } from './categorisation-events.service';

@Controller('categorisation-events')
export class CategorisationEventsController {
  constructor(private service: CategorisationEventsService) {}

  @Get() list(
    @Query('transactionId') transactionId?: string,
    @Query('source') source?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      transactionId,
      source,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
```

- [ ] **Step 3: Create module + register**

`backend/src/categorisation-events/categorisation-events.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CategorisationEventsController } from './categorisation-events.controller';
import { CategorisationEventsService } from './categorisation-events.service';

@Module({
  controllers: [CategorisationEventsController],
  providers: [CategorisationEventsService],
  exports: [CategorisationEventsService],
})
export class CategorisationEventsModule {}
```

Add to `backend/src/app.module.ts` imports.

- [ ] **Step 4: Rebuild + verify**

```bash
docker compose build backend && docker compose up -d backend
sleep 8
curl -s "http://localhost:4000/categorisation-events?limit=5" | python3 -c "import sys,json; print('events:', len(json.load(sys.stdin)))"
```

Expected: 0 events on a fresh DB (no rules have fired yet).

- [ ] **Step 5: Commit**

```bash
git add backend/src/categorisation-events backend/src/app.module.ts
git commit -m "feat(banking): categorisation-events history endpoint"
```

---

## Task 12: Frontend — Banking-rules types + api helpers

**Files:**
- Modify: `frontend/lib/types.ts` (append Phase B types)
- Create: `frontend/lib/banking-rules.ts`

- [ ] **Step 1: Append Phase B types to types.ts**

Append to `frontend/lib/types.ts`:

```ts
// ── Banking Phase B ────────────────────────────────────────────────────

export type CategoryKind = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'OTHER';
export const CATEGORY_KINDS: { value: CategoryKind; label: string; tone: string }[] = [
  { value: 'INCOME', label: 'Income', tone: 'bg-emerald-100 text-emerald-900' },
  { value: 'EXPENSE', label: 'Expense', tone: 'bg-red-100 text-red-900' },
  { value: 'TRANSFER', label: 'Transfer', tone: 'bg-blue-100 text-blue-900' },
  { value: 'OTHER', label: 'Other', tone: 'bg-slate-100 text-slate-800' },
];

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count?: { transactions: number; transactionSplits?: number; rules?: number };
};

export type VendorKind = 'MERCHANT' | 'PERSON' | 'CUSTOMER' | 'BANK' | 'OTHER';
export const VENDOR_KINDS: { value: VendorKind; label: string }[] = [
  { value: 'MERCHANT', label: 'Merchant' },
  { value: 'PERSON', label: 'Person' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'BANK', label: 'Bank' },
  { value: 'OTHER', label: 'Other' },
];

export type Vendor = {
  id: string;
  name: string;
  kind: VendorKind;
  aliases: string[];
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { transactions: number };
};

export type RuleState = 'USER' | 'AI_DRAFTED' | 'APPROVED' | 'DENIED';
export const RULE_STATES: { value: RuleState; label: string }[] = [
  { value: 'USER', label: 'User' },
  { value: 'AI_DRAFTED', label: 'AI Drafts' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'DENIED', label: 'Denied' },
];

export type RuleField = 'DESCRIPTION' | 'AMOUNT' | 'VENDOR' | 'ACCOUNT';
export const RULE_FIELDS: { value: RuleField; label: string }[] = [
  { value: 'DESCRIPTION', label: 'Description' },
  { value: 'AMOUNT', label: 'Amount' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'ACCOUNT', label: 'Account' },
];

export type RuleOperator = 'CONTAINS' | 'EQUALS' | 'STARTS_WITH' | 'ENDS_WITH' | 'GT' | 'LT' | 'BETWEEN' | 'IN';
export const OPERATORS_BY_FIELD: Record<RuleField, { value: RuleOperator; label: string }[]> = {
  DESCRIPTION: [
    { value: 'CONTAINS', label: 'contains' },
    { value: 'EQUALS', label: 'equals' },
    { value: 'STARTS_WITH', label: 'starts with' },
    { value: 'ENDS_WITH', label: 'ends with' },
  ],
  AMOUNT: [
    { value: 'EQUALS', label: '=' },
    { value: 'GT', label: '>' },
    { value: 'LT', label: '<' },
    { value: 'BETWEEN', label: 'between' },
  ],
  VENDOR: [
    { value: 'EQUALS', label: 'is' },
    { value: 'IN', label: 'is one of' },
  ],
  ACCOUNT: [
    { value: 'EQUALS', label: 'is' },
    { value: 'IN', label: 'is one of' },
  ],
};

export type RuleCondition = {
  field: RuleField;
  operator: RuleOperator;
  value: string;
  value2?: string | null;
  valueList?: string[];
  position?: number;
};

export type Rule = {
  id: string;
  name: string;
  state: RuleState;
  isActive: boolean;
  priority: number;
  categoryId: string;
  category?: { id: string; name: string; kind: CategoryKind };
  vendorId?: string | null;
  vendor?: { id: string; name: string } | null;
  noteOnApply?: string | null;
  hitCount: number;
  lastFiredAt?: string | null;
  conditions: RuleCondition[];
  createdAt: string;
  updatedAt: string;
};

export type VendorExtractionCandidate = {
  suggestedName: string;
  aliases: string[];
  matchCount: number;
  sampleDescriptions: string[];
  existsAs: string | null;
  suggestedKind: VendorKind;
};

export type EngineRowResult = {
  transactionId: string;
  date: string;
  amount: string;
  description: string;
  vendorMatch: { vendorId: string; vendorName: string } | null;
  vendorMatchAmbiguous: boolean;
  ruleMatch: { ruleId: string; ruleName: string; priority: number; categoryId: string; categoryName: string } | null;
  allMatchingRules: Array<{ ruleId: string; ruleName: string; priority: number }>;
  skipped: 'has-splits' | 'no-rule-match' | null;
};

export type EngineOutput = {
  rows: EngineRowResult[];
  stats: {
    total: number;
    vendorMatched: number;
    ruleMatched: number;
    preservedSplits: number;
    unchanged: number;
    perRule: Array<{ ruleId: string; ruleName: string; count: number }>;
  };
};

export type TransactionSplit = {
  id?: string;
  categoryId: string;
  category?: Category;
  amount: string | number;
  notes?: string | null;
  position?: number;
};

export type CategorisationEvent = {
  id: string;
  transactionId: string;
  source: 'USER' | 'RULE' | 'VENDOR_MATCH' | 'AI_DRAFT' | 'AI_APPLIED';
  ruleId?: string | null;
  rule?: { id: string; name: string } | null;
  oldCategoryId?: string | null;
  newCategoryId?: string | null;
  oldVendorId?: string | null;
  newVendorId?: string | null;
  acceptedAiSuggestion?: boolean | null;
  createdAt: string;
};
```

- [ ] **Step 2: Create the banking-rules api wrapper**

`frontend/lib/banking-rules.ts`:

```ts
import { apiClient } from './api';
import type {
  Category, CategorisationEvent, EngineOutput, Rule, TransactionSplit,
  Vendor, VendorExtractionCandidate, VendorKind, CategoryKind, RuleState, RuleCondition,
} from './types';

// ── Categories ──────────────────────────────────────────────────────
export const listCategories = () => apiClient.get<Category[]>('/categories');
export const createCategory = (data: { name: string; kind: CategoryKind; sortOrder?: number; isActive?: boolean }) =>
  apiClient.post<Category>('/categories', data);
export const updateCategory = (id: string, data: Partial<{ name: string; kind: CategoryKind; sortOrder: number; isActive: boolean }>) =>
  apiClient.patch<Category>(`/categories/${id}`, data);
export const deleteCategory = (id: string) => apiClient.delete<{ ok: true }>(`/categories/${id}`);

// ── Vendors ──────────────────────────────────────────────────────────
export const listVendors = (includeInactive = false) =>
  apiClient.get<Vendor[]>(`/vendors${includeInactive ? '?includeInactive=true' : ''}`);
export const getVendor = (id: string) => apiClient.get<Vendor>(`/vendors/${id}`);
export const createVendor = (data: { name: string; kind: VendorKind; aliases: string[]; notes?: string; isActive?: boolean }) =>
  apiClient.post<Vendor>('/vendors', data);
export const updateVendor = (id: string, data: Partial<{ name: string; kind: VendorKind; aliases: string[]; notes: string; isActive: boolean }>) =>
  apiClient.patch<Vendor>(`/vendors/${id}`, data);
export const deleteVendor = (id: string) => apiClient.delete<{ ok: true }>(`/vendors/${id}`);

export const extractVendorCandidates = (input: { source: 'all-transactions' | 'csv'; csvBase64?: string; dateFrom?: string; dateTo?: string; accountIds?: string[] }) =>
  apiClient.post<VendorExtractionCandidate[]>('/vendors/extract', input);
export const commitVendorCandidates = (candidates: Array<{ name: string; kind: VendorKind; aliases: string[] }>) =>
  apiClient.post<{ created: number; updated: number; skipped: number }>('/vendors/extract/commit', { candidates });

// ── Rules ────────────────────────────────────────────────────────────
export const listRules = (filter: { state?: RuleState[]; isActive?: boolean } = {}) => {
  const search = new URLSearchParams();
  filter.state?.forEach((s) => search.append('state', s));
  if (filter.isActive !== undefined) search.set('isActive', String(filter.isActive));
  const qs = search.toString();
  return apiClient.get<Rule[]>(`/rules${qs ? '?' + qs : ''}`);
};
export const getRule = (id: string) => apiClient.get<Rule>(`/rules/${id}`);
export const createRule = (data: { name: string; categoryId: string; vendorId?: string; noteOnApply?: string; isActive?: boolean; conditions: RuleCondition[] }) =>
  apiClient.post<Rule>('/rules', data);
export const updateRule = (id: string, data: Partial<{ name: string; categoryId: string; vendorId: string; noteOnApply: string; isActive: boolean; conditions: RuleCondition[] }>) =>
  apiClient.patch<Rule>(`/rules/${id}`, data);
export const deleteRule = (id: string) => apiClient.delete<{ ok: true }>(`/rules/${id}`);
export const moveRule = (id: string, direction: 'up' | 'down') =>
  apiClient.patch<Rule>(`/rules/${id}/move`, { direction });
export const setRuleState = (id: string, state: RuleState) =>
  apiClient.patch<Rule>(`/rules/${id}/state`, { state });
export const toggleRuleActive = (id: string, isActive: boolean) =>
  apiClient.patch<Rule>(`/rules/${id}/toggle-active`, { isActive });

// ── Rule engine ──────────────────────────────────────────────────────
export const recategorise = (input: {
  scope: 'uncategorised' | 'all';
  accountIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  preserveSplits?: boolean;
  applyVendorMatch?: boolean;
}) => apiClient.post<EngineOutput>('/rule-engine/recategorise', input);

export const testRules = (input: {
  source: 'existing' | 'csv';
  csvRows?: Array<{ date: string; amount: string; description: string }>;
  accountIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  ruleIds?: string[];
  applyVendorMatch?: boolean;
}) => apiClient.post<EngineOutput>('/rule-engine/test', input);

// ── Transactions: splits + manual category ───────────────────────────
export const setTransactionSplits = (id: string, splits: TransactionSplit[]) =>
  apiClient.post<any>(`/transactions/${id}/splits`, { splits });
export const clearTransactionSplits = (id: string) =>
  apiClient.delete<any>(`/transactions/${id}/splits`);
export const setTransactionCategory = (id: string, data: { categoryId?: string; vendorId?: string; notes?: string }) =>
  apiClient.patch<any>(`/transactions/${id}/category`, data);

// ── Categorisation events ────────────────────────────────────────────
export const listCategorisationEvents = (params: { transactionId?: string; source?: string; limit?: number } = {}) => {
  const search = new URLSearchParams();
  if (params.transactionId) search.set('transactionId', params.transactionId);
  if (params.source) search.set('source', params.source);
  if (params.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return apiClient.get<CategorisationEvent[]>(`/categorisation-events${qs ? '?' + qs : ''}`);
};
```

- [ ] **Step 3: Commit (no rebuild — frontend rebuilds in Task 13)**

```bash
git add frontend/lib/types.ts frontend/lib/banking-rules.ts
git commit -m "feat(banking): Phase B frontend types + api helpers"
```

---

## Task 13: Frontend — Categories pages

**Files:**
- Create: `frontend/app/categories/page.tsx`
- Create: `frontend/app/categories/new/page.tsx`
- Create: `frontend/app/categories/[id]/edit/page.tsx`
- Create: `frontend/components/categories/categories-list.tsx`
- Create: `frontend/components/categories/category-form.tsx`
- Modify: `frontend/components/layout/sidebar.tsx` (add Categories entry under Banking)

- [ ] **Step 1: List component**

`frontend/components/categories/categories-list.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  FilteredList,
  textIncludes,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import { CATEGORY_KINDS, type Category } from "@/lib/types";

const columns: Column<Category>[] = [
  { key: "name", label: "Name", render: (r) => <span className="font-medium text-slate-900">{r.name}</span>, width: "2fr", sortValue: (r) => r.name },
  {
    key: "kind", label: "Kind",
    render: (r) => {
      const tone = CATEGORY_KINDS.find((k) => k.value === r.kind)?.tone ?? "bg-slate-100";
      return <span className={`inline-block rounded-[0.3rem] px-2 py-0.5 text-xs ${tone}`}>{r.kind}</span>;
    },
    width: "120px", sortValue: (r) => r.kind,
  },
  { key: "sort", label: "Sort", align: "right", render: (r) => <span className="tabular-nums text-slate-500">{r.sortOrder}</span>, width: "80px", sortValue: (r) => r.sortOrder },
  { key: "txns", label: "Used by", align: "right", render: (r) => <span className="tabular-nums text-slate-500">{r._count?.transactions ?? 0}</span>, width: "100px", sortValue: (r) => r._count?.transactions ?? 0 },
  { key: "status", label: "Status", align: "center", render: (r) => <Badge tone={r.isActive ? "completed" : "cancelled"}>{r.isActive ? "Active" : "Inactive"}</Badge>, width: "120px", sortValue: (r) => r.isActive },
];

export function CategoriesList({ initial }: { initial: Category[] }) {
  const filterFields: FilterFieldDef[] = useMemo(
    () => [
      { key: "name", label: "Name", type: "text", placeholder: "Search by name…" },
      {
        key: "kind",
        label: "Kind",
        type: "select",
        options: CATEGORY_KINDS.map((k) => ({ value: k.value, label: k.label })),
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
    ],
    [],
  );

  return (
    <FilteredList<Category>
      title="Categories"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/categories/${r.id}/edit`}
      newHref="/categories/new"
      newLabel="New category"
      emptyMessage="No categories yet."
      filterFields={filterFields}
      filterFn={(r, v) =>
        textIncludes(r.name, v.name ?? "") &&
        selectMatches(r.kind, v.kind ?? "") &&
        (!v.status || v.status === "__all__"
          ? true
          : v.status === "active" ? r.isActive : !r.isActive)
      }
      defaultSort={{ key: "sort", direction: "asc" }}
      tieBreakerKey="name"
    />
  );
}
```

- [ ] **Step 2: Category form**

`frontend/components/categories/category-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { CATEGORY_KINDS, type Category, type CategoryKind } from "@/lib/types";
import { createCategory, deleteCategory, updateCategory } from "@/lib/banking-rules";

export function CategoryForm({ initial }: { initial?: Category }) {
  const router = useRouter();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<CategoryKind>(initial?.kind ?? "EXPENSE");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 100));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: name.trim(), kind, sortOrder: Number(sortOrder), isActive };
      if (isEdit) await updateCategory(initial!.id, payload);
      else await createCategory(payload);
      router.push("/categories");
    } finally { setSaving(false); }
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(`Delete category "${initial.name}"?`)) return;
    try {
      await deleteCategory(initial.id);
      router.push("/categories");
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const rightActions = initial ? (
    <Button type="button" variant="outline" onClick={onDelete}>
      <Trash2 className="h-3.5 w-3.5" /> Delete
    </Button>
  ) : null;

  return (
    <EditPageChrome
      title={isEdit ? "Edit Category" : "New Category"}
      backHref="/categories"
      formId="category-form"
      saving={saving}
      rightActions={rightActions ?? undefined}
    >
      <Card className="p-6">
        <form id="category-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </Field>
          <Field label="Kind">
            <Select value={kind} onValueChange={(v) => setKind(v as CategoryKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_KINDS.map((k) => (<SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sort order (lower = higher in dropdown)">
            <Input type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
          <Field label="Active">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
              <span>{isActive ? "Active" : "Inactive"}</span>
            </label>
          </Field>
        </form>
      </Card>
    </EditPageChrome>
  );
}
```

- [ ] **Step 3: Pages**

`frontend/app/categories/page.tsx`:

```tsx
import { CategoriesList } from "@/components/categories/categories-list";
import { listCategories } from "@/lib/banking-rules";

export default async function Page() {
  const categories = await listCategories();
  return <CategoriesList initial={categories} />;
}
```

`frontend/app/categories/new/page.tsx`:

```tsx
import { CategoryForm } from "@/components/categories/category-form";

export default function Page() {
  return <CategoryForm />;
}
```

`frontend/app/categories/[id]/edit/page.tsx`:

```tsx
import { CategoryForm } from "@/components/categories/category-form";
import { listCategories } from "@/lib/banking-rules";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const categories = await listCategories();
  const cat = categories.find((c) => c.id === id);
  if (!cat) return <div className="p-6">Category not found.</div>;
  return <CategoryForm initial={cat} />;
}
```

- [ ] **Step 4: Add Categories entry to sidebar**

In `frontend/components/layout/sidebar.tsx`, find the Banking group's `items` array and insert a Categories entry between Transactions and Rules:

```tsx
{
  kind: "group",
  label: "Banking",
  icon: Bank,
  items: [
    { label: "Accounts", href: "/accounts" },
    { label: "Transactions", href: "/transactions" },
    { label: "Categories", href: "/categories" },   // NEW
    { label: "Vendors", href: "/vendors" },         // NEW (Task 14)
    { label: "Rules", href: "/rules" },
  ],
},
```

Also add a sub-icon entry to `subIcons`:

```tsx
const subIcons: Record<string, any> = {
  // ... existing entries ...
  "/categories": Tag,
  "/vendors": Storefront,
  // ...
};
```

Import `Tag` and `Storefront` from `@phosphor-icons/react` at the top.

- [ ] **Step 5: Rebuild + verify**

```bash
docker compose build frontend && docker compose up -d frontend
sleep 45
curl -s -o /dev/null -w 'categories HTTP %{http_code}\n' http://localhost:3000/categories
curl -s -o /dev/null -w 'categories/new HTTP %{http_code}\n' http://localhost:3000/categories/new
```

Expected: both HTTP 200.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/categories frontend/components/categories frontend/components/layout/sidebar.tsx
git commit -m "feat(banking): categories list + form pages + sidebar entry"
```

---

## Task 14: Frontend — Vendors list + edit pages + alias chip input

**Files:**
- Create: `frontend/components/vendors/vendors-list.tsx`
- Create: `frontend/components/vendors/vendor-form.tsx`
- Create: `frontend/components/vendors/alias-chip-input.tsx`
- Create: `frontend/app/vendors/page.tsx`
- Create: `frontend/app/vendors/new/page.tsx`
- Create: `frontend/app/vendors/[id]/edit/page.tsx`

- [ ] **Step 1: Alias chip input component**

`frontend/components/vendors/alias-chip-input.tsx`:

```tsx
"use client";

import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AliasChipInput({
  value,
  onChange,
  placeholder = "Type alias and press Enter…",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim().toLowerCase();
    if (!v) return;
    if (value.includes(v)) { setDraft(""); return; }
    onChange([...value, v]);
    setDraft("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function removeAt(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="rounded-[0.3rem] border border-slate-300 bg-white px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((a, i) => (
          <span key={i} className={cn(
            "inline-flex items-center gap-1 rounded-[0.3rem] bg-slate-100 px-2 py-0.5 text-xs text-slate-700",
          )}>
            <span className="font-mono">{a}</span>
            <button type="button" onClick={() => removeAt(i)} className="text-slate-500 hover:text-slate-900">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={value.length === 0 ? placeholder : ""}
          className="h-7 min-w-[120px] flex-1 border-0 px-1 py-0 shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vendor list**

`frontend/components/vendors/vendors-list.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FilteredList,
  textIncludes,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import { VENDOR_KINDS, type Vendor } from "@/lib/types";

const columns: Column<Vendor>[] = [
  { key: "name", label: "Vendor", render: (r) => <span className="font-medium text-slate-900">{r.name}</span>, width: "1.5fr", sortValue: (r) => r.name },
  { key: "kind", label: "Kind", render: (r) => <span className="text-slate-600">{r.kind}</span>, width: "100px", sortValue: (r) => r.kind },
  {
    key: "aliases", label: "Aliases",
    render: (r) => {
      const first = r.aliases.slice(0, 2);
      const remaining = r.aliases.length - first.length;
      return (
        <span className="text-xs text-slate-600">
          {first.map((a) => (
            <code key={a} className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5">{a}</code>
          ))}
          {remaining > 0 && <span className="text-slate-400">+{remaining} more</span>}
        </span>
      );
    },
    width: "2fr",
  },
  { key: "txns", label: "Used by", align: "right", render: (r) => <span className="tabular-nums text-slate-500">{r._count?.transactions ?? 0}</span>, width: "100px", sortValue: (r) => r._count?.transactions ?? 0 },
  { key: "status", label: "Status", align: "center", render: (r) => <Badge tone={r.isActive ? "completed" : "cancelled"}>{r.isActive ? "Active" : "Inactive"}</Badge>, width: "120px", sortValue: (r) => r.isActive },
];

export function VendorsList({ initial }: { initial: Vendor[] }) {
  const filterFields: FilterFieldDef[] = useMemo(
    () => [
      { key: "name", label: "Name", type: "text", placeholder: "Search by name…" },
      { key: "kind", label: "Kind", type: "select", options: VENDOR_KINDS.map((k) => ({ value: k.value, label: k.label })) },
    ],
    [],
  );

  return (
    <FilteredList<Vendor>
      title="Vendors"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/vendors/${r.id}/edit`}
      newHref="/vendors/new"
      newLabel="New vendor"
      emptyMessage="No vendors yet."
      filterFields={filterFields}
      filterFn={(r, v) =>
        textIncludes(r.name, v.name ?? "") &&
        selectMatches(r.kind, v.kind ?? "")
      }
      defaultSort={{ key: "status", direction: "asc" }}
      tieBreakerKey="name"
      headerExtras={
        <Button asChild variant="outline">
          <Link href="/vendors/extract">Suggest vendors from transactions</Link>
        </Button>
      }
    />
  );
}
```

NOTE: `<FilteredList>` may not support `headerExtras` — if not, drop that prop and add the button elsewhere (e.g. as a "secondary new action"). Check the FilteredList component first; if needed, just place the button above the list.

- [ ] **Step 3: Vendor form**

`frontend/components/vendors/vendor-form.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { AliasChipInput } from "./alias-chip-input";
import { createVendor, deleteVendor, updateVendor } from "@/lib/banking-rules";
import { VENDOR_KINDS, type Vendor, type VendorKind } from "@/lib/types";

export function VendorForm({ initial }: { initial?: Vendor }) {
  const router = useRouter();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<VendorKind>(initial?.kind ?? "MERCHANT");
  const [aliases, setAliases] = useState<string[]>(initial?.aliases ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: name.trim(), kind, aliases, notes: notes.trim() || undefined, isActive };
      if (isEdit) await updateVendor(initial!.id, payload);
      else await createVendor(payload);
      router.push("/vendors");
    } finally { setSaving(false); }
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(`Delete vendor "${initial.name}"? Transactions linked to it will be unlinked (not deleted).`)) return;
    await deleteVendor(initial.id);
    router.push("/vendors");
  }

  return (
    <EditPageChrome
      title={isEdit ? "Edit Vendor" : "New Vendor"}
      backHref="/vendors"
      formId="vendor-form"
      saving={saving}
      rightActions={initial ? <Button type="button" variant="outline" onClick={onDelete}><Trash2 className="h-3.5 w-3.5"/> Delete</Button> : undefined}
    >
      <Card className="p-6">
        <form id="vendor-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </Field>
          <Field label="Kind">
            <Select value={kind} onValueChange={(v) => setKind(v as VendorKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VENDOR_KINDS.map((k) => (<SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label='Aliases (lowercase substrings; match is case-insensitive. Trailing space prevents false-positives — e.g. "rac " not "rac".)'>
              <AliasChipInput value={aliases} onChange={setAliases} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
            </Field>
          </div>
          <Field label="Active">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
              <span>{isActive ? "Active" : "Inactive"}</span>
            </label>
          </Field>
        </form>
      </Card>
    </EditPageChrome>
  );
}
```

- [ ] **Step 4: Pages**

`frontend/app/vendors/page.tsx`:

```tsx
import { VendorsList } from "@/components/vendors/vendors-list";
import { listVendors } from "@/lib/banking-rules";

export default async function Page() {
  const vendors = await listVendors(true);
  return <VendorsList initial={vendors} />;
}
```

`frontend/app/vendors/new/page.tsx`:

```tsx
import { VendorForm } from "@/components/vendors/vendor-form";
export default function Page() { return <VendorForm />; }
```

`frontend/app/vendors/[id]/edit/page.tsx`:

```tsx
import { VendorForm } from "@/components/vendors/vendor-form";
import { getVendor } from "@/lib/banking-rules";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await getVendor(id);
  return <VendorForm initial={vendor} />;
}
```

- [ ] **Step 5: Rebuild + verify**

```bash
docker compose build frontend && docker compose up -d frontend
sleep 45
curl -s -o /dev/null -w 'vendors HTTP %{http_code}\n' http://localhost:3000/vendors
curl -s http://localhost:3000/vendors | grep -c "Woolworths" || echo "(missing — investigate)"
```

Expected: HTTP 200, "Woolworths" present in HTML.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/vendors frontend/components/vendors
git commit -m "feat(banking): vendors list + edit pages + alias chip input"
```

---

## Task 15: Frontend — Vendor extraction wizard

**Files:**
- Create: `frontend/app/vendors/extract/page.tsx`
- Create: `frontend/components/vendors/vendor-extractor.tsx`

- [ ] **Step 1: Wizard component**

`frontend/components/vendors/vendor-extractor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle, Check } from "lucide-react";
import { VENDOR_KINDS, type Account, type VendorExtractionCandidate, type VendorKind } from "@/lib/types";
import { extractVendorCandidates, commitVendorCandidates } from "@/lib/banking-rules";

type Stage = "configure" | "loading" | "review" | "done";

type Editable = VendorExtractionCandidate & {
  selected: boolean;
  editedName: string;
  editedKind: VendorKind;
  editedAliases: string;  // comma-joined
};

export function VendorExtractor({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("configure");
  const [source, setSource] = useState<"all-transactions" | "csv">("all-transactions");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [csvBase64, setCsvBase64] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Editable[]>([]);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setError("File exceeds 10 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(",")[1];
      setCsvBase64(b64);
      setError(null);
    };
    reader.readAsDataURL(f);
  }

  async function onExtract() {
    setError(null);
    setStage("loading");
    try {
      const raw = await extractVendorCandidates({
        source,
        csvBase64: source === "csv" ? csvBase64 ?? undefined : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        accountIds: accountIds.length ? accountIds : undefined,
      });
      const editable: Editable[] = raw.map((c) => ({
        ...c,
        selected: c.existsAs === null,
        editedName: c.suggestedName,
        editedKind: c.suggestedKind,
        editedAliases: c.aliases.join(", "),
      }));
      setCandidates(editable);
      setStage("review");
    } catch (e) {
      setError((e as Error).message);
      setStage("configure");
    }
  }

  async function onCommit() {
    setStage("loading");
    try {
      const payload = candidates
        .filter((c) => c.selected)
        .map((c) => ({
          name: c.editedName.trim(),
          kind: c.editedKind,
          aliases: c.editedAliases.split(",").map((a) => a.trim()).filter(Boolean),
        }));
      const r = await commitVendorCandidates(payload);
      setResult(r);
      setStage("done");
    } catch (e) {
      setError((e as Error).message);
      setStage("review");
    }
  }

  return (
    <div className="px-6 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Suggest vendors from transactions</h1>
      </div>

      {stage === "configure" && (
        <Card className="space-y-4 p-6">
          <Field label="Source">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="src" checked={source === "all-transactions"} onChange={() => setSource("all-transactions")} />
                Use all imported transactions
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="src" checked={source === "csv"} onChange={() => setSource("csv")} />
                Upload a CSV (parsed in-memory, never saved)
              </label>
            </div>
          </Field>
          {source === "all-transactions" && (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Date from (optional)">
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </Field>
                <Field label="Date to (optional)">
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </Field>
                <Field label="Accounts (optional)">
                  <div className="flex flex-wrap gap-1.5">
                    {accounts.map((a) => {
                      const on = accountIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setAccountIds((curr) => curr.includes(a.id) ? curr.filter((x) => x !== a.id) : [...curr, a.id])}
                          className={`rounded-[0.3rem] border px-2 py-1 text-xs ${on ? "border-indigo-400 bg-indigo-100 text-indigo-900" : "border-slate-300 bg-white text-slate-600"}`}
                        >{a.name}</button>
                      );
                    })}
                  </div>
                </Field>
              </div>
            </>
          )}
          {source === "csv" && (
            <Field label="CSV file (max 10 MB)">
              <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
              {csvBase64 && <div className="mt-1 text-xs text-emerald-700"><Check className="inline h-3 w-3" /> File loaded ({Math.ceil(csvBase64.length * 0.75 / 1024)} KB)</div>}
            </Field>
          )}
          {error && <div className="text-sm text-red-700"><AlertCircle className="inline h-3 w-3" /> {error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => router.push("/vendors")}>Cancel</Button>
            <Button type="button" onClick={onExtract} disabled={source === "csv" && !csvBase64}>Extract candidates</Button>
          </div>
        </Card>
      )}

      {stage === "loading" && (
        <Card className="flex items-center justify-center p-10 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> <span className="ml-2">Scanning descriptions…</span>
        </Card>
      )}

      {stage === "review" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              {candidates.filter((c) => c.selected).length} of {candidates.length} selected
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStage("configure")}>Back</Button>
              <Button type="button" onClick={onCommit}>Create selected</Button>
            </div>
          </div>
          {error && <div className="mb-3 text-sm text-red-700"><AlertCircle className="inline h-3 w-3" /> {error}</div>}
          <ul className="divide-y divide-slate-100">
            {candidates.map((c, i) => (
              <li key={i} className="grid grid-cols-[24px_1.5fr_120px_2fr_80px_60px] items-center gap-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.selected}
                  onChange={(e) => setCandidates((cur) => cur.map((x, idx) => idx === i ? { ...x, selected: e.target.checked } : x))}
                  className="h-4 w-4"
                />
                <Input
                  value={c.editedName}
                  onChange={(e) => setCandidates((cur) => cur.map((x, idx) => idx === i ? { ...x, editedName: e.target.value } : x))}
                  className="h-8"
                />
                <Select
                  value={c.editedKind}
                  onValueChange={(v) => setCandidates((cur) => cur.map((x, idx) => idx === i ? { ...x, editedKind: v as VendorKind } : x))}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VENDOR_KINDS.map((k) => (<SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Input
                  value={c.editedAliases}
                  onChange={(e) => setCandidates((cur) => cur.map((x, idx) => idx === i ? { ...x, editedAliases: e.target.value } : x))}
                  className="h-8 font-mono text-xs"
                  placeholder="comma-separated aliases"
                />
                <span className="text-right tabular-nums text-slate-500">{c.matchCount}</span>
                {c.existsAs && (
                  <span className="text-right text-xs text-amber-700" title={`Would merge into existing vendor "${c.existsAs}"`}>exists</span>
                )}
                {!c.existsAs && <span />}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {stage === "done" && result && (
        <Card className="space-y-3 p-6">
          <div className="text-emerald-700">
            <Check className="inline h-4 w-4" /> Created {result.created} new vendors. Updated {result.updated} existing with extra aliases. Skipped {result.skipped}.
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => router.push("/vendors")}>Back to vendors</Button>
            <Button type="button" onClick={() => router.push("/transactions")}>Go to Re-categorise</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Page**

`frontend/app/vendors/extract/page.tsx`:

```tsx
import { VendorExtractor } from "@/components/vendors/vendor-extractor";
import { listAccounts } from "@/lib/banking";

export default async function Page() {
  const accounts = await listAccounts(true);
  return <VendorExtractor accounts={accounts} />;
}
```

- [ ] **Step 3: Rebuild + verify**

```bash
docker compose build frontend && docker compose up -d frontend
sleep 45
curl -s -o /dev/null -w 'extract page HTTP %{http_code}\n' http://localhost:3000/vendors/extract
```

Expected: HTTP 200.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/vendors/extract frontend/components/vendors/vendor-extractor.tsx
git commit -m "feat(banking): vendor extraction wizard (configure → review → done)"
```

---

## Task 16: Frontend — Rules list with priority controls + state tabs

**Files:**
- Create: `frontend/components/rules/rules-list.tsx`
- Create: `frontend/components/rules/rule-row.tsx`
- Create: `frontend/app/rules/page.tsx`

- [ ] **Step 1: Rule row component**

`frontend/components/rules/rule-row.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CATEGORY_KINDS, RULE_FIELDS, type Rule } from "@/lib/types";
import { deleteRule, moveRule, toggleRuleActive } from "@/lib/banking-rules";

function conditionSummary(c: Rule["conditions"][number], vendorNames: Map<string, string>, accountNames: Map<string, string>): string {
  const fieldLabel = RULE_FIELDS.find((f) => f.value === c.field)?.label.toLowerCase() ?? c.field;
  const op = c.operator.toLowerCase().replace("_", " ");
  if (c.field === "VENDOR") {
    if (c.operator === "EQUALS") return `vendor is ${vendorNames.get(c.value) ?? c.value}`;
    if (c.operator === "IN") return `vendor in [${(c.valueList ?? []).map((id) => vendorNames.get(id) ?? id).join(", ")}]`;
  }
  if (c.field === "ACCOUNT") {
    if (c.operator === "EQUALS") return `account is ${accountNames.get(c.value) ?? c.value}`;
    if (c.operator === "IN") return `account in [${(c.valueList ?? []).map((id) => accountNames.get(id) ?? id).join(", ")}]`;
  }
  if (c.operator === "BETWEEN") return `${fieldLabel} between ${c.value} and ${c.value2 ?? ""}`;
  return `${fieldLabel} ${op} "${c.value}"`;
}

export function RuleRow({
  rule,
  rank,
  vendorNames,
  accountNames,
}: {
  rule: Rule;
  rank: number;
  vendorNames: Map<string, string>;
  accountNames: Map<string, string>;
}) {
  const router = useRouter();
  const kindTone = CATEGORY_KINDS.find((k) => k.value === rule.category?.kind)?.tone ?? "bg-slate-100";

  async function onMove(direction: "up" | "down") {
    await moveRule(rule.id, direction);
    router.refresh();
  }
  async function onToggle() {
    await toggleRuleActive(rule.id, !rule.isActive);
    router.refresh();
  }
  async function onDelete() {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    await deleteRule(rule.id);
    router.refresh();
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="font-mono text-lg tabular-nums text-slate-400">{rank}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">{rule.name}</span>
              {!rule.isActive && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">Inactive</span>}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {rule.conditions.map((c, i) => (
                <span key={i}>
                  {i > 0 && <span className="mx-1 text-slate-400">AND</span>}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{conditionSummary(c, vendorNames, accountNames)}</code>
                </span>
              ))}
              <span className="mx-2 text-slate-400">→</span>
              <span className={`inline-block rounded-[0.3rem] px-2 py-0.5 text-xs ${kindTone}`}>{rule.category?.name}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Hits: {rule.hitCount}
              {rule.lastFiredAt && <> · Last fired {new Date(rule.lastFiredAt).toLocaleDateString("en-AU")}</>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="outline" onClick={onToggle} size="sm">
            {rule.isActive ? "Deactivate" : "Activate"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onMove("up")} size="sm" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5"/></Button>
          <Button type="button" variant="outline" onClick={() => onMove("down")} size="sm" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5"/></Button>
          <Button asChild variant="outline" size="sm"><Link href={`/rules/${rule.id}/edit`}><Pencil className="h-3.5 w-3.5"/></Link></Button>
          <Button type="button" variant="outline" onClick={onDelete} size="sm"><Trash2 className="h-3.5 w-3.5"/></Button>
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Rules list component**

`frontend/components/rules/rules-list.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Plus, FlaskConical } from "lucide-react";
import { RULE_STATES, type Account, type Rule, type RuleState, type Vendor } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RuleRow } from "./rule-row";

export function RulesList({ initial, vendors, accounts }: { initial: Rule[]; vendors: Vendor[]; accounts: Account[] }) {
  const [stateFilter, setStateFilter] = useState<RuleState>("USER");

  const counts: Record<RuleState, number> = useMemo(() => {
    const acc = { USER: 0, AI_DRAFTED: 0, APPROVED: 0, DENIED: 0 };
    for (const r of initial) acc[r.state]++;
    return acc;
  }, [initial]);

  const filtered = useMemo(() => initial.filter((r) => r.state === stateFilter), [initial, stateFilter]);
  const vendorNames = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);
  const accountNames = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  return (
    <PageShell
      title="Rules"
      actions={
        <>
          <Button asChild variant="outline"><Link href="/rules/test"><FlaskConical className="h-4 w-4"/> Test rules</Link></Button>
          <Button asChild><Link href="/rules/new"><Plus className="h-4 w-4"/> New rule</Link></Button>
        </>
      }
    >
      <div className="mb-4 flex gap-2">
        {RULE_STATES.map((s) => {
          const c = counts[s.value];
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setStateFilter(s.value)}
              className={cn(
                "rounded-[0.3rem] border px-3 py-1.5 text-sm",
                stateFilter === s.value
                  ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {s.label} <span className="ml-1 text-slate-400">({c})</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          No rules in this state yet.
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((r, i) => (
          <RuleRow key={r.id} rule={r} rank={i + 1} vendorNames={vendorNames} accountNames={accountNames} />
        ))}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 3: Rules page**

`frontend/app/rules/page.tsx`:

```tsx
import { RulesList } from "@/components/rules/rules-list";
import { listRules } from "@/lib/banking-rules";
import { listVendors } from "@/lib/banking-rules";
import { listAccounts } from "@/lib/banking";

export default async function Page() {
  const [rules, vendors, accounts] = await Promise.all([
    listRules({}),
    listVendors(true),
    listAccounts(true),
  ]);
  return <RulesList initial={rules} vendors={vendors} accounts={accounts} />;
}
```

- [ ] **Step 4: Rebuild + verify**

```bash
docker compose build frontend && docker compose up -d frontend
sleep 45
curl -s -o /dev/null -w 'rules HTTP %{http_code}\n' http://localhost:3000/rules
```

Expected: HTTP 200.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/rules/page.tsx frontend/components/rules
git commit -m "feat(banking): rules list with priority controls + state tabs"
```

---

End of Part 3. Continuing in [Part 4](./2026-05-22-banking-phase-b-part-4.md).

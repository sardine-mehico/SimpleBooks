# Expense + Income Reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two new report pages (`/reports/expense`, `/reports/income`) with a clickable category donut chart that drills down into a subcategory donut, a parents-then-children totals table, date + multi-account filters, and Excel export. No P&L, no dashboard tile, no PDF.

**Architecture:** New backend `reports` module exposes `GET /reports/expense` and `GET /reports/income`, both returning `{ parents: [{ id, name, total, children: [...] }], uncategorised, grandTotal }` from a single raw-SQL `COALESCE(parentId, id)` GROUP BY. Shared `<ReportPage>` client component renders Recharts donuts + a totals table inside a white Card. ExcelJS is dynamic-imported on the Export click — never enters the main bundle.

**Tech Stack:** NestJS 10 + Prisma 5 raw query (Prisma's typed `groupBy` doesn't compose with `COALESCE` over a joined column). Next.js 15 client component. New npm deps: `recharts` (bundled), `exceljs` (dynamic-imported only).

**Spec:** `docs/superpowers/specs/2026-05-26-expense-income-reports-design.md`

---

## File map

**Backend — create**
- `backend/src/reports/reports.module.ts`
- `backend/src/reports/reports.controller.ts`
- `backend/src/reports/reports.service.ts`
- `backend/src/reports/dto.ts`
- `backend/src/reports/reports.service.spec.ts`

**Backend — modify**
- `backend/src/app.module.ts` (wire ReportsModule)
- `backend/src/util/dates.ts` (NEW — `localStartOfDay`, `localEndOfDay` helpers)

**Frontend — create**
- `frontend/app/reports/expense/page.tsx`
- `frontend/app/reports/income/page.tsx`
- `frontend/components/reports/report-page.tsx`
- `frontend/components/reports/category-pie.tsx`
- `frontend/components/reports/account-multi-select.tsx`
- `frontend/components/reports/totals-table.tsx`
- `frontend/lib/reports.ts`
- `frontend/lib/export-excel.ts`

**Frontend — modify**
- `frontend/package.json` (add recharts, exceljs)
- `frontend/lib/types.ts` (add `ReportResponse` type)
- `frontend/components/layout/sidebar.tsx` (append to existing Reports group)

**Docs — modify**
- `Architecture.md`, `modules_and_logic.md`, `CLAUDE.md`

---

# Phase 1: Backend reports module

### Task 1: Local-date helper

**Files:**
- Create: `backend/src/util/dates.ts`

- [ ] **Step 1: Create the file**

```typescript
// backend/src/util/dates.ts
// Convert a date-only string (YYYY-MM-DD) into a JS Date at local-time start/end
// in the given IANA timezone. Avoids the UTC-midnight off-by-one bug documented
// in CLAUDE.md (positive-offset zones round back a day when `new Date(yyyy-mm-dd)`
// is interpreted as UTC midnight).

export function localStartOfDay(yyyy_mm_dd: string, timezone: string): Date {
  return zonedDate(yyyy_mm_dd, '00:00:00', timezone);
}

export function localEndOfDay(yyyy_mm_dd: string, timezone: string): Date {
  return zonedDate(yyyy_mm_dd, '23:59:59.999', timezone);
}

function zonedDate(date: string, time: string, timezone: string): Date {
  // Use Intl to compute the offset for the given timezone at that calendar instant.
  // We construct as if UTC, then read what the wall-clock looks like in `timezone`,
  // and subtract the difference to get the true UTC instant that corresponds to
  // local time `date T time` in `timezone`.
  const asUtc = new Date(`${date}T${time}Z`);
  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = tzFormatter.formatToParts(asUtc).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const tzAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '00' : parts.hour), Number(parts.minute), Number(parts.second),
  );
  const offsetMs = tzAsUtc - asUtc.getTime();
  return new Date(asUtc.getTime() - offsetMs);
}
```

- [ ] **Step 2: Smoke test (no jest spec needed — used trivially via report tests)**

```bash
docker compose build backend && docker compose up -d backend
sleep 8
docker exec simplebooks-backend-1 node -e "
const { localStartOfDay, localEndOfDay } = require('./dist/util/dates');
const s = localStartOfDay('2026-05-01', 'Australia/Perth');
const e = localEndOfDay('2026-05-31', 'Australia/Perth');
console.log('start:', s.toISOString(), '(expected 2026-04-30T16:00:00.000Z)');
console.log('end:', e.toISOString(), '(expected 2026-05-31T15:59:59.999Z)');
"
```

Expected: start is 16:00 UTC the previous day, end is 15:59:59 UTC of the last day (Perth is +08:00).

- [ ] **Step 3: Commit**

```bash
git add backend/src/util/dates.ts
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(util): local-date helpers for timezone-correct day boundaries

Date-only strings (YYYY-MM-DD) parse as UTC midnight by default,
which shifts back a day for positive-offset zones (Australia/Perth
+08:00). localStartOfDay / localEndOfDay convert via Intl to the
correct UTC instant for the given calendar day in the given zone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2: Backend reports module + DTO + service + controller + tests

**Files:**
- Create: `backend/src/reports/dto.ts`, `reports.service.ts`, `reports.controller.ts`, `reports.module.ts`, `reports.service.spec.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write `dto.ts`**

```typescript
// backend/src/reports/dto.ts
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ReportQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsString() accountIds?: string;  // comma-separated UUIDs; absent = all accounts
}
```

- [ ] **Step 2: Write the test file `reports.service.spec.ts`**

```typescript
// backend/src/reports/reports.service.spec.ts
import { ReportsService } from './reports.service';

function makePrisma(state: { catRows: any[]; uncatTotal: string | number }) {
  return {
    $queryRaw: jest.fn(async (sqlTemplate: any, ..._args: any[]) => {
      // Distinguish the two query calls by the SQL fragment passed in.
      // The first SELECT … FROM "Transaction" t JOIN "Category" c is the category rollup;
      // the second is the uncategorised total.
      const sqlString = sqlTemplate.strings ? sqlTemplate.strings.join('') : String(sqlTemplate);
      if (sqlString.includes('JOIN "Category"')) return state.catRows;
      return [{ total: String(state.uncatTotal) }];
    }),
    preferences: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Australia/Perth' }) },
  } as any;
}

describe('ReportsService.getReport', () => {
  it('returns zero-state when there are no transactions in range', async () => {
    const prisma = makePrisma({ catRows: [], uncatTotal: '0' });
    const svc = new ReportsService(prisma);
    const r = await svc.getReport('EXPENSE', { from: '2026-05-01', to: '2026-05-31' });
    expect(r.parents).toEqual([]);
    expect(r.uncategorised).toBe('0.00');
    expect(r.grandTotal).toBe('0.00');
  });

  it('rolls up two child totals into the parent and sorts parents by total desc', async () => {
    const prisma = makePrisma({
      catRows: [
        { rollupId: 'banking', leafId: 'bf',   leafName: 'Bank Fees',      parentName: 'Banking',  total: '112.00' },
        { rollupId: 'banking', leafId: 'of',   leafName: 'Overdraft Fees', parentName: 'Banking',  total: '45.00' },
        { rollupId: 'rent',    leafId: 'rent', leafName: 'Rent',           parentName: null,       total: '5000.00' },
      ],
      uncatTotal: '0',
    });
    const svc = new ReportsService(prisma);
    const r = await svc.getReport('EXPENSE', { from: '2026-05-01', to: '2026-05-31' });
    expect(r.parents).toHaveLength(2);
    expect(r.parents[0].name).toBe('Rent');               // 5000 > 157
    expect(r.parents[0].total).toBe('5000.00');
    expect(r.parents[0].children).toEqual([]);
    expect(r.parents[1].name).toBe('Banking');
    expect(r.parents[1].total).toBe('157.00');
    expect(r.parents[1].children.map((c: any) => c.name)).toEqual(['Bank Fees', 'Overdraft Fees']);
    expect(r.grandTotal).toBe('5157.00');
  });

  it('includes uncategorised total when present', async () => {
    const prisma = makePrisma({
      catRows: [{ rollupId: 'x', leafId: 'x', leafName: 'X', parentName: null, total: '100.00' }],
      uncatTotal: '50.00',
    });
    const r = await new ReportsService(prisma).getReport('EXPENSE', { from: '2026-05-01', to: '2026-05-31' });
    expect(r.uncategorised).toBe('50.00');
    expect(r.grandTotal).toBe('150.00');
  });
});
```

- [ ] **Step 3: Run the spec — confirm it fails (no ReportsService yet)**

```bash
docker exec simplebooks-backend-1 npx jest src/reports/reports.service.spec.ts --colors=false 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module './reports.service'`.

- [ ] **Step 4: Write `reports.service.ts`**

```typescript
// backend/src/reports/reports.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportQueryDto } from './dto';
import { localStartOfDay, localEndOfDay } from '../util/dates';

export type ReportKind = 'EXPENSE' | 'INCOME';

export interface ReportChildRow {
  id: string;
  name: string;
  total: string;
}

export interface ReportParentRow {
  id: string;
  name: string;
  total: string;
  children: ReportChildRow[];
}

export interface ReportResponse {
  kind: ReportKind;
  from: string;
  to: string;
  accountIds: string[] | null;  // null = all
  parents: ReportParentRow[];
  uncategorised: string;
  grandTotal: string;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getReport(kind: ReportKind, q: ReportQueryDto): Promise<ReportResponse> {
    const accountIds = parseAccountIds(q.accountIds);

    const prefs = await this.prisma.preferences.findFirst();
    const timezone = prefs?.timezone ?? 'Australia/Perth';
    const fromDate = localStartOfDay(q.from, timezone);
    const toDate = localEndOfDay(q.to, timezone);

    // Sign predicate: expense uses negative transaction amounts; income uses positive.
    const signPredicate = kind === 'EXPENSE'
      ? Prisma.sql`t."amount" < 0`
      : Prisma.sql`t."amount" > 0`;
    const sumExpr = Prisma.sql`SUM(CASE WHEN ${signPredicate} THEN ABS(t."amount") ELSE 0 END)`;

    // Account filter fragment.
    const accountFilter = accountIds && accountIds.length > 0
      ? Prisma.sql`AND t."accountId" = ANY(${accountIds}::uuid[])`
      : Prisma.empty;
    // If the caller passed an empty list explicitly (e.g. ?accountIds=), return zero-state.
    if (accountIds !== null && accountIds.length === 0) {
      return { kind, from: q.from, to: q.to, accountIds: [], parents: [], uncategorised: '0.00', grandTotal: '0.00' };
    }

    type CatRow = { rollupId: string; leafId: string; leafName: string; parentName: string | null; total: Prisma.Decimal | string };
    const rows: CatRow[] = await this.prisma.$queryRaw<CatRow[]>(Prisma.sql`
      SELECT
        COALESCE(c."parentId", c."id") AS "rollupId",
        c."id" AS "leafId",
        c."name" AS "leafName",
        p."name" AS "parentName",
        ${sumExpr} AS "total"
      FROM "Transaction" t
      JOIN "Category" c ON c."id" = t."categoryId"
      LEFT JOIN "Category" p ON p."id" = c."parentId"
      WHERE t."date" BETWEEN ${fromDate} AND ${toDate}
        AND c."kind" = ${kind}::"CategoryKind"
        ${accountFilter}
      GROUP BY COALESCE(c."parentId", c."id"), c."id", c."name", p."name"
      HAVING ${sumExpr} > 0
    `);

    // Group by rollupId to build parents + children.
    const byRollup = new Map<string, { id: string; name: string; total: number; children: ReportChildRow[]; isAlsoParent: boolean }>();
    for (const r of rows) {
      const isStandaloneLeaf = r.rollupId === r.leafId;
      const existing = byRollup.get(r.rollupId);
      if (!existing) {
        // The first row we see for this rollup id determines the parent name.
        // If rollup === leaf (standalone leaf), use leafName; else use parentName.
        const groupName = isStandaloneLeaf ? r.leafName : (r.parentName ?? r.leafName);
        byRollup.set(r.rollupId, {
          id: r.rollupId,
          name: groupName,
          total: 0,
          children: [],
          isAlsoParent: !isStandaloneLeaf,
        });
      }
      const slot = byRollup.get(r.rollupId)!;
      slot.total += Number(r.total);
      if (!isStandaloneLeaf) {
        slot.children.push({ id: r.leafId, name: r.leafName, total: Number(r.total).toFixed(2) });
      }
    }

    // Sort: parents by total desc; children within each parent by total desc.
    const parents: ReportParentRow[] = Array.from(byRollup.values())
      .map((g) => ({
        id: g.id,
        name: g.name,
        total: g.total.toFixed(2),
        children: g.children.slice().sort((a, b) => Number(b.total) - Number(a.total)),
      }))
      .sort((a, b) => Number(b.total) - Number(a.total));

    // Uncategorised total.
    const uncatRows: Array<{ total: Prisma.Decimal | string }> = await this.prisma.$queryRaw(Prisma.sql`
      SELECT COALESCE(${sumExpr}, 0) AS "total"
      FROM "Transaction" t
      WHERE t."categoryId" IS NULL
        AND t."date" BETWEEN ${fromDate} AND ${toDate}
        ${accountFilter}
    `);
    const uncategorised = Number(uncatRows[0]?.total ?? 0).toFixed(2);
    const grandTotal = (Number(uncategorised) + parents.reduce((acc, p) => acc + Number(p.total), 0)).toFixed(2);

    return {
      kind, from: q.from, to: q.to, accountIds,
      parents, uncategorised, grandTotal,
    };
  }
}

function parseAccountIds(raw?: string): string[] | null {
  if (raw === undefined) return null;
  if (raw === '') return [];
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  // Basic UUID validation per part.
  for (const p of parts) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p)) {
      throw new Error(`Invalid account id: ${p}`);
    }
  }
  return parts;
}
```

- [ ] **Step 5: Write `reports.controller.ts`**

```typescript
// backend/src/reports/reports.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto';

@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('expense')
  expense(@Query() q: ReportQueryDto) {
    return this.service.getReport('EXPENSE', q);
  }

  @Get('income')
  income(@Query() q: ReportQueryDto) {
    return this.service.getReport('INCOME', q);
  }
}
```

- [ ] **Step 6: Write `reports.module.ts`**

```typescript
// backend/src/reports/reports.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
```

- [ ] **Step 7: Wire `ReportsModule` in `app.module.ts`**

In `backend/src/app.module.ts`, find the `imports: [ ... ]` array of `AppModule`. Add `ReportsModule` to the list. Add the import line at the top:

```typescript
import { ReportsModule } from './reports/reports.module';
```

- [ ] **Step 8: Rebuild + run all spec**

```bash
docker compose build backend && docker compose up -d backend
sleep 8
docker exec simplebooks-backend-1 npx jest src/reports/reports.service.spec.ts --colors=false 2>&1 | tail -20
```

Expected: 3 tests pass.

Also verify routes mapped:

```bash
docker logs simplebooks-backend-1 --tail 50 | grep -E "reports" | head
```

Expected: `Mapped {/reports/expense, GET}` and `Mapped {/reports/income, GET}`.

- [ ] **Step 9: Smoke check the live endpoint**

```bash
FROM=$(date -d '2026-05-01' +%Y-%m-%d 2>/dev/null || date -j -f %Y-%m-%d 2026-05-01 +%Y-%m-%d)
TO=$(date -d '2026-05-31' +%Y-%m-%d 2>/dev/null || date -j -f %Y-%m-%d 2026-05-31 +%Y-%m-%d)
curl -sS "http://localhost:4000/reports/expense?from=${FROM}&to=${TO}" | python3 -m json.tool | head -20
```

Expected: a JSON response with `kind: "EXPENSE"`, `parents: [...]`, `uncategorised`, `grandTotal`.

- [ ] **Step 10: Commit**

```bash
git add backend/src/reports/ backend/src/app.module.ts
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(reports): GET /reports/expense and /reports/income endpoints

ReportsService runs a single raw-SQL query joining Transaction to
Category, grouping by COALESCE(parentId, id) so parents roll up their
children and standalone top-level leaves appear as their own row.
Sign convention: expense sums ABS(amount) for negative-side rows on
EXPENSE-kind categories; income sums positive-side on INCOME-kind.
Uncategorised total is a separate query. All amounts returned as
strings to match the Prisma Decimal JSON convention. Timezone-correct
date boundaries via the new localStartOfDay / localEndOfDay helpers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 2: Frontend deps + types + client

### Task 3: Add recharts + exceljs to package.json

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Add the two deps**

```bash
cd /home/reallybasic/Projects/Accounting/frontend
# Add via direct edit since the project uses Docker-based npm install on rebuild.
```

Edit `frontend/package.json`. In `dependencies`, add:

```json
"recharts": "^2.13.0",
"exceljs": "^4.4.0"
```

(Insert alphabetically between existing entries — don't reorder unrelated lines.)

- [ ] **Step 2: Rebuild frontend (this runs npm install inside the image)**

```bash
cd /home/reallybasic/Projects/Accounting
docker compose build frontend 2>&1 | tail -20
```

Expected: build succeeds; recharts and exceljs are installed.

- [ ] **Step 3: Commit (`package-lock.json` is auto-updated inside the image, so the host file may not change)**

```bash
git add frontend/package.json
# If package-lock.json was generated on host, include it:
[ -f frontend/package-lock.json ] && git add frontend/package-lock.json
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
chore(frontend): add recharts + exceljs for the reports module

recharts (~200KB) for the donut charts with click-event support;
exceljs (~700KB) for the Excel export — dynamic-imported only on the
Export click so it never enters the main bundle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4: Frontend types + reports client lib

**Files:**
- Modify: `frontend/lib/types.ts` (add `ReportResponse`)
- Create: `frontend/lib/reports.ts`

- [ ] **Step 1: Add the type to `frontend/lib/types.ts`**

Add near the other report-adjacent or "AI" types:

```typescript
export type ReportChildRow = { id: string; name: string; total: string };
export type ReportParentRow = { id: string; name: string; total: string; children: ReportChildRow[] };
export type ReportResponse = {
  kind: 'EXPENSE' | 'INCOME';
  from: string;
  to: string;
  accountIds: string[] | null;
  parents: ReportParentRow[];
  uncategorised: string;
  grandTotal: string;
};
```

- [ ] **Step 2: Create `frontend/lib/reports.ts`**

```typescript
// frontend/lib/reports.ts
import { apiClient } from './api';
import type { ReportResponse } from './types';

function buildQuery(params: { from: string; to: string; accountIds?: string[] }): string {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.accountIds !== undefined) {
    q.set('accountIds', params.accountIds.join(','));
  }
  return q.toString();
}

export const getExpenseReport = (params: { from: string; to: string; accountIds?: string[] }) =>
  apiClient.get<ReportResponse>(`/reports/expense?${buildQuery(params)}`);

export const getIncomeReport = (params: { from: string; to: string; accountIds?: string[] }) =>
  apiClient.get<ReportResponse>(`/reports/income?${buildQuery(params)}`);
```

(Confirm the actual export name in `frontend/lib/api.ts` — could be `apiClient`, `api`, or similar. Adapt.)

- [ ] **Step 3: Build to verify types compile**

```bash
docker compose build frontend 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/reports.ts
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(reports/frontend): types + client lib for /reports endpoints

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 3: Frontend components — pie, table, multi-select

### Task 5: `<CategoryPie>` Recharts donut wrapper

**Files:**
- Create: `frontend/components/reports/category-pie.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/reports/category-pie.tsx
"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

// Cycling palette of 8 distinct hues — picked from the project's accent palette
// (indigo, slate, emerald, amber, rose, sky, violet, teal).
const PALETTE = ['#4F46E5', '#475569', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#8B5CF6', '#14B8A6'];

// Lighter variants for the drill-down (subcategory) pie — 5 shades stepping from
// 100% to 60% opacity of the base color.
function lighten(hex: string, amount: number): string {
  // amount: 0 = original, 1 = white. Simple lerp in RGB space.
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lerp = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[lerp(r), lerp(g), lerp(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export type PieSlice = { id: string; name: string; total: number };

export function CategoryPie({
  title,
  data,
  centerTotal,
  baseColor,             // when set, derives slice colors as lighter shades of this base (drill-down mode)
  onSelect,              // called with slice id on click; undefined = non-clickable
}: {
  title: string;
  data: PieSlice[];
  centerTotal: string;
  baseColor?: string;
  onSelect?: (id: string) => void;
}) {
  const sliceColors = useMemo(() => {
    if (baseColor) {
      return data.map((_, i) => lighten(baseColor, 0.1 + (i / Math.max(1, data.length - 1)) * 0.4));
    }
    return data.map((_, i) => PALETTE[i % PALETTE.length]);
  }, [data, baseColor]);

  if (data.length === 0) {
    return (
      <div className="flex h-72 flex-col items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">
        <div className="font-medium text-slate-700">{title}</div>
        <div className="mt-1 italic">no data for this selection</div>
      </div>
    );
  }

  return (
    <div className="flex h-72 flex-col">
      <div className="mb-2 text-sm font-medium text-slate-700">{title}</div>
      <div className="relative flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="name"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={1}
              onClick={onSelect ? (entry: any) => onSelect(entry.id) : undefined}
              cursor={onSelect ? 'pointer' : 'default'}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={sliceColors[i]} stroke="white" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any, name: any) => [`$${Number(value).toFixed(2)}`, name]}
              contentStyle={{ borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xs uppercase tracking-wider text-slate-400">Total</div>
          <div className="text-xl font-semibold text-slate-900">${centerTotal}</div>
        </div>
      </div>
    </div>
  );
}

export const PIE_PALETTE = PALETTE;  // exposed for the parent component to pick the baseColor
```

- [ ] **Step 2: Commit (other components depend on this; verify build later when they're wired up)**

```bash
git add frontend/components/reports/category-pie.tsx
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(reports/ui): CategoryPie — Recharts donut wrapper

Donut style with center-label showing total. Click handler on slices
when onSelect is provided. Base palette of 8 distinct hues for the
top-level pie; baseColor mode derives 5 lighter shades from a chosen
hue for the drill-down (subcategory) pie.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 6: `<AccountMultiSelect>` pill-style multi-select

**Files:**
- Create: `frontend/components/reports/account-multi-select.tsx`

- [ ] **Step 1: Write the component (matches existing Popover + Checkbox patterns)**

```tsx
// frontend/components/reports/account-multi-select.tsx
"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import type { Account } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function AccountMultiSelect({
  accounts,
  selected,
  onChange,
}: {
  accounts: Account[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };

  const remove = (id: string) => onChange(selected.filter((x) => x !== id));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((id) => {
        const a = byId.get(id);
        if (!a) return null;
        return (
          <span key={id} className="inline-flex items-center gap-1 rounded-[0.3rem] bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            {a.name}
            <button type="button" onClick={() => remove(id)} aria-label={`Remove ${a.name}`} className="rounded hover:bg-indigo-100">
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
      {selected.length === 0 && (
        <span className="text-xs italic text-slate-400">no accounts selected</span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex items-center gap-1 rounded-[0.3rem] border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">
            <Plus className="h-3 w-3" /> Add
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="max-h-72 space-y-1 overflow-auto">
            {accounts.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={() => toggle(a.id)}
                />
                <span>{a.name}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

(Verify `@/components/ui/popover` exists — if not, use a small inline popover or the Radix Dropdown primitive that other components use. Quick check: `ls /home/reallybasic/Projects/Accounting/frontend/components/ui/popover.tsx`.)

- [ ] **Step 2: Commit**

```bash
git add frontend/components/reports/account-multi-select.tsx
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(reports/ui): AccountMultiSelect — pill chips + checkbox popover

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 7: `<TotalsTable>` — parents bold, children indented with ↳

**Files:**
- Create: `frontend/components/reports/totals-table.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/components/reports/totals-table.tsx
import type { ReportResponse } from "@/lib/types";

function fmt(n: string | number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TotalsTable({ report }: { report: ReportResponse }) {
  return (
    <table className="w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
          <th className="border-b border-slate-200 py-2 font-medium">Category</th>
          <th className="border-b border-slate-200 py-2 text-right font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {report.parents.map((p) => (
          <tbody key={p.id} className="contents">
            <tr className="font-semibold text-slate-900">
              <td className="py-1.5">{p.name}</td>
              <td className="py-1.5 text-right tabular-nums">${fmt(p.total)}</td>
            </tr>
            {p.children.map((c) => (
              <tr key={c.id} className="text-slate-700">
                <td className="py-1 pl-8 text-slate-600 before:mr-2 before:text-slate-300 before:content-['↳']">{c.name}</td>
                <td className="py-1 text-right tabular-nums">${fmt(c.total)}</td>
              </tr>
            ))}
          </tbody>
        ))}
        {Number(report.uncategorised) > 0 && (
          <tr className="italic text-slate-500">
            <td className="py-1.5">Uncategorised</td>
            <td className="py-1.5 text-right tabular-nums">${fmt(report.uncategorised)}</td>
          </tr>
        )}
        <tr className="border-t border-slate-300 font-bold text-slate-900">
          <td className="pt-2.5">Total</td>
          <td className="pt-2.5 text-right tabular-nums">${fmt(report.grandTotal)}</td>
        </tr>
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/reports/totals-table.tsx
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(reports/ui): TotalsTable — parents bold + children indented + total footer

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 4: Excel export lib

### Task 8: `lib/export-excel.ts` — ExcelJS workbook builder

**Files:**
- Create: `frontend/lib/export-excel.ts`

- [ ] **Step 1: Write the export helper**

```typescript
// frontend/lib/export-excel.ts
import type { ReportResponse } from "./types";

export async function exportReportToExcel(report: ReportResponse, chartPng: Blob | null) {
  // Dynamic import so ExcelJS only loads when the user clicks Export.
  const ExcelJS = (await import('exceljs')).default;

  const wb = new ExcelJS.Workbook();
  const sheetName = report.kind === 'EXPENSE' ? 'Expenses' : 'Income';
  const ws = wb.addWorksheet(sheetName);

  // Title block.
  ws.getCell('A1').value = `${sheetName} Report`;
  ws.getCell('A1').font = { bold: true, size: 16 };
  ws.mergeCells('A1:C1');
  ws.getCell('A2').value = `${report.from} to ${report.to}`;
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };
  ws.mergeCells('A2:C2');

  // Embed pie chart PNG, if provided.
  let tableStartRow = 4;
  if (chartPng) {
    const buf = await chartPng.arrayBuffer();
    const imageId = wb.addImage({ buffer: buf, extension: 'png' });
    ws.addImage(imageId, { tl: { col: 0, row: 3 }, ext: { width: 400, height: 280 } });
    tableStartRow = 20;
  }

  // Header row.
  ws.getRow(tableStartRow).values = ['Category', 'Subcategory', 'Total'];
  ws.getRow(tableStartRow).font = { bold: true };
  ws.getRow(tableStartRow).border = { bottom: { style: 'thin' } };

  let r = tableStartRow + 1;
  for (const p of report.parents) {
    ws.getRow(r).values = [p.name, '', Number(p.total)];
    ws.getRow(r).font = { bold: true };
    r++;
    for (const c of p.children) {
      ws.getRow(r).values = ['', c.name, Number(c.total)];
      r++;
    }
  }

  if (Number(report.uncategorised) > 0) {
    ws.getRow(r).values = ['Uncategorised', '', Number(report.uncategorised)];
    ws.getRow(r).font = { italic: true, color: { argb: 'FF888888' } };
    r++;
  }

  // Total footer.
  ws.getRow(r).values = ['Total', '', Number(report.grandTotal)];
  ws.getRow(r).font = { bold: true };
  ws.getRow(r).border = { top: { style: 'thin' } };

  // Formatting.
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 16;
  ws.getColumn(3).numFmt = '"$"#,##0.00';

  const out = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${report.kind.toLowerCase()}-report-${report.from}-to-${report.to}.xlsx`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper to convert an SVG element into a PNG Blob via canvas.
export async function svgToPng(svgEl: SVGSVGElement, width = 800, height = 560): Promise<Blob> {
  const xml = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/export-excel.ts
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(reports/ui): exportReportToExcel — ExcelJS workbook with embedded chart

ExcelJS is dynamic-imported on call so it never enters the main bundle.
Workbook contains a title block, the pie chart as an embedded PNG, and
the data table with formatted currency totals. svgToPng helper converts
the rendered Recharts SVG to a PNG via canvas.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 5: Shared ReportPage + routes + sidebar

### Task 9: `<ReportPage>` shared client component

**Files:**
- Create: `frontend/components/reports/report-page.tsx`

- [ ] **Step 1: Write the page component**

```tsx
// frontend/components/reports/report-page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
import { motion } from "framer-motion";
import type { Account, ReportResponse } from "@/lib/types";
import { getExpenseReport, getIncomeReport } from "@/lib/reports";
import { CategoryPie, PIE_PALETTE } from "./category-pie";
import { TotalsTable } from "./totals-table";
import { AccountMultiSelect } from "./account-multi-select";
import { exportReportToExcel, svgToPng } from "@/lib/export-excel";

function fyStartDate(financialYearStart: number): string {
  const now = new Date();
  const y = now.getMonth() + 1 >= financialYearStart ? now.getFullYear() : now.getFullYear() - 1;
  const m = String(financialYearStart).padStart(2, '0');
  return `${y}-${m}-01`;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ReportPage({
  kind,
  accounts,
  prefs,
}: {
  kind: 'EXPENSE' | 'INCOME';
  accounts: Account[];
  prefs: { financialYearStart: number };
}) {
  const [from, setFrom] = useState(() => fyStartDate(prefs.financialYearStart));
  const [to, setTo] = useState(() => todayLocal());
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() => accounts.map((a) => a.id));
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Fetch whenever filters change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const fetcher = kind === 'EXPENSE' ? getExpenseReport : getIncomeReport;
    fetcher({ from, to, accountIds: selectedAccountIds })
      .then((r) => { if (!cancelled) { setReport(r); setSelectedParentId(null); } })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? 'Failed to load report'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, from, to, selectedAccountIds.join(',')]);

  const parentSlices = useMemo(() => {
    if (!report) return [];
    return report.parents.map((p) => ({ id: p.id, name: p.name, total: Number(p.total) }));
  }, [report]);

  const selectedParent = useMemo(() => {
    if (!selectedParentId || !report) return null;
    return report.parents.find((p) => p.id === selectedParentId) ?? null;
  }, [selectedParentId, report]);

  const childSlices = useMemo(() => {
    if (!selectedParent) return [];
    return selectedParent.children.map((c) => ({ id: c.id, name: c.name, total: Number(c.total) }));
  }, [selectedParent]);

  const drilldownColor = useMemo(() => {
    if (!selectedParentId) return undefined;
    const idx = parentSlices.findIndex((p) => p.id === selectedParentId);
    return PIE_PALETTE[idx % PIE_PALETTE.length];
  }, [selectedParentId, parentSlices]);

  async function onExport() {
    if (!report) return;
    const svg = chartContainerRef.current?.querySelector('svg');
    const png = svg ? await svgToPng(svg as SVGSVGElement, 800, 560) : null;
    await exportReportToExcel(report, png);
  }

  const title = kind === 'EXPENSE' ? 'Expense Report' : 'Income Report';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto max-w-6xl p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <Button variant="outline" size="sm" onClick={onExport} disabled={!report || loading}>
          <Download className="h-4 w-4" /> Export to Excel
        </Button>
      </div>

      <Card className="space-y-5 p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Date:</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <span className="text-slate-400">—</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Accounts:</span>
            <AccountMultiSelect accounts={accounts} selected={selectedAccountIds} onChange={setSelectedAccountIds} />
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Charts row */}
        <div ref={chartContainerRef} className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <CategoryPie
            title="By category"
            data={parentSlices}
            centerTotal={report ? Number(report.grandTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            onSelect={(id) => setSelectedParentId((prev) => prev === id ? null : id)}
          />
          {selectedParent && selectedParent.children.length > 0 ? (
            <CategoryPie
              title={`${selectedParent.name} subcategories`}
              data={childSlices}
              centerTotal={Number(selectedParent.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              baseColor={drilldownColor}
            />
          ) : (
            <div className="flex h-72 flex-col items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">
              <div>Click a category slice on the left</div>
              <div>to drill into its subcategories</div>
            </div>
          )}
        </div>

        <hr className="border-slate-100" />

        {/* Table */}
        {loading && <div className="py-12 text-center text-sm text-slate-400">Loading…</div>}
        {error && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        {report && !loading && <TotalsTable report={report} />}
      </Card>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/reports/report-page.tsx
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(reports/ui): ReportPage — shared client component

White Card chrome (matches edit-form pattern). Filter row with date
pickers + account multi-select. Charts row: left donut clickable to
drill into a subcategory donut on the right with derived hues from
the parent slice's color. Totals table below. Export button on the
page header.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 10: Route pages + sidebar nav update

**Files:**
- Create: `frontend/app/reports/expense/page.tsx`
- Create: `frontend/app/reports/income/page.tsx`
- Modify: `frontend/components/layout/sidebar.tsx`

- [ ] **Step 1: Find the existing accounts + preferences server-side fetchers**

```bash
grep -rnE "listAccounts|getPreferences" /home/reallybasic/Projects/Accounting/frontend/lib/ | head -5
```

Note the actual export names + paths.

- [ ] **Step 2: Write `app/reports/expense/page.tsx`**

```tsx
// frontend/app/reports/expense/page.tsx
import { ReportPage } from "@/components/reports/report-page";
import { listAccounts } from "@/lib/banking";       // adapt to actual path from Step 1
import { getPreferences } from "@/lib/preferences";  // adapt to actual path

export const dynamic = "force-dynamic";

export default async function Page() {
  const [accounts, prefs] = await Promise.all([
    listAccounts(),
    getPreferences().catch(() => ({ financialYearStart: 7 })),
  ]);
  return <ReportPage kind="EXPENSE" accounts={accounts.filter((a: any) => a.isActive !== false)} prefs={{ financialYearStart: prefs.financialYearStart ?? 7 }} />;
}
```

- [ ] **Step 3: Write `app/reports/income/page.tsx`**

```tsx
// frontend/app/reports/income/page.tsx
import { ReportPage } from "@/components/reports/report-page";
import { listAccounts } from "@/lib/banking";       // adapt
import { getPreferences } from "@/lib/preferences";  // adapt

export const dynamic = "force-dynamic";

export default async function Page() {
  const [accounts, prefs] = await Promise.all([
    listAccounts(),
    getPreferences().catch(() => ({ financialYearStart: 7 })),
  ]);
  return <ReportPage kind="INCOME" accounts={accounts.filter((a: any) => a.isActive !== false)} prefs={{ financialYearStart: prefs.financialYearStart ?? 7 }} />;
}
```

If `getPreferences` doesn't exist, inline a fetch via the api client. If `Preferences` doesn't expose `financialYearStart` via the existing client, hardcode `7` (Australian fiscal year July start) and note it as a follow-up.

- [ ] **Step 4: Update the sidebar nav**

In `frontend/components/layout/sidebar.tsx`, locate the existing Reports group (around line 68-73). It currently contains only `{ label: "Statements", href: "/statements" }`. Update its `items` array to:

```typescript
items: [
  { label: "Expense Report", href: "/reports/expense" },
  { label: "Income Report", href: "/reports/income" },
  { label: "Statements", href: "/statements" },
],
```

Add the `defaultOpen: true` flag to the Reports group so it's expanded by default (other top-level domain groups have this).

In the `subIcons` map (around line 77-85), add:
```typescript
"/reports/expense": ChartBar,  // reuse the Reports group icon
"/reports/income": ChartBar,
```

(If `ChartBar` isn't already imported, check the existing imports at the top of the file.)

- [ ] **Step 5: Rebuild + run + visual verify**

```bash
docker compose build frontend && docker compose up -d frontend
sleep 5
```

Open `http://localhost:3000/reports/expense` and `http://localhost:3000/reports/income` in Playwright. Verify:
- Sidebar Reports group shows both new entries plus Statements.
- Page renders inside a white Card.
- Date inputs pre-fill to fiscal-year-to-date.
- Account pills show all accounts pre-selected.
- Left donut renders with slice for each parent category (or empty-state if no transactions).
- Clicking a parent slice opens the right donut with subcategory breakdown.
- Table below renders parents bold + children indented with `↳`.
- Total row at the bottom matches grand total.
- Export to Excel button downloads a .xlsx file — open it to confirm the chart image and data table.

Screenshots:
- `screenshots/reports-expense.png` (default view, both donuts visible after a slice click)
- `screenshots/reports-income.png` (same for income)

- [ ] **Step 6: Commit**

```bash
git add frontend/app/reports/ frontend/components/layout/sidebar.tsx
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(reports): /reports/expense and /reports/income pages + sidebar nav

Both server pages load accounts + preferences then hand to the shared
ReportPage with kind=EXPENSE/INCOME. Sidebar Reports group now lists
Expense Report, Income Report, Statements — defaultOpen so it expands
on first load.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 6: Documentation

### Task 11: Update CLAUDE.md, Architecture.md, modules_and_logic.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `Architecture.md`
- Modify: `modules_and_logic.md`

- [ ] **Step 1: Append to CLAUDE.md "Known gotchas"**

```markdown
- **Reports endpoints use raw SQL because Prisma's typed `groupBy` cannot compose with `COALESCE` over a joined column.** `ReportsService.getReport` builds a parameterized `Prisma.sql` template — `from`/`to`/`accountIds` are validated by the DTO before hitting the query so SQL injection isn't possible, but **any new filter must use the `Prisma.sql` template-literal form, never string concatenation**.
- **Date-range filters use `localStartOfDay` / `localEndOfDay` from `backend/src/util/dates.ts`.** `new Date("YYYY-MM-DD")` parses as UTC midnight which rolls back a day in positive-offset zones (Perth +08:00). Reports and any future date-range query MUST go through these helpers, passing the user's timezone from `Preferences.timezone`.
- **`exceljs` is dynamic-imported on the Export click in `frontend/lib/export-excel.ts`.** It must NEVER be statically imported anywhere — it adds ~700KB to the main bundle. The pattern `const ExcelJS = (await import('exceljs')).default;` keeps it out.
- **Recharts donut slice click handlers receive the data object (`entry`), not an event.** When binding `onClick={(entry: any) => onSelect(entry.id)}`, the `id` must be a field on each pie data object — Recharts forwards the whole row.
```

- [ ] **Step 2: Append to Architecture.md endpoint list / add a Reports subsection**

Locate the section that lists backend modules (the one with `accounts`, `transactions`, `payments`, etc.). Add:

```markdown
- `reports` — **(2026-05-26)** Expense + income totals grouped by parent category. Route prefix `/reports`. Two endpoints — `GET /reports/expense`, `GET /reports/income`. Both return `{ parents: [{ id, name, total, children: [...] }], uncategorised, grandTotal }`. Single raw-SQL `COALESCE(parentId, id)` GROUP BY since Prisma's typed groupBy doesn't compose with COALESCE over a joined column. Date boundaries respect the user's timezone via `localStartOfDay` / `localEndOfDay` (in `backend/src/util/dates.ts`). Sign convention: expense sums ABS(amount) for negative-sided rows on EXPENSE-kind categories; income sums positive-sided on INCOME-kind. Uncategorised transactions of the matching sign are bucketed into a separate row.
```

- [ ] **Step 3: Append to modules_and_logic.md**

Locate the Reports section (or, if none exists, add a new top-level section near Banking). Document:

```markdown
### Reports — `/reports/expense`, `/reports/income`

Two report pages, same shape and code path, differing only on the category-kind filter. Both render inside a single white Card matching the edit-form chrome.

**Filters (top of the card):**
- Date range: two `<Input type="date">` fields. Defaults to financial-year-to-date based on `Preferences.financialYearStart`.
- Accounts: pill-style multi-select with checkbox popover. All accounts pre-selected.

**Charts (middle of the card):**
- **Left donut**: category totals across all selected accounts in the period. Clickable. Center label shows grand total.
- **Right donut**: appears when a left-donut slice is clicked. Shows that category's subcategory totals. Hues are 5 lighter shades derived from the parent slice's base color so the visual grouping is preserved. Click the left slice again to deselect / hide the drill-down.

**Table (bottom of the card):**
Two columns — Category, Total. Parents in bold; children indented with a `↳` leading glyph. Uncategorised row in italic slate if non-zero. Bold "Total" footer with a top border.

**Export to Excel:** Top-right of the page header. Dynamic-imports ExcelJS, rasterizes the left donut SVG to a PNG, builds a workbook with title + period + embedded chart + data table with `$#,##0.00` formatting.

**Out of scope (v1):** P&L, dashboard tile, PDF export, comparison mode, saved date-range presets, refunds / reverse-charges sign handling.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md Architecture.md modules_and_logic.md
git -c commit.gpgsign=false commit -m "$(cat <<'EOF'
docs: expense + income reports module

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 7: End-to-end verification

### Task 12: Full stack smoke + persistence check

- [ ] **Step 1: Verify all backend tests still pass**

```bash
docker exec simplebooks-backend-1 npx jest --colors=false 2>&1 | tail -10
```

Expected: 95 tests pass (92 previous + 3 new for reports).

- [ ] **Step 2: Smoke check both endpoints**

```bash
curl -sS "http://localhost:4000/reports/expense?from=2026-04-01&to=2026-05-31" | python3 -m json.tool | head -30
curl -sS "http://localhost:4000/reports/income?from=2026-04-01&to=2026-05-31" | python3 -m json.tool | head -30
```

Expected: both return well-formed JSON with parents/uncategorised/grandTotal.

- [ ] **Step 3: Browser walkthrough**

Open `/reports/expense` in Playwright. Confirm:
1. Renders inside white card.
2. Date pickers default to FY-to-date.
3. Account chips show all accounts pre-selected.
4. Left donut has clickable slices.
5. Clicking a parent slice opens the right donut.
6. Table renders correctly with parents/children.
7. Total row matches grand total.
8. Removing an account chip re-fetches and updates pies + table.
9. Changing the date range re-fetches.
10. Clicking Export to Excel downloads a file.

Save final screenshots to `screenshots/reports-expense.png` and `screenshots/reports-income.png`.

- [ ] **Step 4: Final commit only if cleanup needed**

If any small polish needed (typos, console.logs), one final commit:

```bash
git add -p
git commit -m "polish: report E2E findings"
```

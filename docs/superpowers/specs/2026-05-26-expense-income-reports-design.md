# Expense + Income Reports — Design

> **Status:** approved design, ready for plan
> **Date:** 2026-05-26
> **Author:** brainstormed with Claude
> **Predecessors:** Category subcategories + AI provenance + AI provider enable toggle (2026-05-25)
> **Successor (not planned yet):** P&L (Income − Expense single view), dashboard "spend by category" tile.

## Goal

Two new report pages — `/reports/expense` and `/reports/income` — that show transaction totals grouped by category (with parents rolling up subcategories), filtered by date range and selected accounts. Each page has a pie chart (donut) of category totals, a drill-down pie chart of subcategory totals when a parent slice is clicked, and a detailed table below. Both pages export to a well-formatted Excel file (chart + table).

Same shape, same code path, the only difference is `kind: 'EXPENSE'` vs `'INCOME'` on the category filter.

## Non-goals (v1)

- **No P&L** (income − expense in one view). Separate brainstorm later — it has period-semantics, fiscal-year-aware totals, and net-income calculation that deserve their own design.
- **No dashboard tile**. Separate task.
- **No PDF export**. Excel only.
- **No saved date-range presets** ("Last month", "Last quarter"). v1 has plain pickers.
- **No comparison mode** (this period vs last period). Single-period only.
- **No grouping by other dimensions** (vendor, account, tax-type). Category-first only — vendor/account breakdowns can be future reports.
- **No real-time updates**. Page loads → renders the snapshot.

## Architecture

Three concerns, three layers. Backend computes the totals as a single Prisma query joined to Category, grouped by `COALESCE(category.parentId, category.id)`. The shape is "list of parents, each with a list of children" so the frontend doesn't have to do tree-building. Frontend renders a donut chart for parent totals; clicking a slice swaps a secondary donut showing that parent's children. The Excel export is a client-side ExcelJS workbook built on the same data the page already loaded — the pie chart is rasterized via the Recharts `toImage` helper and embedded as a PNG.

Charting library: **Recharts** (~200KB minified). Already the de-facto React charting choice and supports `onClick` on Pie segments. The existing `revenue-chart.tsx` is hand-rolled SVG — fine for one chart, but reports need clickable slices and consistent palettes, so we adopt Recharts and leave the existing chart as is.

Excel library: **ExcelJS** (~700KB but dynamic-imported only on the Export click, so it never enters the main bundle). Supports embedded images (the pie chart PNG) and rich number formatting.

## Tech stack

No backend dependencies. Frontend gains two npm packages: `recharts`, `exceljs`. Both standalone, no peer-dep churn.

---

## 1. Schema changes

**None.** Reports query existing tables (`Transaction`, `Category`, `Account`).

A categorisation invariant we rely on: every `Transaction.categoryId` (when not null) points at a **leaf** category (`children.count == 0`). Enforced by `TransactionsService.setCategory`, `RulesService.assertCategoryIsLeaf`, and `setSplits` (all landed in the previous phase). So when we group transactions by `COALESCE(c.parentId, c.id)`, we get either a parent ID (for txns categorised under a leaf-with-parent) or a top-level leaf's own ID. Uncategorised transactions (categoryId null) get bucketed into a synthetic "Uncategorised" row.

---

## 2. API surface

### `GET /reports/expense`
### `GET /reports/income`

Both endpoints use the same handler with a `kind` parameter set internally. Identical query string + response shape.

**Query string:**

| Param | Type | Required | Notes |
|---|---|---|---|
| `from` | ISO date `YYYY-MM-DD` | yes | Inclusive lower bound on `Transaction.date` |
| `to` | ISO date `YYYY-MM-DD` | yes | Inclusive upper bound |
| `accountIds` | comma-separated UUIDs | no | If omitted, query covers all active accounts. If empty string, returns zero-state response |

**Response:**

```json
{
  "kind": "EXPENSE",
  "from": "2026-05-01",
  "to": "2026-05-31",
  "accountIds": ["uuid1", "uuid2"],
  "parents": [
    {
      "id": "uuid-banking",
      "name": "Banking",
      "total": "234.50",
      "children": [
        { "id": "uuid-bank-fees", "name": "Bank Fees", "total": "112.00" },
        { "id": "uuid-overdraft", "name": "Overdraft Fees", "total": "45.00" }
      ]
    },
    {
      "id": "uuid-rent",
      "name": "Rent",
      "total": "5000.00",
      "children": []
    }
  ],
  "uncategorised": "120.00",
  "grandTotal": "5354.50"
}
```

Notes:
- `total` is a string (Prisma Decimal → JSON string convention, same as Invoice money fields).
- `children: []` for top-level leaves (categories with no children). The frontend renders these the same as parents-with-children but the drill-down pie is empty/disabled on click.
- `uncategorised` is the sum of `Transaction.amount` for rows with `categoryId IS NULL` (and matching account + date filters and the implicit kind: for /expense it's negative amounts that don't match any income category; we use the **transaction sign convention** — see §3.4 below).
- All amounts are non-negative. The service flips signs internally so the report shows positive expense totals.
- Empty period or no matching transactions: `parents: []`, `uncategorised: "0.00"`, `grandTotal: "0.00"`. The frontend renders an empty-state.

### Date handling

`from` and `to` are date-only strings (`YYYY-MM-DD`). The service interprets both as **local calendar dates** in the user's timezone (`Preferences.timezone`, default `Australia/Perth`) — never UTC. This is the same hazard documented in CLAUDE.md for the auto Due Date helper: `new Date("2026-05-01")` parses as UTC midnight, which in a positive-offset zone falls on the previous day. The service must convert via a `localStartOfDay(date, tz)` / `localEndOfDay(date, tz)` helper before passing to Prisma. Reuse the existing helper from `frontend/components/invoices/invoice-form.tsx` if it has a backend counterpart; otherwise lift it into `backend/src/util/dates.ts`.

### Sign convention (§3.4)

Bank transactions store signed amounts: positive for deposits (income-side), negative for withdrawals (expense-side). The `EXPENSE` report sums `ABS(transaction.amount)` for transactions whose linked category has `kind = 'EXPENSE'`. The `INCOME` report sums `transaction.amount` (positive only) for `kind = 'INCOME'`.

For uncategorised transactions:
- `/reports/expense?...` includes `ABS(amount)` for uncategorised transactions where `amount < 0`.
- `/reports/income?...` includes `amount` for uncategorised transactions where `amount > 0`.

Refunds (negative-amount on income category) and reverse-charges (positive-amount on expense category) are out of scope — they're rare in our seeded data and the SQL would need to handle bi-directional contributions. Future improvement.

---

## 3. Backend module — `reports`

### Files

- `backend/src/reports/reports.module.ts`
- `backend/src/reports/reports.controller.ts`
- `backend/src/reports/reports.service.ts`
- `backend/src/reports/dto.ts`
- `backend/src/reports/reports.service.spec.ts`

Wire `ReportsModule` in `app.module.ts`.

### DTO

```typescript
export class ReportQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsString() accountIds?: string;  // comma-separated UUIDs
}
```

The controller splits `accountIds` on `,`, trims, validates each is a UUID. Empty array → return zero-state. Missing param → all accounts.

### Service

```typescript
async getReport(kind: 'EXPENSE' | 'INCOME', q: ReportQueryDto): Promise<ReportResponse> {
  const accountIds = parseAccountIds(q.accountIds);
  const where = {
    date: { gte: new Date(q.from), lte: new Date(q.to) },
    ...(accountIds ? { accountId: { in: accountIds } } : {}),
  };

  // Categorised transactions, grouped by COALESCE(parentId, id).
  // Single Prisma raw query because Prisma's groupBy doesn't support COALESCE on joined columns.
  const rows = await this.prisma.$queryRaw<Array<{
    rollupId: string;
    leafId: string;
    leafName: string;
    parentName: string | null;
    total: Prisma.Decimal;
  }>>`
    SELECT
      COALESCE(c."parentId", c."id") AS "rollupId",
      c."id" AS "leafId",
      c."name" AS "leafName",
      p."name" AS "parentName",
      SUM(CASE WHEN ${kind === 'EXPENSE' ? Prisma.sql`t."amount" < 0` : Prisma.sql`t."amount" > 0`}
           THEN ABS(t."amount") ELSE 0 END) AS "total"
    FROM "Transaction" t
    JOIN "Category" c ON c."id" = t."categoryId"
    LEFT JOIN "Category" p ON p."id" = c."parentId"
    WHERE t."date" BETWEEN ${new Date(q.from)} AND ${new Date(q.to)}
      AND c."kind" = ${kind}::"CategoryKind"
      ${accountIds ? Prisma.sql`AND t."accountId" = ANY(${accountIds}::uuid[])` : Prisma.empty}
    GROUP BY "rollupId", c."id", c."name", p."name"
    HAVING SUM(CASE WHEN ${kind === 'EXPENSE' ? Prisma.sql`t."amount" < 0` : Prisma.sql`t."amount" > 0`}
                     THEN ABS(t."amount") ELSE 0 END) > 0
  `;

  // Build the nested response shape from the flat rows.
  // ... (assemble parents + children arrays, sort by total desc within each level)

  // Uncategorised: separate query.
  const uncatRow = await this.prisma.$queryRaw<[{ total: Prisma.Decimal }]>`
    SELECT COALESCE(SUM(CASE WHEN ${kind === 'EXPENSE' ? Prisma.sql`t."amount" < 0` : Prisma.sql`t."amount" > 0`}
                              THEN ABS(t."amount") ELSE 0 END), 0) AS "total"
    FROM "Transaction" t
    WHERE t."categoryId" IS NULL
      AND t."date" BETWEEN ${new Date(q.from)} AND ${new Date(q.to)}
      ${accountIds ? Prisma.sql`AND t."accountId" = ANY(${accountIds}::uuid[])` : Prisma.empty}
  `;

  return assembled;
}
```

The raw SQL is necessary because Prisma's typed `groupBy` doesn't compose with `COALESCE(parentId, id)` over a joined column. Risk: SQL injection if `q.from / q.to / accountIds` aren't validated — the DTO + the UUID array validation in the controller prevent that.

### Controller

```typescript
@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('expense')
  expense(@Query() q: ReportQueryDto) { return this.service.getReport('EXPENSE', q); }

  @Get('income')
  income(@Query() q: ReportQueryDto) { return this.service.getReport('INCOME', q); }
}
```

### Tests

`backend/src/reports/reports.service.spec.ts`:
- Returns zero-state for empty period.
- Sums multiple transactions under the same leaf correctly.
- Rolls up child totals into the parent row.
- Top-level leaves (no parent, no children) appear in `parents[]` with `children: []`.
- `kind` filter excludes opposite-side categories.
- `accountIds` filter excludes other accounts.
- `uncategorised` totals only count null-categoryId transactions of the correct sign.

---

## 4. Frontend

### Routes

- `app/reports/expense/page.tsx` (server component) — fetches `Preferences` for the FY-start default + `Account[]` for the multi-select, then hands to client component.
- `app/reports/income/page.tsx` — same, but `kind="INCOME"`.

Each is a thin wrapper:

```tsx
export default async function Page() {
  const [accounts, prefs] = await Promise.all([listAccounts(), getPreferences()]);
  return <ReportPage kind="EXPENSE" accounts={accounts} prefs={prefs} />;
}
```

### Sidebar

`components/layout/sidebar.tsx` — locate the existing nav array. Add a new group above "Settings":

```typescript
{ kind: 'group', label: 'Reports', items: [
  { label: 'Expense Report', href: '/reports/expense' },
  { label: 'Income Report', href: '/reports/income' },
]}
```

Group icon: `ChartPie` (Phosphor) — matches the chart-centric content.

### Shared `<ReportPage>` component

`components/reports/report-page.tsx` ("use client"):

Props: `{ kind: 'EXPENSE' | 'INCOME'; accounts: Account[]; prefs: { financialYearStart: number } }`.

State:
- `from`, `to` (date strings) — initialised to FY-to-date.
- `selectedAccountIds` — initialised to all accounts.
- `selectedParentId` — null by default; set when a slice on the left donut is clicked.
- `report` — the fetched response.
- `loading` — for the fetch spinner.

Page chrome: matches the project's edit-form pattern (`EditPageChrome` is for editable forms with Save buttons, so we don't use it directly here — instead match the same visual chrome: page padding, framer-motion entry, white Card holding the content).

Layout sketch (mobile-first; the project supports 375 viewport):

```
┌─────────────────────────────────────────────────────────────┐
│ Expense Report                          [⤓ Export to Excel]  │ ← page header
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Filters row                                             │ │
│ │ [Date: from — to]    [Accounts: Cheque ✕ Savings ✕ +]   │ │
│ │                                                          │ │
│ │ ────────────── (divider) ──────────────                 │ │
│ │                                                          │ │
│ │ ┌───────────────┐    ┌───────────────┐                  │ │
│ │ │ All categories │    │ Banking       │ ← second pie     │ │
│ │ │ (donut)        │    │ subcategories │   only when a    │ │
│ │ │  $3,434.50     │    │  $2,234.50    │   parent is      │ │
│ │ │  center label  │    │  center label │   selected       │ │
│ │ └───────────────┘    └───────────────┘                  │ │
│ │                                                          │ │
│ │ ────────────── (divider) ──────────────                 │ │
│ │                                                          │ │
│ │ Detailed table                                           │ │
│ │ (parents bold, children indented with ↳)                 │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

All content lives inside a single `<Card>` per the user's "white card like edit-invoice" directive.

On mobile (<md): pies stack vertically, drill-down pie appears below the all-categories pie.

### Pie chart — `components/reports/category-pie.tsx`

Wraps Recharts `<PieChart>` with consistent styling. Donut (innerRadius 50%, outerRadius 80%). 8-color palette cycling for top-level slices. When `selectedParentId` is set, the drill-down pie uses 5 shades of the parent's color (lightest → darkest as you go around) to visually nest.

Centerlabel renders the segment's name + amount on hover.

`onClick` on a slice fires `onSelectParent(parentId)` from the parent component. Clicking the same slice again deselects (toggles the drill-down off).

Colors palette (matches the project's accent palette — indigo-, slate-, emerald-, amber-, rose-, sky-, violet-, teal-):
```
['#4F46E5', '#475569', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#8B5CF6', '#14B8A6']
```

Tooltip on hover shows the percentage of total (e.g. "Banking 68.5%").

### Totals table — `components/reports/totals-table.tsx`

Simple 2-column table (`Category | Total`) inside the same Card. No borders, just row separators. Parents have bold name + emphasized total. Children have a `pl-8` indent + a `↳` leading glyph + regular weight. Footer row: bold "Total" with the grand total.

If `uncategorised > 0`, a dimmed-slate "Uncategorised" row appears between the last category and the Total footer.

No interactivity required — pure presentation.

### Filters

- **Date range:** two `<Input type="date">` fields. On change, refetch the report. Default: financial-year-to-date (`new Date(currentYear, prefs.financialYearStart - 1, 1)` → today).
- **Accounts:** pill-style multi-select. Each selected account renders as a chip with an ✕. A "+" button opens a popover with checkboxes for every active account. All-selected by default.

### Excel export

`lib/export-excel.ts`:

```typescript
export async function exportReportToExcel(report: ReportResponse, chartPng: Blob, kind: 'EXPENSE'|'INCOME') {
  const ExcelJS = (await import('exceljs')).default;  // dynamic import
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${kind === 'EXPENSE' ? 'Expenses' : 'Income'}`);

  // Title
  ws.getCell('A1').value = `${kind === 'EXPENSE' ? 'Expense' : 'Income'} Report`;
  ws.getCell('A1').font = { bold: true, size: 16 };
  ws.getCell('A2').value = `${report.from} to ${report.to}`;
  ws.mergeCells('A1:C1');

  // Embed pie chart PNG (cells A4..F20-ish)
  const imageId = wb.addImage({ buffer: await chartPng.arrayBuffer(), extension: 'png' });
  ws.addImage(imageId, 'A4:F22');

  // Data table starts at row 24
  ws.getRow(24).values = ['Category', '', 'Total'];
  ws.getRow(24).font = { bold: true };
  let r = 25;
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
  ws.getRow(r).values = ['Total', '', Number(report.grandTotal)];
  ws.getRow(r).font = { bold: true };
  ws.getRow(r).border = { top: { style: 'thin' } };

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).numFmt = '"$"#,##0.00';
  ws.getColumn(3).width = 14;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, `${kind.toLowerCase()}-report-${report.from}-to-${report.to}.xlsx`);
}
```

To get the chart PNG: `<CategoryPie ref={chartRef}>` exposes a `toPng()` method that uses Recharts' `<PieChart>` → SVG → canvas → PNG blob. Library `recharts-to-png` or a 30-line hand-roll.

### Files

| Path | Purpose |
|---|---|
| `backend/src/reports/reports.module.ts` | Nest module |
| `backend/src/reports/reports.controller.ts` | Two GET routes |
| `backend/src/reports/reports.service.ts` | Single `getReport(kind, q)` method |
| `backend/src/reports/dto.ts` | `ReportQueryDto` |
| `backend/src/reports/reports.service.spec.ts` | Jest specs |
| `frontend/app/reports/expense/page.tsx` | server entry, kind=EXPENSE |
| `frontend/app/reports/income/page.tsx` | server entry, kind=INCOME |
| `frontend/components/reports/report-page.tsx` | shared client component |
| `frontend/components/reports/category-pie.tsx` | Recharts pie wrapper |
| `frontend/components/reports/totals-table.tsx` | the detailed table |
| `frontend/components/reports/account-multi-select.tsx` | pill multi-select |
| `frontend/lib/reports.ts` | client `getExpenseReport`, `getIncomeReport` |
| `frontend/lib/export-excel.ts` | ExcelJS workbook builder + download trigger |

### Sidebar nav update

`frontend/components/layout/sidebar.tsx`: add the Reports group, position above Settings.

---

## 5. Dependencies (frontend `package.json`)

Add:
```json
"recharts": "^2.13.0",
"exceljs": "^4.4.0"
```

ExcelJS is dynamic-imported in `export-excel.ts` so it never enters the main bundle. Recharts is bundled normally — `~200KB` minified, gzipped well under that.

No backend dependency changes.

---

## 6. Testing

**Backend (jest):**
- Zero-state period (no transactions in range) returns `parents: []`, `uncategorised: "0.00"`, `grandTotal: "0.00"`.
- Two leaf categories under the same parent roll up correctly (parent total = sum of children).
- Top-level leaf (no parent, no children) appears in `parents[]` with `children: []`.
- `kind` filter: INCOME-categorised transactions don't appear in `/expense` report.
- `accountIds` filter excludes other accounts.
- Uncategorised transactions with the correct sign are counted in `uncategorised`.
- Same query run twice produces identical output (deterministic ordering by total desc).

**Frontend:** manual Playwright verification per project convention (no frontend test suite). Specifically:
- Page loads with FY-to-date defaults.
- Pie renders with correct slice sizes proportional to totals.
- Clicking a parent slice opens the subcategory pie on the right.
- Clicking the same slice again hides the subcategory pie.
- Adjusting the date range re-fetches.
- Removing/adding an account chip re-fetches.
- "Export to Excel" button downloads a valid .xlsx with the chart image + data table + formula totals.

---

## 7. Acceptance criteria

A successful v1 ships when:

1. Sidebar shows a "Reports" group with "Expense Report" and "Income Report" entries.
2. Both pages render with date pickers defaulted to financial-year-to-date and all accounts pre-selected.
3. The left donut shows category totals; clicking a parent slice opens the right donut showing that parent's subcategory totals.
4. The table below the pies shows parents in bold with their rolled-up totals, children indented under their parent, an Uncategorised row if applicable, and a Total footer.
5. Changing date range or account selection re-fetches and re-renders both pies and the table.
6. "Export to Excel" downloads a .xlsx that opens cleanly in Excel/Numbers/Sheets and contains: the title + period, the embedded chart, and the data table with `$` formatted totals.
7. Backend tests at §6 all pass.
8. Docs updated: `Architecture.md` mentions the new `/reports` endpoints; `modules_and_logic.md` documents the report pages and the chart/table conventions; `CLAUDE.md` notes the new dependencies (recharts, exceljs) and the dynamic-import pattern for ExcelJS.

---

## 8. Open questions resolved

- **P&L included?** No — v1 ships Expense + Income only. P&L gets a dedicated future spec.
- **PDF export?** No — Excel only.
- **Dashboard tile?** No — separate future task.
- **Comparison mode (period vs period)?** No — single-period.
- **Saved date-range presets?** No — plain pickers.
- **Charting library?** Recharts. React-native, supports click events.
- **Excel library?** ExcelJS. Embedded images + rich formatting.
- **Bundling concern?** ExcelJS dynamic-imported at click time.
- **Refunds / reverse charges (negative income / positive expense)?** Out of scope — rare in our data; future improvement.

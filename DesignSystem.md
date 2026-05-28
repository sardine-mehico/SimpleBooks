# DesignSystem — SimpleBooks

Reference for every page and component. Read before touching UI.

## Palette
- Page background: `#EDEEF3` — applied to `html`, `body`, and `<main>`
- Sidebar background: `#323D59` (deep navy)
- Surface: `white` (#FFFFFF)
- Border: `slate-200` (#E2E8F0) — 1px, never heavy shadow
- Text primary: `slate-900` (#0F172A)
- Text secondary: `slate-500` (#64748B)
- Text tertiary: `slate-400` (#94A3B8)
- On-dark text (sidebar idle): `slate-300` (#CBD5E1)
- On-dark text (sidebar active): `white`
- On-dark divider / hover: `white/10`, `white/[0.06]`
- Accent (active, links, focus): `indigo-600` (#4F46E5)
- Accent soft: `indigo-50` (#EEF2FF)
- Positive: `emerald-600` / `emerald-50`
- Warning: `amber-600` / `amber-50`
- Danger: `rose-600` / `rose-50`

## Typography
- Font: **Noto Sans** (variable), loaded via `next/font/google` and exposed as `--font-noto-sans` → `font-sans`.
- Numbers / tabular columns: system mono stack (`ui-monospace`, `SFMono-Regular`, `Menlo`, `monospace`) combined with `tabular-nums`.
- Display (page titles): 28px / 600 / -0.02em tracking
- Section title: 16px / 600
- Card label: 13px / 500 / slate-500
- Card value: 24px / 600 / tabular-nums
- Body: 14px / 400
- Caption: 12px / 500 / slate-500

## Radii
- Cards, Dialog, page-level containers: **0.5rem** (`rounded-lg`)
- Buttons: **0.3rem** (`rounded-[0.3rem]`)
- Form fields (Input, Textarea, Select trigger, top search): **0.3rem** (`rounded-[0.3rem]`)
- Badges / pills: `rounded-full`
- Sidebar nav items: `rounded-lg` (top-level), `rounded-md` (sub-items)

## Spacing — 4px grid
Use only multiples of 4: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
Card padding: 20px. Card gap: 16px. Section gap: 24px.

## Components
- **Card**: white bg, 1px slate-200 border, 0.5rem radius, 20px padding, no shadow.
- **StatCard**: label (caption) + value (24px) + delta pill (12px, emerald/rose soft). 0.5rem radius.
- **Badge**: 11px / 500 uppercase, 4px Y / 8px X padding, 9999px radius.
  - Pending: amber-50 / amber-700
  - In progress: indigo-50 / indigo-700
  - Completed / Paid: emerald-50 / emerald-700
  - Partial paid (Phase D): amber-50 / amber-900 (`bg-amber-50 text-amber-900 ring-amber-200`) — a distinct **`partial`** tone in `lib/types.ts`'s `STATUS_TONE` map, deliberately darker than `pending` (amber-700) so the two adjacent invoice states (`SENT` vs `PARTIAL_PAID`) read differently in the list. SENT and PAID tones are unchanged.
  - Cancelled / Void: slate-100 / slate-600
  - Overdue: rose-50 / rose-700
  - Failed to send: rose-50 / rose-700 (reuses the overdue tone)
  - Draft: slate-100 / slate-600
- **Buttons** — text is always **`text-sm` (14px / 500)** regardless of size variant. Only the height/padding changes between sizes: `default` (h-9, px-3.5), `sm` (h-8, px-3), `lg` (h-10, px-4), `icon` (h-9, w-9). Radius `0.3rem` for every variant.
- **Button (primary)**: indigo-600 bg, white text, 8px Y / 14px X padding.
- **Button (ghost)**: slate-700 text, hover slate-100 bg.
- **Button (outline)**: 1px slate-200 border, white bg, slate-700 text.
- **Button (danger)**: rose-600 bg, white text.
- **Input / Textarea / Select trigger**: 1px slate-200, focus ring indigo-600/20 + indigo-300 border, 0.3rem radius, 8px Y / 12px X.
- **Sidebar item (top-level)**: 14px / 500, 8px Y / 12px X, `rounded-lg`.
  - Idle: `text-slate-300`, icon `text-slate-400`, hover `bg-white/[0.06]` + `text-white`.
  - Active: `bg-white/10` + `text-white`, icon `text-white`.
- **Sidebar item (sub-nav)**: 15px, 6px Y / 10px X, `rounded-md`. **Text is always `text-slate-300`** across idle / hover / active — distinction comes from background only.
  - Idle: `text-slate-300`, icon `text-slate-300/80`, hover `bg-white/[0.04]`.
  - Active: `text-slate-300` + `bg-white/10`, icon `text-white`.
- **Sidebar dividers**: `border-white/10` on right edge and sub-nav left rail.

- **Filter Panel** (used on every list page above the table):
  - Container: `Card` with `bg-[rgb(212_215_225_/_79%)]`, 16px padding, 16px bottom margin.
  - Header: "Filter & Search" (14px / 600 / slate-900) on the left, close X on the right (slate-400, hover slate-200/60 bg + slate-700).
  - Field grid: `grid-cols-1 md:grid-cols-3`, 12px gap. Each field is a `<Field>` with label above input.
  - Field types: `text` (Input) or `select` (Select with synthetic `__all__` first option labeled "All").
  - "Clear all" ghost button appears only when at least one filter is active.
  - Trigger button (in the page action bar): `Button variant="outline"` with `Filter` icon, optional indigo pill showing active count.

- **List Table pagination** (applies to every list page):
  - Page size: **100 rows per page** (`DEFAULT_PAGE_SIZE` exported from `components/data/list-table.tsx`).
  - Pagination control rendered at the bottom of the table card. Footer is always rendered when there is at least one row — single-page results show "Showing N of N".
  - Controls: Prev / Page X of Y / Next, disabled at boundaries. Compact (h-7, 12px font).
  - Page resets to 1 on filter change or sort change.
  - Bespoke list components (e.g. `tasks-board.tsx`) that don't use `<ListTable>` must replicate the same `<Pagination>` component and `DEFAULT_PAGE_SIZE` constant — single source of truth.

- **List Table sorting** (applies to every list page rendered via `ListTable` / `FilteredList`):
  - **Every meaningful column is sortable.** Each `<Column>` definition must include a `sortValue` callback returning the value to sort by (`string | number | boolean | Date`). Columns that only render actions (delete/edit buttons) omit it.
  - **Sort icon in the header**, always rendered for sortable columns:
    - Idle: `ChevronsUpDown` from `lucide-react`, `h-3 w-3 text-slate-300`.
    - Active ascending: `ChevronUp`, `text-slate-700`.
    - Active descending: `ChevronDown`, `text-slate-700`.
  - **Header interaction:** click toggles direction; clicking a different column resets to ascending. Headers are also keyboard-activatable (Enter / Space).
  - **Default sort rule for any list that has an `isActive` (or equivalent) boolean column:**
    - `defaultSort = { key: "status", direction: "asc" }` (booleans compare `true` < `false`, so active rows render first).
    - `tieBreakerKey = "name"` (or the natural human-readable identifier) — active rows are sub-sorted alphabetically, inactive rows beneath them are sub-sorted the same way.
  - **Lists without an active/inactive concept** pick a sensible primary sort (Invoices: `num` desc — most recent first; Tasks: bespoke board so doesn't apply).
  - **Single source of truth:** `<FilteredList>` accepts `defaultSort` + `tieBreakerKey` and passes them through to `<ListTable>`. Module-specific list wrappers (`customers-list.tsx`, `companies-list.tsx`, etc.) must set both props.

## Motion
Framer Motion. Page entry: fade + 20px slide-up, 280ms, cubic-bezier(0.22, 1, 0.36, 1). Stagger children by 40ms.

## Layout
- Sidebar fixed **240px**, `#323D59`, no right border (dark navy reads as its own boundary against the `#EDEEF3` page).
- Top bar 64px, white, 1px bottom slate-200 border, contains search + bell.
- Main: max-w none, 32px horizontal padding, 24px vertical, bento grid (12 col, 16px gap).

## Edit page chrome
Every edit page (Invoices, Customers, Billing Companies, Items, Tasks, Recurring Invoices) shares a single header pattern rendered by [components/layout/edit-page-chrome.tsx](frontend/components/layout/edit-page-chrome.tsx) — page padding `px-6 py-6 md:px-8 md:py-8`, framer-motion entry, and a sticky-feeling top row:

```
[← Back]  <Title>                  [Cancel] [Edit?] [Save] [<rightActions>]
```

- **Back button** — `ArrowLeft` icon, square `h-9 w-9` outline button. Always navigates to the matching list page (`/invoices`, `/customers`, …).
- **Title** — `text-[28px] font-semibold tracking-tight text-slate-900` (same scale as PageShell), no border / no underline.
- **Cancel** — ghost button. Navigates to the back href.
- **Edit (optional)** — outline button with `Pencil` icon. Rendered only when the chrome receives `isViewMode={true}` + `onEditClick`. Currently invoice-form opens existing invoices in view mode and shows this button until clicked.
- **Save** — primary indigo button. Submits the wrapped form via the HTML5 `form="<formId>"` attr so it doesn't need to be a descendant. Disabled while `saving` is true and while `isViewMode` is true.
- **rightActions** — slot for per-form extras: invoice-form drops a hamburger menu here (`lucide-react` `Menu` icon, `h-9 w-[2.475rem]` = ~10% wider than the back button) holding Clone / PDF / Send / Void / Delete via a Radix `DropdownMenu`. Customer / Company / Item / Task / Recurring forms drop a single icon-only danger `Trash2` button.
- **No bottom action bar.** The old `FormActions` row at the bottom of each form was removed across the board — every action surfaces in the header.

### Back button on Banking detail / wizard pages
Two Banking pages that are not edit forms also use the same square `h-9 w-9` outline `ArrowLeft` back button (from `lucide-react`) at the top of their content, matching the `EditPageChrome` back button style:
- `/accounts/[id]` — back button inserted into `<AccountHeaderCard>`, navigates to `/accounts`.
- `/rules/test` — back button at the top of the sandbox page, navigates to `/rules`.

These pages do not use `EditPageChrome` (they are not forms), but the back button must be visually identical to the chrome variant.

### View mode (existing invoices only — for now)
Existing invoices open in **view mode**: fields are wrapped in `<fieldset disabled>`, the rich-text editor gets a `disabled` prop, the Save button is disabled, and an **Edit** button sits to the left of Save. Clicking Edit flips local `viewMode = false`: the fieldset unlocks, RichTextEditor accepts input again, and Save becomes enabled. Saving navigates back to `/invoices`, dropping the local state.

## Invoice PDF templates
The PDF surface is its own design system — the 10 templates under [backend/src/pdf/templates/](backend/src/pdf/templates/) each ship a self-contained palette + type system. They don't share tokens with the app UI; each template registers its own `@fontsource/*` family at module load.

| Slot | File | Brand | Page tint | Type stack | Distinct moves |
|---|---|---|---|---|---|
| `design-1` | `grey-1.tsx` | — (slate band) | white | Inter | Soft grey header band, calm |
| `design-2` | `orange-1.tsx` | Rust `#c4451c` | cream `#fceee5` | Inter | Tax Invoice + accents in rust |
| `design-3` | `blue-1.tsx` | Sky `#3182CE` + navy `#1A365D` | slate `#F7FAFC` | Inter | Navy TOTAL + Payment / Terms pills |
| `design-4` | `orange-2.tsx` | Rust `#ea580c` | cream band header | Inter | Cream totals card, rust TOTAL |
| `design-5` | `blue-grey-1.tsx` | Slate band + sky `#4299e1` | white | Oswald (display) + Source Sans 3 (body) | Mixed-family display/body pairing |
| `design-6` | `pink-berry.tsx` | Berry `#b51449` | white | Inter | Pink cards w/ berry left bar, full-width Total band |
| `design-7` | `green-pro.tsx` | Teal `#2c8a92` | white | DM Sans | Light blue-grey band + 3pt teal rule |
| `design-8` | `green-elegance.tsx` | Sage `#6b958f` | `#ededed` | Manrope | Dashed dividers between every section |
| `design-9` | `brown-black.tsx` | Dark orange `#b3541a` + black band | beige `#f2efe9` | Lora (serif) | Editorial serif throughout |
| `design-10` | `blue-simple.tsx` | Navy `#1849a6` | grey `#e8e8eb` | Plus Jakarta Sans | Thin blue vertical bars on BILL TO / footer cols |

Cross-template conventions:
- **A4 portrait, single page.** Soft target ≤ 180 KB/page; rendered sizes today range from ~14 KB to ~20 KB.
- **Two-weight font registration** (400 + 700) per family except blue-grey-1 which adds Oswald 700 on top of Source Sans 3 (400 + 700).
- **Currency** rendered as `$X.XX` (always two decimals) via shared `formatCurrency` helper.
- **Dates** rendered as `dd/mm/yyyy` via shared `formatDdMmYyyy`.
- **Tax label** in totals strips a trailing rate suffix (so `"GST 10%"` → `"GST"`); the rate either lives in the description column or the label row depending on the design.
- **Payment Details** parses the rich-text `paymentDetails` HTML to plain lines (drops `<br>`, `<div>`, `<p>`) so RichTextEditor markup never leaks into the PDF.
- **No raster images.** Logos must be `<Svg>` primitives if needed.

## Dynamic Fields
Token catalogue (canonical source: [frontend/lib/dynamic-fields.ts](frontend/lib/dynamic-fields.ts), mirrored in [backend/src/common/dynamic-fields.ts](backend/src/common/dynamic-fields.ts)). All tokens are case-insensitive and whitespace-tolerant.

| Token | Resolves to |
|---|---|
| `{{month-year}}` | Current month-year at resolution time (e.g. `May-2026`) |
| `{{invoice date}}` | Host invoice's invoice date (`dd/mm/yyyy`) |
| `{{due date}}` | Host invoice's due date (`dd/mm/yyyy`) |
| `{{invoice number}}` | Host invoice's number (e.g. `INV-1024`). Legacy underscore form `{{invoice_number}}` still accepted. |
| `{{customer name}}` | Customer the invoice is addressed to. Legacy `{{customer_name}}` still accepted. |
| `{{billing company}}` | Billing Company name that issued the invoice. |
| `{{accounts email}}` | Billing Company's `accountsEmail` (the address invoices are sent from). |

The Settings → Dynamic Fields page reads straight from `DYNAMIC_FIELDS` — adding a new entry there shows it in the table automatically. The Send Invoice dialog's **Insert Fields** popover lists the same tokens.

## Mobile Navigation
- Desktop sidebar is hidden below `md` (`hidden md:flex`).
- Mobile (< md) uses a slide-in **MobileSidebar** sheet built on `@radix-ui/react-dialog` primitives.
- Trigger: a hamburger (`lucide-react`'s `List`) on the left of the CommandBar, `md:hidden`, slate-600 idle / slate-100 hover.
- Sheet: 240px wide, `#323D59`, slides in from the left, scrim is `bg-slate-900/40` + `backdrop-blur-sm`. Auto-closes on link click via `onNavigate` callback passed into `SidebarBody`.
- The same `SidebarBody` component renders inside the desktop `<aside>` and the mobile sheet — single source of truth for nav items, styling, and active states.

## Banking — exceptions and conventions

### Transactions table page size
The transactions table uses **page size 200** (project default is 100). This is intentional — bank statements are row-dense and users expect to see a full month without paginating. `DEFAULT_PAGE_SIZE` from `list-table.tsx` does **not** apply here; the transactions list uses its own constant.

### Signed-amount colours
Render transaction amounts with:
- Positive (credit): `text-green-700`
- Negative (debit): `text-red-700`
- Always paired with `font-mono tabular-nums` for column alignment.

Do not use `emerald` (the palette's positive tone) for transaction amounts — `green-700` is the standard for this surface.

### `<ImportReportPopup>` — shared component
`<ImportReportPopup>` is rendered in two places:
1. The post-import dialog shown immediately after a successful (or partial) commit.
2. The persisted log detail page at `/settings/import-logs/[id]`.

Both views use the identical component reading from the same `ImportReport` JSON shape stored in `TransactionImport.reportJson`. Do not create a second layout for the log detail — route it through the same component.

### Settings sub-nav additions
Account Types and Import Logs each have their own entry in the Settings sub-nav, alongside Tax Types, Dynamic Fields, and Recurring Schedules:
- **Account Types** — `/settings/account-types`
- **Import Logs** — `/settings/import-logs`

---

## Banking — Phase B additions

### Category kind badges
Use the standard badge shape (11px / 500 uppercase, 4px Y / 8px X, rounded-full) with these per-kind colours:

| Kind | Classes |
|---|---|
| `INCOME` | `bg-emerald-100 text-emerald-900` |
| `EXPENSE` | `bg-red-100 text-red-900` |
| `TRANSFER` | `bg-blue-100 text-blue-900` |
| `OTHER` | `bg-slate-100 text-slate-800` |

### Tag chip *(2026-05-28, replaces Vendor chip)*
Small inline pill used wherever a tag name appears in-line (transaction rows, payment queue, etc.). Renders as a pill (fully rounded) rather than a slight-radius rectangle:

```
bg-slate-100 text-slate-600 rounded-full px-1.5 py-0 text-[10px]
```

Multi-tag rows: `flex flex-wrap gap-1`. When a tag carries a `color`, render a 2px round dot of that color inline at the start of the chip (used on `/settings/tags` only — the transaction-row chips stay slate to avoid visual noise).

### Rules list priority rank prefix
Each row in the rules list shows a rank number prefix (`#1`, `#2`, …):

```
font-mono text-lg tabular-nums text-slate-400
```

### "Rules Test Ground" warning banner
Mandatory on the `/rules/test` sandbox page. Implemented as a `Card` with:

```
border-amber-200 bg-amber-50 p-4
```

Contains a `lucide-react` `AlertTriangle` icon and the exact text: **"This is a sandbox. Nothing on this page changes any transaction."**

### Split modal — Allocated / Remaining badges
The split modal shows running totals below the split rows:

- **Remaining = $0.00** (fully allocated): `text-emerald-700`
- **Remaining ≠ $0.00** (under- or over-allocated): `text-amber-700`

The Save button is disabled until Remaining = $0.00.

---

## AI Setup

### PRIMARY badge
Used on the active (primary) provider card on `/settings/ai-setup`:

```
bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white
```

Non-primary cards show a "Set Primary" text link instead.

---

## Phase C colour additions

### AI confidence banner

The banner in the transaction edit modal (and AI review queue rows) is bordered and tinted by confidence level:

| Confidence | Classes |
|---|---|
| `high` | `border-emerald-200 bg-emerald-50` |
| `med` | `border-amber-200 bg-amber-50` |
| `low` | `border-slate-200 bg-slate-50` |

### Event-source badges (history drawer)

Each `CategorisationEvent` row in the history drawer carries a badge coloured by `source`:

| `source` | Badge classes |
|---|---|
| `USER` | `bg-slate-100 text-slate-700` |
| `RULE` | `bg-indigo-100 text-indigo-700` |
| `AI_DRAFT` | `bg-amber-50 text-amber-700` |
| `AI_APPLIED` (`acceptedAiSuggestion=true`) | `bg-emerald-100 text-emerald-700` |
| `AI_APPLIED` (`acceptedAiSuggestion=false`) | `bg-amber-100 text-amber-700` |
| `AI_REJECTED` | `bg-rose-100 text-rose-700` |
| `AUTO_ALIAS` *(2026-05-28)* | `bg-cyan-100 text-cyan-700` — used on `TransactionTag` rows attached by the auto-alias pass |

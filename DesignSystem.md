# SimpleBooks — Design System

The design language for the SimpleBooks / BizBooks self-hosted billing & accounting platform. It is a clean, modern SaaS interface built on a shadcn-style, **slot-based architecture** (`data-slot`, `data-state`, `aria-invalid`) with Tailwind utility scaling and semantic CSS variables. The aesthetic is restrained and information-dense: white surfaces over a cool slate canvas, a confident **navy** brand colour with a clear link **blue**, and generous use of muted greys for hierarchy.

> **Colour note:** All colours below come from the design tokens. Screenshot colours are layout reference only and are not authoritative.

---

## Contents

1. [Design Principles](#design-principles)
2. [Theme](#theme) — palette, typography, spacing, radii, shadows, motion
3. [UI Patterns](#ui-patterns) — app shell, list views, edit forms, modals, empty/error/loading states, auth
4. [Components](#components) — reusable elements and variants
5. [States & Accessibility](#states--accessibility)
6. [Responsiveness](#responsiveness) — breakpoints, mobile-first rule, drawer shell, tables on mobile, touch sizing
7. [Implementation Notes](#implementation-notes)

---

## Design Principles

- **Navy acts, blue links, gray informs.** Navy (`--primary`) signals action and active state — primary buttons, active nav, focus rings, key figures, the branded header. The tertiary **blue** (`--tertiary`) is reserved for inline links and highlights; **gray** (`--muted-foreground`) carries metadata and secondary text. Status colours (green / amber / red) appear only on badges and feedback. Everything else stays neutral.
- **Surfaces over borders.** White cards (`--card`) floating on the cool slate canvas (`--background`) with subtle shadows carry hierarchy. Borders (`--border`) are hairline dividers, not heavy outlines.
- **Muted greys do the work.** Secondary text, labels, placeholders, axis ticks, and inactive states all live in the `--muted` / `--muted-foreground` range so the single accent stays loud.
- **Tight, consistent rhythm.** A 4px base spacing grid and a small, fixed type scale. Controls share a 44px (`h-11`) baseline on desktop and tablet, growing to 48px (`h-12`) on mobile — comfortable for cursor and thumb alike (see [Responsiveness](#responsiveness)).
- **Calm motion.** Transitions are fast (150ms) and functional. Animation communicates state change, never decoration.

---

## Theme

### Colour Palette (Light Mode)

| Token | Hex | Role |
| :--- | :--- | :--- |
| `--background` | `#F8FAFC` | App canvas (cool slate) |
| `--foreground` | `#0F172A` | Primary text (slate-900) — *derived* |
| `--card` *(Surface)* | `#FFFFFF` | Card / panel / table surface |
| `--card-foreground` | `#0F172A` | Text on cards |
| `--popover` | `#FFFFFF` | Popover / menu surface |
| `--popover-foreground` | `#0F172A` | Text in popovers |
| `--primary` | `#323D59` | **Navy** — primary actions, active nav, focus ring, key figures, switch checked-state track |
| `--primary-foreground` | `#FFFFFF` | Text/icons on navy |
| `--primary-hover` | `#283248` | Solid hover for primary buttons (a darker step from `--primary`, not an alpha fade) |
| `--secondary` | `#E2E8F0` | Secondary solid-button surface — *derived from your Gray* |
| `--secondary-foreground` | `#1E293B` | Text on secondary — *derived* |
| `--tertiary` | `#2563EB` | **Blue** — links, tertiary actions, highlights |
| `--tertiary-foreground` | `#FFFFFF` | Text on a tertiary fill |
| `--muted` | `#F1F5F9` | Subtle backgrounds — table header, skeletons, inactive — *derived* |
| `--muted-foreground` | `#6B7280` | **Gray** — secondary text, metadata, placeholders, axis ticks |
| `--accent` | `#E8EEF6` | Hover tint (light navy) — *derived* |
| `--accent-foreground` | `#323D59` | Text/icon on accent |
| `--success` | `#16A34A` | **Green** — approved / active status, completed steps |
| `--success-foreground` | `#FFFFFF` | Text on success |
| `--warning` | `#CA8A04` | **Amber** — pending review, approaching limits |
| `--warning-foreground` | `#FFFFFF` | Text on warning |
| `--destructive` *(Error)* | `#DC2626` | **Red** — validation errors, rejected, delete actions |
| `--destructive-foreground` | `#FFFFFF` | Text on destructive |
| `--info` | `#2563EB` | **Blue** — system notices, help indicators (shares the tertiary blue) |
| `--info-foreground` | `#FFFFFF` | Text on info |
| `--border` | `#E2E8F0` | Borders, dividers (slate-200) — *derived* |
| `--input` | `#CBD5E1` | Input borders / disabled input bg (slate-300) — *derived* |
| `--ring` | `#323D59` | Focus ring (matches primary navy) |

> Colours marked *derived* weren't in the supplied list; they're drawn from the same slate/navy family (Tailwind's slate scale plus a complementary teal) so they sit naturally with the navy, gray, and blue provided. **Info** intentionally reuses the **tertiary blue** — one blue does double duty for links and system notices.

#### Sidebar tokens

| Token | Hex | Notes |
| :--- | :--- | :--- |
| `--sidebar` | `#FFFFFF` | Sidebar surface |
| `--sidebar-foreground` | `#334155` | Sidebar text (slate-700, softer than `--foreground`) |
| `--sidebar-primary` | `#323D59` | Active item text/icon, sidebar ring |
| `--sidebar-primary-foreground` | `#FFFFFF` | Text on a solid sidebar-primary fill |
| `--sidebar-accent` | `#E8EEF6` | Active / hover item background (light navy) |
| `--sidebar-accent-foreground` | `#323D59` | Text on sidebar accent |
| `--sidebar-border` | `#E2E8F0` | Sidebar divider / right edge |
| `--sidebar-ring` | `#323D59` | Sidebar focus ring |

#### Chart palette (5-colour categorical scale)

| Token | Hex |
| :--- | :--- |
| `--chart-1` | `#323D59` (navy — primary) |
| `--chart-2` | `#2563EB` (blue — tertiary / info) |
| `--chart-3` | `#16A34A` (green — success) |
| `--chart-4` | `#CA8A04` (amber — warning) |
| `--chart-5` | `#0D9488` (teal — *derived*) |

#### CSS custom properties

```css
:root {
  /* Core */
  --background: #F8FAFC;
  --foreground: #0F172A;

  /* Surfaces */
  --card: #FFFFFF;
  --card-foreground: #0F172A;
  --popover: #FFFFFF;
  --popover-foreground: #0F172A;

  /* Brand */
  --primary: #323D59;            /* Navy */
  --primary-foreground: #FFFFFF;
  --primary-hover: #283248;      /* solid hover step for primary buttons */

  /* Secondary / tertiary / muted / accent */
  --secondary: #E2E8F0;
  --secondary-foreground: #1E293B;
  --tertiary: #2563EB;           /* Blue — links / highlights */
  --tertiary-foreground: #FFFFFF;
  --muted: #F1F5F9;
  --muted-foreground: #6B7280;   /* Gray — metadata */
  --accent: #E8EEF6;             /* light navy hover tint */
  --accent-foreground: #323D59;

  /* Status */
  --success: #16A34A;
  --success-foreground: #FFFFFF;
  --warning: #CA8A04;
  --warning-foreground: #FFFFFF;
  --destructive: #DC2626;        /* Error */
  --destructive-foreground: #FFFFFF;
  --info: #2563EB;               /* shares the tertiary blue */
  --info-foreground: #FFFFFF;

  /* Lines & focus */
  --border: #E2E8F0;
  --input: #CBD5E1;
  --ring: #323D59;

  /* Sidebar */
  --sidebar: #FFFFFF;
  --sidebar-foreground: #334155;
  --sidebar-primary: #323D59;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #E8EEF6;
  --sidebar-accent-foreground: #323D59;
  --sidebar-border: #E2E8F0;
  --sidebar-ring: #323D59;

  /* Charts */
  --chart-1: #323D59;
  --chart-2: #2563EB;
  --chart-3: #16A34A;
  --chart-4: #CA8A04;
  --chart-5: #0D9488;

  /* Radius (see scale below) */
  --radius: 0.469rem;
}
```

> Values are plain hex; convert to `oklch`/`hsl` if your tooling prefers it, but keep token **names** stable so component classes don't change. A dark-mode `.dark { … }` block is not yet defined — add one by re-mapping the same token names (e.g. lighten navy toward `#5B89C9` for primary on dark surfaces).

#### Opacity conventions

The system applies alpha to tokens rather than defining extra colours:

- `bg-primary-hover` (`#283248`) — primary button hover (solid step, not an alpha fade)
- `ring-ring/50` — focus ring (3px, primary @ 50%)
- `ring-destructive/20` — invalid-field ring (destructive @ 20%)
- `bg-black/50` (or `--muted`) — dialog/drawer overlay

---

### Typography

- **Sans (default):** `var(--font-noto-sans), "Noto Sans", system-ui, sans-serif`
- **Mono:** `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` — figures in tables, IDs, code.

| Scale | Desktop / Tablet | Mobile (+1px) | Line height | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `text-xs` | 0.75rem / 12px | 13px | 1.33 | Badges, chart ticks, helper text, ⌘K hints |
| `text-sm` | 0.875rem / 14px | 15px | 1.42 | Button text, table headers, labels, subtitles, nav |
| `text-base` | 1rem / 16px | 17px | 1.50 | Body text, input values |
| `text-lg` | 1.125rem / 18px | 19px | 1.55 | Card titles, subheadings |
| `text-2xl` | 1.5rem / 24px | 25px | 1.33 | Page headers |

> **Every type size is 1px larger on mobile** (< 768px) — including the intermediate sizes the system uses (13px breadcrumb/card-description, 15px control text, 11px ⌘K hint, 17px brand mark). Implement this by driving font-size from **tokens** (`--fs-xs`, `--fs-sm`, …) and overriding them at the mobile breakpoint, not by editing each rule. See [Responsiveness → Typography on mobile](#typography-on-mobile).

**Weights:** Normal `400`, Medium `500`, Semibold `600`, Bold `700`.

**Conventions**
- Page title → `text-2xl` semibold/bold.
- Card / dialog title → `text-lg` semibold.
- Section & group labels → `text-xs`/`text-sm` `--muted-foreground`, often uppercase with letter-spacing (e.g. chart legend labels `SALES`, `EXPENSES`).
- Big metric figures → `text-2xl` bold `--foreground`; the headline currency figure on a chart panel may use `--primary`.
- Body / descriptions → `text-sm` `--muted-foreground`.

> The scale jumps from `lg` to `2xl`; introduce `text-xl` (1.25rem) only if a genuine intermediate heading is needed.

---

### Spacing

A Tailwind 4px base grid (`1 unit = 0.25rem = 4px`). Common steps:

| Token | Size | Typical use |
| :--- | :--- | :--- |
| `0.5` | 2px | Hairline nudges, checkbox alignment translate |
| `1` | 4px | Icon-to-text micro gaps |
| `1.5` | 6px | Badge padding-y |
| `2` | 8px | Button gap, button padding-y, tight stacks |
| `3` | 12px | Icon-button padding, form field gap, nav item padding-x |
| `4` | 16px | Button padding-x, card inner gaps, grid gaps |
| `5` | 20px | Card padding |
| `6` | 24px | Page padding, section gaps, card padding (lg) |
| `8` | 32px | Auth card padding, large section separation |
| `12` | 48px | Empty-state vertical padding |
| `16` | 64px | Generous empty-state / hero padding |

**Control heights (shared baseline):** input/button/select trigger = `h-11` (44px) on desktop and tablet, growing to `h-12` (48px) on mobile; command input = `h-12` (48px); header bar ≈ `h-16` (64px); icon size in controls = `size-4` (16px), command icons = `size-5` (20px). See [Responsiveness → Touch & sizing](#touch--sizing).

**Layout defaults:** content padding `p-6` (24px); card grids `gap-4`–`gap-6`; sidebar width ≈ `w-64` (256px); auth card width ≈ `max-w-sm`–`max-w-md` (360–420px).

---

### Border Radius

`--radius = 0.469rem (~7.5px)` is the base. Derived steps:

| Token | Value | ~px | Use |
| :--- | :--- | :--- | :--- |
| `radius-xs` | `0.125rem` | 2px | Checkboxes, small chips |
| `radius-sm` | `calc(var(--radius) - 4px)` | ~3.5px | Inner/nested elements |
| `radius-md` | `calc(var(--radius) - 2px)` | ~5.5px | **Buttons, inputs, menu items** |
| `radius-lg` | `var(--radius)` | ~7.5px | **Cards, dialogs, popovers** |
| `radius-xl` | `calc(var(--radius) + 4px)` | ~11.5px | Large feature cards |
| `radius-full` | `9999px` | — | Avatars, status badges (pill), dots |

---

### Shadows

Used to lift surfaces off the canvas; kept soft and low-contrast.

| Token | Value | Use |
| :--- | :--- | :--- |
| `shadow-xs` | `0 1px 2px 0 rgba(0,0,0,0.05)` | Resting cards, inputs |
| `shadow-sm` | `0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)` | Cards, raised controls |
| `shadow` (base) | `0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)` | Default surface |
| `shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)` | Dropdowns, popovers, tooltips |
| `shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)` | Dialogs, drawers, auth card |

---

### Motion

- **Default transition:** `0.15s` `ease-in-out` → `cubic-bezier(.4, 0, .2, 1)`. Apply to colour, background, border, opacity, and transform on interactive elements.
- **Keyframes:**
  - `spin` — `1s linear infinite` (spinners, loading buttons).
  - `pulse` — `2s cubic-bezier infinite` (skeleton loaders).
  - `enter` / `exit` — fade + scale for dialogs/popovers (paired with `zoom-in/out` and `slide-in-from-*`).
  - `accordion-down` / `accordion-up` — collapsible sections (sidebar groups, accordions).
  - `caret-blink` — command-palette / input cursor.
- **Directional entrances** for overlays: `slide-in-from-top-2`, `…-bottom-2`, `…-left-2`, `…-right-2`, keyed to `data-side`.
- Respect `prefers-reduced-motion`: reduce to opacity-only or instant.

---

## UI Patterns

### App Shell (authenticated layout)

A persistent two-region layout: a fixed **left sidebar** plus a **main column** (sticky header bar over a scrollable content area).

```
┌────────────┬──────────────────────────────────────────────┐
│  Sidebar   │  Header bar (search · notifications · avatar) │
│  (w-64)    ├──────────────────────────────────────────────┤
│  · Brand   │  Content (--background, p-6)                  │
│  · Nav     │   ┌── Page header (title · actions) ──┐       │
│  · Groups  │   │  cards / tables / forms           │       │
│  · Footer  │   └───────────────────────────────────┘       │
└────────────┴──────────────────────────────────────────────┘
```

- **Sidebar:** `--sidebar` (#FFFFFF) surface, `--sidebar-border` right edge, fixed `w-64` — persistent at `lg`+ and collapsed to a left **Drawer** below `lg` (see [Responsiveness](#responsiveness)). Sections: brand lockup (top), scrollable nav (flexible), optional footer item (e.g. Settings) pinned bottom.
- **Header bar:** sticky, `~h-16`. Two presentations:
  - *Branded* — `--primary` background with `--primary-foreground` content (matches the screenshots' chrome).
  - *Light* — `--card`/`--background` with a bottom `--border` for a quieter look.
  Holds global search (left/centre), notification bell, and user avatar (right).
- **Content:** `--background` canvas, `p-6`, optional max-width container. Composed of a page header followed by cards, tables, or forms.

### Sidebar Navigation

- **Brand lockup:** logo mark + wordmark at the top.
- **Nav item:** icon (`size-4`/`size-5`) + label (`text-sm`), `rounded-md`, `px-3 py-2.5` (taller `py-3`, ≥44px, in the mobile drawer).
  - *Default* — transparent bg, `--sidebar-foreground` text.
  - *Hover* — `--sidebar-accent` bg, `--sidebar-accent-foreground` text/icon.
  - *Active* — `--sidebar-accent` bg + `--sidebar-primary` text/icon, `font-medium`.
- **Collapsible groups** (e.g. *Sales*, *Banking*, *Reports*): a group header (icon + label + trailing chevron) that toggles nested children via `accordion-down/up`. Children are indented one step. Chevron rotates on `data-state=open`.
- **Group heading** (non-collapsible variant): `text-xs` `--muted-foreground`, uppercase, with top margin to separate clusters.

### Header / Global Search

- **Search field:** wide, `rounded-md`, `--muted` or `--input` border; leading search icon; trailing `⌘K` hint badge; placeholder e.g. *"Search invoices, clients, items…"*. Opens the [Command Palette](#command-palette-cmdk).
- **Notification bell:** ghost icon button with an unread dot (small `--primary`/`--destructive` circle, top-right).
- **Avatar:** circular, initials fallback, `~size-9`.

### Page Header

Top of every content view.

- **Title** — `text-2xl` semibold/bold, `--foreground`.
- **Breadcrumb** (optional) — `text-sm` `--muted-foreground` with `/` separators; current page in `--foreground` (e.g. *Home / Customers*).
- **Subtitle** (optional) — `text-sm` `--muted-foreground` (e.g. *"Welcome back, Jamie — here's an overview…"*).
- **Actions** — right-aligned cluster: secondary/outline action(s) (e.g. *Export*, *Filter*) followed by the primary action (e.g. *New Invoice*, *New Customer*) with a leading `+` icon.
- **Layout:** `flex items-start justify-between`.

### Dashboard — Stat / KPI Cards

A responsive row (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, `gap-4`–`gap-6`) of metric cards.

Each card (`--card`, border, `rounded-lg`, `shadow-xs`, `p-5`–`p-6`):
- **Value** — `text-2xl` bold (e.g. `$206,746.64`, `55`, `350`).
- **Icon chip** — small rounded square top-right, `--accent` bg with a `--primary`/category icon.
- **Label** — `text-sm` `--muted-foreground` under the value.
- **Trend** — arrow + delta % + period, e.g. `↓ 3.2%` in `--destructive` (down) or `↑ 8.4%` in `--success` (up), with `vs last month` muted.

### Dashboard — Chart Card

- **Header:** icon chip + title (`text-lg`) + subtitle (`--muted-foreground`) on the left; a **period selector** (Select, e.g. *"This Year"*) on the right.
- **Plot:** Recharts area/line chart themed with `--chart-1…5`, `--border` grid lines, `--muted-foreground` axis ticks, faint primary fill for the area.
- **Side stats panel:** stacked metric rows — colour dot + uppercase `text-xs` muted label + bold value (e.g. *SALES* `$721,843.00`, *RECEIPTS* `$542,613.00`, *EXPENSES* `$222,681.00`, *NET INCOME* `$319,932.00`).
- **Responsive:** plot + stats sit side by side at `lg`+; below that the stats panel stacks **above** the plot as a horizontal row of figures.

### List / Table View

The standard record-browsing pattern (Customers, Invoices, Items, etc.).

- **Page header** with *Export* (outline) + *New …* (primary), plus breadcrumb.
- **Toolbar** (top of the table card) — a **search** field (left) that filters the list live across the key columns, and a **Filter** button (right) opening a popover of facet filters (e.g. Status, Billing Company) with an active-count badge and a *Clear all* action.
- **Table card** — `--card`, `border`, `rounded-lg`:
  - **Header row** — `--muted`/`--secondary` bg, `text-sm` `font-medium` `--muted-foreground`; sortable columns show a sort chevron and respond to click (`aria-sort`, toggling asc/desc).
  - **Body rows** — separated by `--border`; comfortable height (`py-3`–`py-4`); `text-sm`/`text-base` `--foreground`; hover → `--accent`/`--muted` tint. Status cells render a [Badge](#badge); ID columns may use mono.
- **Footer (sticky)** — results summary on the left (*"Showing 1–100 of 250 customers"*, `--muted-foreground`) and [Pagination](#pagination) on the right. The footer uses **`position: sticky; bottom: 0`** within the scroll area — opaque `--card` background, top border, and a soft upward shadow — so the controls stay reachable while scrolling a long page. **Default page size: 100 rows.**
- **Row interaction:** whole row may be clickable to open the record; avoid nested click targets except an explicit actions menu (`⋯`).
- **Responsive:** below `md`, rows re-flow into stacked cards (or horizontal scroll with priority columns) — see [Responsiveness → Tables on mobile](#tables-on-mobile).

### Edit / Create Form

Used for record editing (e.g. the customer edit form) and creation flows. Rendered as a page or inside a Dialog.

- **Structure:** grouped **Fields** (`data-slot=field` / `field-group`). Each field: label (`text-sm` `font-medium`) above the control; control (`h-11` / `h-12` on mobile, `rounded-md`, `--input` border, `--card` bg, `px-3`); optional helper text (`text-xs` `--muted-foreground`); error message (`text-xs`/`text-sm` `--destructive`) below.
- **Field types:** text/email/password/number input, Select, Textarea, Checkbox/Radio, Switch.
- **Grid:** single column on mobile, `md:grid-cols-2` for related pairs; `gap-4`–`gap-6`. Separate logical sections with a section heading (`text-sm` muted) and/or a divider.
- **Footer actions:** right-aligned — primary *Save* + ghost/outline *Cancel*. A destructive *Delete* sits left, visually separated. On mobile the footer stacks full-width (primary on top, then Cancel; Delete kept separate).
- **Validation:** inline on blur/submit; invalid controls take `aria-invalid` styling (see [States](#states--accessibility)).

### Modal / Dialog

- **Overlay** — `bg-black/50` (or `--muted`), fades via `enter`/`exit`.
- **Panel** — centred, `--popover`/`--card` bg, `rounded-lg`, `shadow-lg`, `max-w-md` (size variants `sm`/`md`/`lg`), `p-6`; enters with zoom + slide. On small screens becomes full-screen or a bottom-sheet drawer (`vaul-drawer-direction=bottom`).
- **Header** — title (`text-lg` semibold) + optional description (`--muted-foreground` `text-sm`) + close `X` (ghost icon, top-right).
- **Footer** — right-aligned: ghost/outline *Cancel* + primary or destructive confirm.
- **Variants:** standard dialog; **confirmation/destructive** (destructive confirm button, concise warning copy); **Drawer** (slides from edge for mobile / side panels).

### Drawer

Vaul-style directional panel (`data-vaul-drawer-direction = top | bottom | left | right`). Same surface tokens and footer pattern as Dialog; slides from the chosen edge. Use for mobile navigation, filters, or contextual detail panels.

### Empty States

Centred block inside the content region or table card, with generous vertical padding (`py-12`–`py-16`):
- Icon in a muted circle (`size-12`, `--muted` bg, `--muted-foreground` glyph).
- Title — `text-lg` semibold.
- Description — `text-sm` `--muted-foreground`, constrained width.
- Primary CTA (e.g. *New Customer*).

**Variants:** *no data yet* (with create CTA); *no search/filter results* (different copy + a *Clear filters* action); *load failed* (see error states, with *Retry*).

### Error States

- **Inline field error:** `aria-invalid` → `--destructive` border + `ring-destructive/20` on focus; error text in `--destructive` below the field; optional alert icon.
- **Form / section error:** [Alert](#alert) `destructive` variant — destructive-tinted surface, icon, title + message — placed above the form or section.
- **Page-level error:** centred icon + message + *Retry* button (mirrors the empty-state layout).
- **Transient feedback (toast):** `--card` surface, `shadow-md`, status icon / left accent strip, short message; success uses `--success`, failure uses `--destructive`.
- **Destructive confirmation:** route irreversible actions through a confirmation Dialog with a destructive button.

### Loading / Skeleton States

- **Skeleton:** `--muted` blocks with `pulse`, shaped to match incoming content (text lines, card silhouettes, table rows). Prefer skeletons over spinners for initial page/section loads.
- **Spinner:** `spin` animation; used inside buttons and for small inline/area loads.
- **Loading button:** `disabled` + leading spinner (optionally swap label to a verb like *Saving…*).

### Auth — Centred Card

The login / forgot-password pattern.

- Full-viewport centred layout on `--background`.
- **Card:** `--card`, `rounded-lg`/`rounded-xl`, `shadow-md`/`shadow-lg`, `max-w-sm`–`max-w-md`, `p-8`.
- **Brand lockup** centred at top.
- **Stacked fields** (Email, Password) with `gap-3`–`gap-4`.
- **Inline link** (*Forgot your password?*) right-aligned, link variant in `--primary`.
- **Full-width primary submit** (*Sign In*).
- **Error handling:** Alert above the fields for auth failures; inline validation on fields.

---

## Components

Reusable primitives and their variants. All are state-driven via `data-slot`, `data-state`, and `aria-invalid`.

### Button

- **Base:** `inline-flex items-center justify-center whitespace-nowrap shrink-0`, `text-sm font-medium`, `rounded-md`, transition 150ms.
- **Sizing:** height `h-11` (44px), growing to `h-12` (48px) on mobile; padding `px-4`–`px-5`; **with icon** → reduce side padding slightly; `gap-2` between icon and label. Child `<svg>`: `pointer-events-none`, `size-4`, `shrink-0`.

**Variants**

| Variant | Resting | Hover | Notes |
| :--- | :--- | :--- | :--- |
| `default` (primary) | `bg-primary` (`#323D59`) / `text-primary-foreground` | `bg-primary-hover` (`#283248`) | Main CTA |
| `secondary` | `bg-secondary` / `text-secondary-foreground` | darken | Lower-emphasis solid |
| `outline` | transparent + `border` / `text-foreground` | `bg-accent` / `text-accent-foreground` | *Export*, *Filter* |
| `ghost` | transparent | `bg-accent` / `text-accent-foreground` | Toolbar / icon actions |
| `link` | transparent / `text-primary` | underline | *Forgot your password?* |
| `destructive` | `bg-destructive` / `text-destructive-foreground` | darken | Delete / confirm-destroy |

**Sizes:** `sm` (`h-10`, `text-sm`), `default` (`h-11`, 44px), `lg` (`h-12`, 48px — also the default size on mobile), `icon` (`size-11`, square; `size-12` on mobile). Modifier: `w-full` for full-width (auth submit, mobile footers).

**States:** *Focus-visible* → remove outline, `border-ring`, `ring-[3px]` `ring-ring/50`. *Disabled* → `pointer-events-none`, `opacity-50`. *Invalid* → `aria-invalid:border-destructive`, `aria-invalid:ring-destructive/20`.

### Icon Button

Square button (`size-11`, 44px; `size-12` / 48px on mobile), icon `size-4`/`size-5`, usually `ghost` or `outline`. Used for the notification bell, pagination arrows, dialog close (`X`), and row `⋯` menus. Always provide an `aria-label`.

### Input

- `h-11` (44px), growing to `h-12` (48px) on mobile; `rounded-md`, `--input` border, `--card`/transparent bg, `px-3`; value text `text-sm` (15px) on desktop → 16px on mobile (the global +1px bump keeps it ≥16px, which also prevents iOS Safari auto-zoom on focus); placeholder `--muted-foreground`.
- Supports leading/trailing adornments (search icon, `⌘K` hint, unit suffix).
- **States:** focus → `border-ring` + `ring-[3px]` `ring-ring/50`; disabled → `--input` bg + `opacity-50`; invalid → `border-destructive` + `ring-destructive/20`.
- **Types:** text, email, password (with optional reveal toggle), number, search.

### Textarea

Multiline input; `min-h` ≈ 3 rows, vertical resize; otherwise identical tokens/states to Input.

### Select

Trigger styled like an Input with a trailing chevron (`size-4`); opens a `--popover` list with `shadow-md`. Items: `rounded-sm`, hover `--accent`, selected shows a check. Used for the dashboard period selector (*This Year*).

### Checkbox

Square `size-5` (20px), `radius-xs`, `--input` border; checked → `--primary` bg + white check. Aligns to label text with a **2px Y-translate**; give the box + label a ≥44px tap row on touch. Group container `has-focus:ring-[3px]`.

### Radio

Circular counterpart to Checkbox; selected → `--primary` ring + filled dot. Same grouping/focus behaviour.

### Switch / Toggle

Pill track (`w-12 h-7`, ~46×26) + circular thumb (`size-5`+); `slate-200` track when off, `--primary` (`#323D59`) track when on; thumb translates on `data-state=checked`. The whole switch row is the tap target (≥44px, ≥48px on mobile).

### Field

Composed form unit (`data-slot=field` / `field-group` / `field-label`): **label → control → description → error**. Manages spacing and `aria-invalid` wiring across input types.

### Card

Surface container with optional slots: `header` (title `text-lg` semibold + description `--muted-foreground`), `content`, `footer`. Base: `--card` bg, `--border`, `rounded-lg`/`rounded-xl`, `shadow-xs`/`shadow-sm`.

**Variants:** *default*; *stat/KPI* (value + icon chip + trend); *chart* (header controls + plot + side panel); *interactive* (hover lift / `--accent` tint when the whole card is a link).

### Badge

Pill (`rounded-full`), `text-xs` `font-medium`, `px-2.5 py-1`. (Display-only — when a badge doubles as a filter chip, give it a 44px tap height on touch.)

| Variant | Style | Example |
| :--- | :--- | :--- |
| `success` | success-tinted bg / `--success` text (or solid) | **Active** |
| `neutral` | `--muted`/`--secondary` bg / `--muted-foreground` text | **Inactive** |
| `primary` | accent bg / `--primary` text | Featured |
| `destructive` | destructive-tinted bg / `--destructive` text | Overdue |
| `outline` | transparent + `--border` | Draft |

### Avatar

Circular, image with initials fallback over `--muted`/`--secondary`. Sizes `sm` (`size-8`) / `default` (`size-10`) / `lg`; optional ring.

### Table

`header` / `row` / `cell` slots. Sortable header cells show a sort indicator and set `aria-sort`. Rows divided by `--border`, hover tint, consistent vertical padding. Pairs with a footer summary + Pagination.

### Pagination

Prev/next ghost icon buttons + numbered page buttons; **active page** → `bg-primary` `text-primary-foreground`, inactive → ghost/outline; `…` ellipsis for large ranges (numbers collapse to a compact *"Page X of Y"* on mobile); disabled arrows at bounds. Lives in the table footer alongside a *"Showing X–Y of Z"* summary. **Default page size is 100 rows.** The footer is **sticky** (`position: sticky; bottom: 0`) against the scroll container, with an opaque `--card` background, a top border, and a soft upward shadow, so pagination stays pinned and reachable while scrolling a long list; it releases naturally when the bottom of the list scrolls into view.

### Tabs

`list` (often `--muted` bg) + `trigger`s + `content`. Active trigger → `--card`/`--foreground` (or primary underline); inactive → `--muted-foreground`. Switching content uses the standard 150ms transition.

### Tooltip

Side-aware (`data-side`) `--popover` bubble, `text-xs`, `shadow-md`, slide+zoom entrance. Short, non-essential hints only.

### Popover

Side-aware floating panel: `--popover` bg, `--border`, `shadow-md`, `radius-md`; directional `slide-in-from-*`. Base for Select lists, menus, date pickers.

### Dropdown Menu

`--popover` list: items hover `--accent`, optional leading icons, separators, and a destructive item style (`--destructive` text). Side-aware positioning.

### Dialog / Modal

See [Modal / Dialog](#modal--dialog). Overlay + centred panel with header/footer slots; size + confirmation/destructive variants.

### Drawer

See [Drawer](#drawer). Vaul-style directional panel (`vaul-drawer-direction`).

### Alert

Inline message block: leading icon + title + description.

**Variants:** `default` (neutral surface + `--border`), `destructive` (destructive tint, errors), `success` (success tint, confirmations), `info` (muted/secondary). Used for form-level and page-level messaging.

### Accordion

`item` / `trigger` / `content`. Trigger row with rotating chevron; content expands/collapses via `animate-accordion-down` / `animate-accordion-up`. Also the mechanism behind collapsible sidebar groups.

### Command Palette (cmdk)

Global search surface (opened from header / `⌘K`). Input `h-12` with leading search icon; results grouped via `cmdk-group-heading`; items `cmdk-item` with `size-5` icons; cursor uses `caret-blink`. Keyboard-navigable; highlights selected item with `--accent`.

### Breadcrumb

Inline path: items + `/` separators, `text-sm` `--muted-foreground`; current page in `--foreground`. Sits under or beside the page title (e.g. *Home / Customers*).

### Sidebar Nav Item

See [Sidebar Navigation](#sidebar-navigation). Default / hover / active states plus collapsible group header and nested child variants.

### Stat Card

See [Stat / KPI Cards](#dashboard--stat--kpi-cards). Value + icon chip + label + trend (success ↑ / destructive ↓).

### Chart (Recharts)

Theme via `--chart-1…5` series colours, `.recharts-cartesian-grid` → `--border`, axis ticks → `--muted-foreground`, `.recharts-tooltip-cursor` → muted, `.recharts-dot` → series colour. Tooltips render on the `--popover` surface. Supported types: area, line, bar; multi-series with a side legend/stat panel.

### Skeleton & Spinner

- **Skeleton:** `--muted` block + `pulse`, `radius` matched to target content.
- **Spinner:** circular `spin` (`1s linear infinite`); sizes `size-4` (in buttons) / `size-6`+ (area).

### Separator / Divider

Hairline rule in `--border`; horizontal (section breaks, between dialog header/body) or vertical (toolbar grouping).

### Progress

Track `--muted` + fill `--primary`; `radius-full`. Optional indeterminate variant using `pulse`/`spin`.

---

## States & Accessibility

Consistent across all interactive components:

- **Default → Hover → Focus → Active → Disabled → Invalid**, driven by `data-state` and `aria-*`.
- **Focus-visible:** keyboard focus removes the native outline and applies `border-ring` + a **3px** ring (`ring-ring/50`). Never remove focus styling without a replacement.
- **Disabled:** `pointer-events-none` + `opacity-50`; do not rely on colour alone — disabled controls are non-interactive and skipped in tab order.
- **Invalid:** `aria-invalid` triggers `border-destructive` + `ring-destructive/20`; always pair with a visible, text error (not colour-only) and link it via `aria-describedby`.
- **Status colour + meaning:** badges and trends pair colour with text/icons (e.g. *Active*/*Inactive*, ↑/↓) so state survives colour-blindness and greyscale.
- **Contrast:** body/foreground text on white meets AA; muted text is reserved for secondary content. Verify any primary-on-tint or success-on-tint combinations before shipping.
- **Hit targets:** controls sit at the `h-11`/`size-11` baseline (44px) on desktop and tablet, and `h-12`/`size-12` (48px) on mobile — comfortably above the 44px minimum. Inputs stay ≥16px on mobile (the global +1px type bump). See [Responsiveness](#responsiveness).
- **Motion:** honour `prefers-reduced-motion` by reducing entrances to opacity/instant.
- **Semantics:** sortable headers expose `aria-sort`; dialogs trap focus and close on `Esc`; nav uses landmark roles; icons-only controls carry `aria-label`.

---

## Responsiveness

The system is **mobile-first**: base styles target the smallest screen, and breakpoint prefixes (`sm:` `md:` `lg:` …) layer enhancements on top for wider viewports. Every surface — list, form, dashboard, modal, auth — must be usable on phone, tablet, and desktop. The guiding rule: nothing requires a mouse, nothing requires horizontal scrolling to reach a primary action, and no tap target is smaller than a fingertip.

### Breakpoints

Standard Tailwind scale (min-width, mobile-first):

| Token | Min width | Typical device | Primary layout |
| :--- | :--- | :--- | :--- |
| *(base)* | 0 | Phone (portrait) | Single column; sidebar behind a drawer |
| `sm` | 640px | Phone (landscape) / small tablet | Single column; 2-up stat cards |
| `md` | 768px | Tablet (portrait) | 2-column forms; sidebar still a drawer |
| `lg` | 1024px | Tablet (landscape) / laptop | Persistent sidebar; full app shell |
| `xl` | 1280px | Desktop | Max-width content container |
| `2xl` | 1536px | Large desktop | — |

**`lg` (1024px) is the key boundary.** Below it the app runs in "compact" mode (drawer nav, stacked content); at and above it the persistent two-column shell appears.

### Layout by tier

- **Mobile (< 768px):** one column. Sidebar collapses to an off-canvas **Drawer** opened by a hamburger in the header. Page-header actions wrap below the title or collapse into an overflow menu. Content padding `p-4` (16px). Tables switch to the stacked-card pattern (below). Modals become full-screen or bottom-sheets.
- **Tablet (768–1023px):** forms and card grids go 2-up (`md:grid-cols-2`); sidebar remains a drawer to maximise content width. Content padding `p-5`–`p-6`. Tables may use horizontal scroll with priority columns.
- **Desktop (≥ 1024px):** full persistent shell — `lg:` reveals the `w-64` sidebar; stat cards `lg:grid-cols-4`; content padding `p-6` inside a max-width container (`xl:max-w-[…]`).

### App shell — collapse to drawer

The fixed `w-64` sidebar is desktop-only. Below `lg`:

- Hide the sidebar (`hidden lg:flex`).
- Show a **hamburger** icon button in the header (`lg:hidden`) that opens the nav as a left **Drawer** (`vaul-drawer-direction=left`) over a `bg-black/50` overlay.
- The drawer reuses the exact sidebar markup; nav items take the taller touch height (`py-3`, ≥44px). Tapping an item, tapping the overlay, or pressing `Esc` closes it; focus is trapped while open.
- The header's global search collapses to a search **icon** on mobile that expands to a full-width field — or opens the command palette directly.

### Tables on mobile

Tables are the hardest pattern on small screens. Choose per list, in order of preference:

1. **Stacked cards — preferred for primary lists (Customers, Invoices, Items).** Below `md`, each row re-flows into a card: the primary column (e.g. *Customer Name*) becomes the card title, the remaining columns become label–value rows, and the status [Badge](#badge) sits top-right. Far more usable than a pinched grid, and each card is a comfortable tap target.
2. **Horizontal scroll + priority columns.** Keep the table but wrap it in an `overflow-x-auto` container; optionally freeze the first column. Hide low-priority columns on small screens (`hidden md:table-cell`) so the most important 2–3 stay visible without scrolling.
3. **Avoid** shrinking every column to fit — it yields unreadable, un-tappable rows.

Pagination on mobile: show prev / next + the current page only (drop the full number range) and put the *"Showing X–Y of Z"* summary on its own line above.

### Touch & sizing

- **Control sizing by tier:** interactive controls (buttons, inputs, selects) are **44px on desktop and tablet** and **48px on mobile** — both at or above the 44px minimum touch target, so no separate "touch bump" is needed. Icon-only buttons follow the same height as a square.
- **Inputs stay ≥16px on mobile.** The global +1px type bump (below) takes the 15px control text to 16px, which both improves legibility and prevents iOS Safari's auto-zoom on focus.
- **Spacing opens up on mobile:** form field gaps `gap-5`; action buttons full-width and stacked in the form footer (primary on top); comfortable `py-3` list rows.
- **Icon-only buttons** (bell, pagination, row `⋯`, dialog close) inherit the 44/48px square even though the glyph stays `size-4`/`size-5`.
- **No hover on touch.** Hover-only affordances (row hover tint, tooltips, reveal-on-hover actions) must have a tap/focus equivalent — e.g. an always-visible `⋯` button rather than a hover-reveal one.

### Typography on mobile

**Every type size is 1px larger below `md` (768px)** — not just inputs. This keeps text legible at arm's length on a phone and lifts input values to the 16px iOS-safe threshold.

| Token | Desktop / Tablet | Mobile |
| :--- | :--- | :--- |
| `--fs-kbd` | 11px | 12px |
| `--fs-xs` | 12px | 13px |
| `--fs-13` | 13px | 14px |
| `--fs-sm` | 14px | 15px |
| `--fs-ctrl` (input/button) | 15px | 16px |
| `--fs-base` (body) | 16px | 17px |
| `--fs-lg` (titles) | 18px | 19px |
| `--fs-2xl` (page title) | 24px | 25px |

Drive every `font-size` from these tokens and override them once inside the mobile `@media` block — never hand-edit individual rules:

```css
:root { --fs-sm: 14px; --fs-base: 16px; --fs-ctrl: 15px; /* … */ --control-h: 44px; }

@media (max-width: 767px) {
  :root { --fs-sm: 15px; --fs-base: 17px; --fs-ctrl: 16px; /* … +1px each */ --control-h: 48px; }
}
```

### Modals & drawers on mobile

- Centred dialogs become **full-screen** or a **bottom-sheet drawer** (`vaul-drawer-direction=bottom`) below `sm`, so content and the on-screen keyboard coexist without clipping.
- Sticky form action bars stay pinned to the bottom and stack their buttons full-width (Save primary on top, Cancel below, Delete separated).

### Component responsive cheatsheet

| Element | Mobile (< 768) | Tablet (768–1023) | Desktop (≥ 1024) |
| :--- | :--- | :--- | :--- |
| Sidebar | Drawer (hamburger) | Drawer (hamburger) | Persistent `w-64` |
| Stat cards | 1-up | 2-up | 4-up |
| Forms | 1 column | 2 columns | 2 columns |
| List / table | Stacked cards | Scroll + priority cols | Full table |
| Chart card | Stats stack above plot | Plot + stats side by side | Plot + stats side by side |
| Header search | Icon → expands | Inline (narrow) | Inline (wide) |
| Modal | Full-screen / bottom-sheet | Centred | Centred |
| Buttons / inputs | `h-12` (48px) | `h-11` (44px) | `h-11` (44px) |
| Font sizes | +1px (all) | base | base |
| Content padding | `p-4` | `p-5`–`p-6` | `p-6` + max-width |

### v0.5 implementation notes — what's actually wired

The spec above is aspirational. This is what's in code as of v0.5, where it diverges and why:

- **Breakpoint boundary is `md` (768px), not `lg`.** Sidebar collapses to a drawer below `md`. The persistent `w-64` shell appears at `md:` and above. This shifts the "stacked content" tier from <1024px to <768px — chosen so iPad-portrait (768px) gets the full shell instead of the drawer.
- **List tables: horizontal scroll, not stacked cards.** Explicit project choice (carried forward from earlier dev). Lists wrap their grid in an outer `overflow-x-auto` + inner `min-w-[640/700/820]px` so columns keep natural widths on mobile and the user swipes horizontally to reach off-screen columns. Implemented in `list-table.tsx`, `tasks-board.tsx`, `transactions-table.tsx`. The "stacked cards" pattern in the spec above is not used.
- **Page header chrome stacks.** `PageShell` and `EditPageChrome` use `flex flex-col gap-3 md:flex-row md:items-center md:justify-between` so title sits above its action cluster on mobile, side-by-side on `md:`. Title shrinks (`text-2xl` mobile, `text-[28px]` `md:`); `EditPageChrome` adds `truncate` so long invoice/customer names don't push the action buttons off-screen.
- **Critical `min-w-0` on the app-shell column.** `app-shell.tsx` wraps the right column in `flex min-w-0 flex-1 flex-col` (and the inner `<main>` also gets `min-w-0`). Without `min-w-0` on a flex column, wide intrinsic content (tables, long lines) widens the parent past the viewport and defeats every `overflow-x-auto` downstream — silently. This was the root cause of the earlier "tables appear to render but won't scroll" bug.
- **Invoice line items reshape on mobile.** Two-row layout: row 1 description spans full width; row 2 = amount + tax select + delete icon (3 columns). Desktop keeps the 4-col single row (`grid-cols-[1fr_140px_180px_40px]`). Pattern in `invoice-body-editor.tsx`.
- **CommandBar search hides on mobile.** `hidden md:block` on the search input. The hamburger + brand text + bell fit comfortably; adding the search makes the bell overflow. The aspirational "icon-that-expands" pattern from the spec is not built — search is desktop/tablet-only today.
- **Touch heights came in earlier.** Button (`h-9 max-sm:h-10`), Input (`h-9 max-sm:h-10`), Select trigger (`h-9 max-sm:h-10`), Textarea (`min-h-[88px] max-sm:min-h-[97px]`) were already in place pre-v0.5. The 48px-mobile target in the cheatsheet is not enforced — controls bump to 40px (`h-10`) on mobile.

### Bounded-table pattern (v0.10.3)

Most lists go through `FilteredList → ListTable`, which is already height-bound by the page chrome and renders its own pagination footer. Standalone tables that don't sit inside `ListTable` — Reports' `TotalsTable`, the Audit Log table, and the small Settings admin tables (Users, API Keys, Recurring Schedules, Data Retention) — would otherwise grow without bound and push the page scrollbar down past 5000+ pixels. Pattern to keep them in their card:

```tsx
<div className="max-h-[60vh] overflow-auto rounded-md border border-slate-100">
  <table>
    <thead className="sticky top-0 z-10 bg-white">
      {/* header cells must each carry `bg-white` so the sticky row doesn't
          become transparent over the scrolling body */}
      <tr>{/* … */}</tr>
    </thead>
    <tbody>{/* … */}</tbody>
  </table>
  {/* For tables that can exceed ~100 rows (Audit Log), drop the existing
      `<Pagination>` component here outside the scroll container so the
      footer remains visible. */}
</div>
```

Key constraints:
- The `bg-white` on each `<th>` is load-bearing — `sticky` keeps the row in flow, and without an opaque background body rows scroll *under* it visibly.
- `max-h-[60vh]` matches the visual rhythm of `Card` heights elsewhere; keep this value consistent so different admin pages don't have wildly different scroll regions.
- For Reports' `TotalsTable`, parents + children remain in document order (no virtualisation, no grouping headers) — the sticky-thead is the only scaffolding.
- Audit Log (`/settings/audit`) loads up to 500 rows and slices them client-side 50/page via the standard `<Pagination>` — same component used in `list-table.tsx`. Reuse it; don't reinvent.

### PWA shell

Installable since v0.5.

- **Manifest** at `app/manifest.ts` (Next 15 metadata route → `/manifest.webmanifest`). `display: 'standalone'`, theme color `#323D59` (sidebar navy), background `#EDEEF3` (page bg).
- **Icons** in `frontend/public/`: `icon.svg` (favicon), `icon-192.png`, `icon-512.png`, `icon-maskable.png` (full-bleed), `apple-icon-180.png`. All hand-rendered from the `$` glyph that anchors the brand wordmark.
- **Service worker** at `public/sw.js`. Cache strategies: cache-first for `/_next/static/*` and the icon set; network-first for HTML navigation with a cached-shell fallback (so the app opens offline showing the last-good page); never caches `/api/*`. `CACHE_VERSION` is bumped per release so stale caches purge on activate.
- **Registration** is gated to `production` builds in `components/pwa/sw-register.tsx` — dev never registers, so HMR isn't fought.
- **iOS Add-to-Home-Screen** uses `apple-icon-180.png` + the `appleWebApp` metadata in `app/layout.tsx`. `viewport.themeColor` paints the status bar bezel.

---

## Implementation Notes

- **Architecture:** shadcn-style, slot-based components. Style hooks are `data-slot`, `data-state`, and `aria-invalid` rather than bespoke class names — target these for variant styling.
- **Stack mapping (Vue / Nuxt):** the token system and patterns are framework-agnostic. In a Nuxt 3 / Vue 3 codebase, use **shadcn-vue** (built on **Reka UI**) for the primitives, the **vaul-vue** drawer, and **Recharts**-equivalent charting (e.g. unovis / vue-chrts) — the CSS hooks referenced here (`data-slot`, `cmdk-*`, `vaul-drawer-direction`, `.recharts-*`) come from the compiled stylesheet and map onto the corresponding Vue primitives.
- **Tokens first:** consume `--primary`, `--muted-foreground`, etc. via Tailwind theme tokens (e.g. `bg-primary`, `text-muted-foreground`); never hard-code hex in components, so a future dark mode or rebrand is a single token swap.
- **Radius & spacing** flow from `--radius` and the 4px grid — keep new components on those steps.
- **Font:** load **Noto Sans** as `--font-noto-sans` (e.g. via `@nuxt/fonts`); mono stack for figures/IDs.
- **Not yet defined:** a dark-mode token set, and `text-xl` (1.25rem). Add the dark theme by re-mapping the existing token names inside `.dark { … }`; add `text-xl` only if a real intermediate heading appears.


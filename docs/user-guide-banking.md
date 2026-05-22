# Banking — User Guide

Last updated: 2026-05-22 (Phase C complete — AI categorisation, review queue, AI-drafted rules, history drawer)

A note on navigation: every detail or wizard page under Banking has a back button (←) in the top-left that returns you to the parent listing — `/accounts/[id]` → `/accounts`, `/vendors/extract` → `/vendors`, `/rules/test` → `/rules`. Edit pages use the existing EditPageChrome back button that was introduced in Phase A.

---

## 1. What Banking is

The Banking module tracks accounts, transactions, and categorises them — either manually, via rules you write, via the CSV import flow, or via AI. Phase A added accounts and CSV import. Phase B added Categories, Vendors, Rules, an automatic categorisation engine, and a sandbox for testing rules. Phase C adds AI-assisted categorisation throughout.

The module lives under the Banking section of the sidebar. Its pages are:

- `/accounts` — your bank accounts
- `/transactions` — all transactions across all accounts
- `/transactions/ai-review` — review queue for AI-suggested categorisations
- `/categories` — category definitions
- `/vendors` — vendor (merchant/payee) definitions
- `/vendors/extract` — wizard to generate vendors from imported descriptions
- `/rules` — categorisation rules (includes AI Drafts tab)
- `/rules/new` and `/rules/[id]/edit` — rule editor
- `/rules/test` — test rules against transactions without changing anything
- `/settings/import-logs` — permanent record of every CSV import
- `/settings/ai-setup` — configure AI providers for categorisation

---

## 2. Accounts

The `/accounts` page lists all your bank accounts. Each account has:

| Field | Notes |
|---|---|
| Name | Free text, e.g. "Westpac Everyday" |
| Bank | The institution name |
| Account number | Optional, for your reference only |
| Opening balance | The balance at the time you started tracking this account in SimpleBooks. Used as the base for the running balance calculation. |
| Opening date | The date your opening balance is accurate to |
| Active / Archived | Controls visibility; archived accounts are hidden from default lists |

**Create**: click "New account", fill the form, save.

**Edit**: click an account row to open its detail page, then click Edit.

**Archive vs delete**: there is no hard delete. Archiving sets the account to inactive; the account disappears from default views but all its transactions remain. You can restore an archived account at any time.

**Current balance**: shown on the account detail page. Calculated as `openingBalance + SUM(all transaction amounts for this account)`. There is no field to manually override the running balance.

![Account list page](docs/images/user-guide-banking/accounts-list.png)

---

## 3. Transactions

Two views:

- `/transactions` — all transactions across every account. Shows an Account column.
- `/accounts/[id]` — transactions for one account. Has an "Import CSV" button in the header.

### 3.1 Table layout

Each row shows: Date · Description · Category (colour-coded pill, or "—" if uncategorised) · Amount · Running Balance · Vendor · Account (global view only) · Actions.

Split transactions show a "(split: N)" indicator next to the category column; the category pill reflects the first split's category.

### 3.2 Sorting and filtering

The table uses server-side sorting, filtering, and pagination (200 rows per page). You can sort by Date, Description, Amount, or Balance. The default sort is Date descending, then by id descending — so same-day rows appear in a stable, most-recent-first order.

Filters available:

- Date range (from / to)
- Account multi-select (global view only)
- Categorised / Uncategorised / All toggle

### 3.3 Row actions

The Actions menu (three-dots button on each row) offers three options:

- **Edit** — open the edit modal (see 3.4 below).
- **Split** — open the split modal directly to divide the transaction across multiple categories (see Section 11).
- **Create rule** — open the rule editor so you can write a rule for similar transactions (you fill in the conditions and outcome).

### 3.4 Edit modal

The edit modal lets you change the parts of a transaction that you control, while keeping the bank-statement facts read-only.

- **Read-only fields** (shown in a grey panel at the top): Date · Description · Amount · Balance · Account. These come from the imported CSV and cannot be changed — editing them would defeat the duplicate-detection hash. If something here is wrong, you'd need to delete the row and re-import.
- **Editable fields**:
  - **Category** — dropdown (or "uncategorised").
  - **Vendor** — dropdown (or "none").
  - **Notes** — free-text, up to 2000 characters.
- **Manage splits** — a button at the bottom switches from the edit modal to the split modal. Use this if the transaction needs a multi-category breakdown instead of a single category.
- **Banner for split transactions** — if the transaction already has splits, the modal shows an amber warning: setting a single Category here resets the splits. Click "Manage splits" instead to preserve the breakdown.
- Manual edits write a `CategorisationEvent` row with `source=USER`. The AI uses these events as few-shot examples when suggesting categories (see §15).

---

## 4. CSV Import — the full workflow

You import transactions from an account's detail page. Click "Import CSV" at the top right. The import is a four-step flow.

### 4.1 Choose file

Drag and drop, or click to choose a file. Requirements:

- Must be a `.csv` file
- Maximum 10 MB
- The file is parsed entirely in memory — it is never written to disk on the server

### 4.2 Sniff (auto-detect)

The server analyses the file and infers:

- Whether row 1 is a header row
- The date format (DD/MM/YYYY, MM/DD/YYYY, or YYYY-MM-DD)
- The role of each column: Date, Description, Amount (signed), Debit, Credit, Balance, or Ignore

You see the first five rows of the file with the inferred column roles pre-selected as dropdown headers above each column.

![CSV import sniff step](docs/images/user-guide-banking/csv-import-sniff.png)

### 4.3 Confirm mapping

Review and override the auto-detected choices:

- Toggle "File has a header row" if the sniffer got it wrong.
- Change the date format dropdown.
- Change the role dropdown above any column.

Valid column combinations:

| Style | Required columns |
|---|---|
| Signed amount (Style A) | Exactly one Date, one or more Description, one Amount. No Debit or Credit. |
| Separate debit + credit (Style B) | Exactly one Date, one or more Description, one Debit, one Credit. No Amount. |

A Balance column is optional in both styles. Columns marked Ignore are skipped.

### 4.4 "Categorise based on rules" checkbox

A checkbox appears at the bottom of the mapping step. When ticked:

- After all rows are inserted, the categorisation engine runs over just the newly imported transactions (not your entire history).
- It runs the vendor-matching pass first, then the rule-matching pass — the same sequence as clicking "Re-categorise" manually after the import.
- The import report (see 4.6) includes a Categorisation section showing how many rows were matched and which rules fired.

Leave it unticked to import without categorisation. You can always run Re-categorise later from the transactions table.

### 4.5 Already-imported warning

If the server detects that this exact file was previously imported to this account (identified by a SHA-256 hash of the file contents), a yellow banner appears before you confirm:

> "This exact file was already imported on YYYY-MM-DD. Proceeding will only insert new rows."

This is informational. You can still proceed. The per-row duplicate detection (see 4.6) ensures no duplicate transactions land regardless.

### 4.6 Commit and report

Click Import. The server:

1. Parses the CSV with your confirmed column mapping.
2. For each row, computes a hash using: `sha256(date | amount | normalisedDescription | runningBalance)`. The running balance component is included only when a Balance column was mapped.
3. Inserts rows whose hash does not already exist for this account. Rows with a matching hash are skipped as duplicates.
4. Optionally runs the categorisation engine (if the checkbox was ticked).
5. Returns the import report.

The report popup shows:

- **Counts at the top**: Total rows in file / Imported / Duplicates skipped / Failed to parse.
- **Warnings**: e.g. duplicate-file warning if the same file was previously imported.
- **Categorisation section** (only when the checkbox was ticked): vendor match count, rule match count, ambiguous vendor count, and a per-rule breakdown of how many rows each rule fired on.
- **Imported**: list of the rows that were inserted.
- **Duplicates**: rows that were skipped because their hash already existed, with a link to the existing transaction for each.
- **Failed**: rows that could not be parsed, with a reason and the raw values.

![CSV import report](docs/images/user-guide-banking/csv-import-report.png)

### 4.7 Import log

Every import is permanently recorded. Go to `/settings/import-logs` to see a list of all past imports across all accounts. Click any import to read the same report contents in a read-only view. Useful for auditing what came in, or confirming whether a file was already processed.

---

## 5. Categories

Categories are the targets of all categorisation. Each category has:

- **Name** — e.g. "Groceries"
- **Kind** — one of: Income, Expense, Transfer, Other. The kind determines the pill colour on transactions.
- **Sort order** — controls the ordering of categories in dropdowns and pickers.

### 5.1 Default categories

Fifteen categories are seeded on first run:

| Kind | Categories |
|---|---|
| Income | Customer payments, Personal, Refunds, Other income |
| Expense | Rent, Utilities, Telecom, Insurance, Groceries, Fuel, Subscriptions & Online, Personal, Bank fees |
| Transfer | Between own accounts |
| Other | Uncategorised review |

Edit any of these or add your own at `/categories`.

### 5.2 Deleting categories

A category cannot be deleted while anything references it. This includes transactions that use the category directly, transaction splits, and rules whose outcome targets that category. The error message shows the count of each referencing type. To delete: re-assign the references first, then delete.

---

## 6. Vendors

A Vendor represents a merchant, person, customer, bank, or counterparty that appears in your transaction descriptions. The central concept is **aliases**.

### 6.1 How aliases work

Each vendor has a list of lowercase substrings. When the auto-vendor-matching pass runs, it checks each transaction description for any of these substrings, case-insensitively. If a substring is found, that vendor is assigned to the transaction.

Example: the seeded Vendor "PayPal" has aliases `["paypal", "617704"]`. A description like `Direct Debit 617704 PAYPAL AUSTRALIA 1050102939603` matches both aliases. Both aliases belonging to the same vendor is fine — the match is unambiguous.

**Trailing spaces matter.** The alias `rac ` (with a trailing space) matches the string "rac " inside "Direct Debit rac insurance" but does not match "racing" or "racking". Use a trailing space when a short alias would otherwise match unrelated words. For example, `rac ` correctly targets RAC insurance without accidentally matching "tracking" or "racing club".

### 6.2 Default vendors

39 vendors are seeded covering common Australian payees:

- **Petrol**: BP, Caltex, Shell, Ampol, 7-Eleven, Costco Fuel, Liberty, Mobil, Vibe, United Petroleum
- **Groceries**: Woolworths, Coles, IGA, ALDI, Foodland
- **Online / payments**: PayPal, Stripe, eBay, Amazon AU, Apple, Google Play
- **Telco**: Telstra, Optus, Vodafone, TPG, Aussie Broadband
- **WA utilities**: Synergy, Water Corporation, Alinta Energy
- **Insurance**: RAC, NRMA, AAMI, Allianz, Bupa, Medibank
- **Banks**: Commonwealth, NAB, Westpac, ANZ

Edit vendors at `/vendors`. Add new aliases to existing vendors, or create new vendors for payees not covered by the seed.

### 6.3 When vendor matching runs

Vendor matching runs:

- During Re-categorise (always runs as the first pass before rules).
- During CSV import when the "Categorise based on rules" checkbox is ticked.
- During the Test Rules sandbox run (when "Include vendor matching pass" is toggled on).

Vendor matching does not automatically set a category. It sets the `vendorId` on the transaction. Rules can then use `Vendor is X` conditions to categorise.

---

## 7. Vendor extraction wizard

At `/vendors/extract`. Use this when you have a batch of imported transactions and want the system to suggest vendors from the description text, rather than creating them by hand.

### 7.1 Source

Choose either:

- **Use all imported transactions** — optionally filtered by date range and account.
- **Upload a CSV** — parsed in-memory, never saved. Use this to preview vendor candidates from a new file before importing it.

### 7.2 Review candidates

The server scans the descriptions, strips common noise prefixes (Direct Debit, Direct Credit, Fast Transfer From, BPAY, etc.), removes trailing reference numbers, tokenises the remaining text, and identifies frequent n-grams (word sequences) as candidate vendor names.

For each candidate you see:

| Column | Meaning |
|---|---|
| Checkbox | Pre-checked unless the candidate would collide with an existing vendor. Uncheck to skip. |
| Name | Editable. The server's best guess at the vendor name. |
| Kind | Merchant, Person, Customer, Bank, or Other. Heuristic based on amount signs and token patterns. Edit freely. |
| Aliases | Comma-separated list. The server proposes the matched n-gram. Edit to tighten or broaden. |
| Matches | How many descriptions in your source data hit this candidate. |
| Exists badge | Shown if this candidate overlaps an existing vendor's aliases. Proceeding will merge the new aliases into the existing vendor. |

### 7.3 Create

Click "Create selected". The server creates new vendors for uncolliding candidates and merges new aliases into existing vendors for colliding ones. A summary card shows created / updated / skipped counts, plus a shortcut to run Re-categorise immediately.

---

## 8. Rules

A Rule says: "when these conditions all match a transaction, set its category to X."

Phase B supports AND-only logic per rule — all conditions in a rule must be true. To get OR behaviour, create two separate rules with the same outcome category.

### 8.1 What a rule contains

- **Name** — human-readable label, e.g. "Woolworths groceries".
- **Conditions** — one or more `(field, operator, value)` rows, joined with AND.
- **Outcome** — a target category (required), an optional vendor override, and an optional note that gets appended to the transaction's notes field when the rule fires.

### 8.2 Condition fields and operators

| Field | Available operators | Value type |
|---|---|---|
| Description | contains, equals, starts with, ends with | Text. Case-insensitive; whitespace is collapsed before matching. |
| Amount | =, >, <, between | Number. Signed: negative means money going out (debit). |
| Vendor | is, is one of | Single vendor or list of vendors. Set by the vendor-matching pass before rules run. |
| Account | is, is one of | Single account or list of accounts. |

### 8.3 Rule editor

At `/rules/new` or `/rules/[id]/edit`. Three sections:

**Name** — free text field at the top.

**Conditions (ALL must match)** — a list of condition rows. Add rows with "Add condition". Two preset chips are available: "Income only" (inserts Amount > 0) and "Expense only" (inserts Amount < 0). Use these when you want a description keyword to only match positive or negative amounts, so the rule does not accidentally fire on refunds or reversals.

**Outcome** — category dropdown (required), optional vendor dropdown, optional note text.

A "Sample matches" counter at the bottom of the editor shows approximately how many existing transactions in your database match the current conditions. This is a dry-run hint — it reflects your existing data, not a guarantee about future imports.

![Rule editor](docs/images/user-guide-banking/rule-editor.png)

### 8.4 Rules list

At `/rules`. Rules are ordered by priority number; lower numbers win. Each row shows:

- Display rank (1, 2, 3 …)
- Rule name
- Condition summary
- Target category pill
- Hit count and "Last fired" date
- Action buttons: Activate/Deactivate, move up (↑), move down (↓), Edit, Delete

The tabs at the top filter by: **USER** (rules you wrote) / **AI Drafts** / **Approved** / **Denied**. AI Drafts are populated by the "Find candidates from history" action (see §15.4).

### 8.5 Priority and ordering

When the rule engine evaluates a transaction, it tests rules in priority order (lowest number first) and stops at the first rule that matches. The winning rule's category is applied.

To change priority: use the ↑ and ↓ buttons on the list page. The display rank updates immediately.

### 8.6 Worked example: categorise PayPal expenses

Goal: every PayPal debit should be categorised as Expense — Subscriptions & Online.

1. Click "+ New rule".
2. Name: `PayPal expenses`.
3. Add condition: Description **contains** `paypal`.
4. Click the "Expense only (amount < 0)" preset chip — this adds a second condition: Amount **<** 0.
5. Set Outcome category to `Expense — Subscriptions & Online`.
6. Save.

Now click Re-categorise on the transactions table. PayPal debit rows get categorised. The rule's hit count increments.

If you also receive PayPal credits (refunds), they will not match this rule because of the Amount < 0 condition. Create a separate rule for those with a different category if needed.

### 8.7 Worked example: priority conflict

You have transactions labelled "Transfer to Danny" (money sent to a friend) and "Office Rent Danny" (your landlord's name is Danny). Two rules both match on "Danny".

- Rule A: Description contains `danny` → Expense — Personal (priority 1010)
- Rule B: Description contains `danny` AND Amount = -550.00 → Expense — Rent (priority 1000)

Rule B has the lower priority number so it is tested first. The $550 rent transaction matches Rule B and is categorised as Rent. Other Danny transactions do not match Rule B's amount condition, fall through to Rule A, and are categorised as Personal.

Use the Test Rules sandbox (Section 9) to verify conflicts like this before running Re-categorise.

---

## 9. Test Rules sandbox

At `/rules/test`. A yellow banner at the top reads: "Rules Test Ground — nothing on this page changes any transaction." You can experiment freely.

### 9.1 Configure

**Source** — choose which transactions to test against:

- "Existing transactions" — optionally filtered by date range and account multi-select.
- "Upload a CSV" — parsed in-memory. For now, MVP routes this to the standard import flow where you can preview without committing.

**Rules to include** — all active rules are pre-checked. Untick any rules you want to exclude, or tick inactive rules to preview what would happen if you activated them. This lets you test a draft rule in isolation or compare your rule set with and without a particular rule.

**Include vendor matching pass** — toggle this to run vendor identification before rule matching, the same way the live engine works. Turn it off if you want to test pure rule logic without vendor assignment.

### 9.2 Run

Click "Test rules". A results table appears with one row per transaction tested:

| Column | Meaning |
|---|---|
| Date | Transaction date |
| Description | Transaction description |
| Amount | Signed amount |
| Vendor matched | Which vendor the matching pass identified, if any |
| Winning rule | The first rule (by priority) that matched, with its priority number |
| Category set | The category the winning rule would assign |
| Also matches | Other rules (lower-priority) that also matched — click to open them in the editor |

Transactions that no rule matches are shown with "No match" in the Winning rule column. These remain uncategorised.

![Test rules results](docs/images/user-guide-banking/test-rules-results.png)

### 9.3 Iteration loop

The sandbox has no side effects. The intended workflow is:

1. Run the sandbox to see what your current rules would do.
2. Spot a transaction that is uncategorised or going to the wrong category.
3. Open the rule editor (click the rule name in the Winning rule column to jump to it, or create a new rule).
4. Adjust conditions or priority.
5. Run the sandbox again.
6. When the results look correct, close the sandbox and run Re-categorise for real.

---

## 10. Re-categorise

Re-categorise is a bulk action that applies the vendor-matching pass and rule engine to a set of transactions.

**Where to find it**: "Re-categorise" button at the top of the `/transactions` table, or the "Re-categorise uncategorised" shortcut on the account header card on `/accounts/[id]`.

### 10.1 The dialog

The dialog has two options:

**Apply rules to:**
- Uncategorised only (default) — only processes transactions that currently have no category and no splits.
- All transactions — re-evaluates the entire filtered set. Use this if you have changed your rules and want to re-apply them over already-categorised transactions.

**Preserve manual splits (recommended):** when ticked, transactions that have been split are left alone. Splits represent deliberate decisions; the engine should not override them. Leave this on unless you specifically intend to recategorise split transactions.

The current filter on the transactions table (account, date range) is automatically passed into the engine. To re-categorise just one account's April transactions: set the account filter and date range first, then open the dialog.

### 10.2 Result card

After the run, a result card shows:

- Number of transactions categorised
- Per-rule breakdown (rule name, hit count)
- Count of transactions with no matching rule (still uncategorised)
- Count of transactions skipped because they were split
- Count of transactions with ambiguous vendor matches (multiple vendors' aliases matched the same description)

Ambiguous vendor matches are a signal to refine your aliases — tighten whichever alias is too broad, or add a distinguishing condition to the relevant rule.

---

## 11. Splits

When one transaction covers multiple categories — for example, a supermarket receipt that includes both groceries and household goods — split it so each portion lands in the right category.

### 11.1 Opening the split modal

From the Actions menu on any transaction row, click "Split".

### 11.2 Adding split rows

The modal opens with one row pre-populated: the transaction's full amount in its current category (or uncategorised if none). Each split row has:

- Category picker
- Amount field
- Optional note field

The "Allocated / Remaining" badge at the bottom of the modal updates as you type. Save is disabled until Remaining reaches $0.00 — the splits must account for the entire transaction amount exactly.

Add rows with "+ Add split". Remove rows with the trash icon on each row.

### 11.3 What happens on save

- The transaction's single `categoryId` is cleared. From now on, category information lives in the split rows, not on the transaction itself.
- The split rows are written as `TransactionSplit` records.
- A categorisation event is logged with source USER.

The transactions table shows "(split: N)" in the category column for split transactions, where N is the number of splits.

### 11.4 Undoing a split

Open the split modal, delete rows until only one remains, and save. The system converts the single remaining split back to a `categoryId` on the transaction and removes the split records.

### 11.5 Rules and splits

By default, the Re-categorise engine leaves split transactions alone (the "Preserve manual splits" checkbox is on by default). A split is treated as a deliberate manual decision. If you want the engine to recategorise split transactions, untick the checkbox — but note this will remove the splits.

---

## 12. Categorisation history

Every category or vendor change — whether made manually, by a rule, by vendor matching, or by AI — writes a `CategorisationEvent` record. The record stores:

- Which transaction was changed
- The source (USER, RULE, VENDOR_MATCH, AI_DRAFT, AI_APPLIED, AI_REJECTED)
- Which rule fired (for RULE events)
- The AI's reasoning text (for AI events)
- The timestamp

Per-transaction history is accessible via the **History drawer** in the transaction edit modal (see §15). The full audit log is also queryable via `/categorisation-events` for debugging or audit purposes.

---

## 13. Rule effectiveness metrics

Each rule on the `/rules` list page shows two metrics:

- **Hit count** — how many transactions this rule has categorised since it was created (or since the count was last reset).
- **Last fired** — the date of the most recent firing.

Use these to maintain your rule set over time:

| Signal | What it means | Action |
|---|---|---|
| Hit count = 0 | The rule has never fired | Review the conditions — they may be too specific, or the pattern may not appear in your data |
| Very high hit count across unrelated transactions | The rule is too broad | Split into two or more specific rules |
| Hits several months ago, quiet since | Pattern may have stopped appearing in your data | Worth a review, but not necessarily a problem |

The AI uses these metrics — combined with the CategorisationEvent log — to find candidate patterns for draft rules. Use the "Find candidates from history" button on `/rules` to trigger this (see §15.4).

---

## 14. AI Setup

Configure the AI providers that power categorisation suggestions and rule drafting. The page is at `/settings/ai-setup` (sidebar: AI Setup, under Settings).

Any provider that implements the OpenAI `/chat/completions` API works — OpenAI, Anthropic (via their OpenAI-compatible endpoint), Mistral, Ollama (locally hosted), or any other compatible service.

### Provider fields

| Field | Notes |
|---|---|
| Name | Display label, e.g. "OpenAI GPT-4o" |
| Model | Model id sent to the provider, e.g. `gpt-4o` or `claude-3-5-sonnet-20241022` |
| API Base URL | e.g. `https://api.openai.com/v1` |
| API Key | Stored verbatim — same pattern as the SMTP password. |
| Primary | Exactly one provider has this flag. The primary is tried first on every AI call. |
| Order (backup cards) | Backups are tried in ascending order. Use the `[↑]` / `[↓]` arrows to reorder. |

Each card has explicit dirty-tracking — the Save button is enabled only when you have unsaved changes. The eye icon toggles API Key visibility.

### Rule drafting threshold

At the bottom of the page, the "Rule drafting" section lets you set the minimum number of transactions that must share a pattern before the AI proposes a draft rule. Default is 5. Raise it to reduce noise; lower it to catch smaller patterns.

---

## 15. AI categorisation

The AI reads your manual categorisations and accepted suggestions as examples, then proposes categories for uncategorised transactions and writes draft rules based on patterns it finds. No model training or fine-tuning — it learns from your history within each call.

To get started, configure at least one provider at `/settings/ai-setup`. Without a provider the AI banner shows a setup prompt instead of a suggestion.

### 15.1 Inline suggestion in the transaction edit modal

Open any transaction by clicking its row. In the edit modal:

- **Uncategorised transaction**: the AI suggestion banner loads automatically. It shows the proposed category, optional vendor match, a confidence indicator (high / medium / low), and the AI's brief reasoning.
- **Already-categorised transaction**: the banner is hidden by default. A small "Ask AI for a different opinion" link appears under the Category field — click it to request a fresh suggestion.

Three buttons respond to a suggestion:

| Button | What happens |
|---|---|
| **Accept** | The AI's category (and vendor, if any) is applied to the transaction. The modal closes. |
| **Edit** | The banner shrinks to a reminder. The Category select pre-fills with the AI's pick — you can change it. When you save, the final values are compared to the AI's pick: if they match, it records an accepted suggestion; if not, it records an edited one. |
| **Reject** | The banner hides. The modal stays open for normal manual categorisation. The suggestion is not applied. |

If you change the Category select while the suggestion banner is visible (without clicking any button), the modal transparently switches to Edit mode. Saving applies the same accept-vs-edit logic.

Cancelling the modal without acting on the banner leaves the suggestion unresolved — the same suggestion is reused if you reopen the modal within 24 hours.

### 15.2 Bulk categorisation

On the `/transactions` page, the bulk-actions menu includes **"Categorise with AI"**. Click it to open a dialog where you select accounts, a date range, and scope (uncategorised transactions only, or all). The dialog shows how many transactions match before you start.

On Start, the backend dispatches AI calls at up to 5 concurrent requests. The dialog polls for progress. When finished, a **"Review now"** button takes you to the AI review queue.

To stop a run in progress, close the dialog — this cancels the remaining calls.

### 15.3 AI review queue — `/transactions/ai-review`

Lists all transactions that have a pending AI suggestion (suggested but not yet accepted, edited, or rejected). Each row shows the suggestion banner inline with the same Accept / Edit / Reject buttons as the modal.

- **Accept** / **Reject** — act immediately; the row fades out.
- **Edit** — opens the transaction edit modal with the suggestion pre-loaded.

The toolbar includes **"Approve all high-confidence"** — a confirmation dialog then accepts every high-confidence suggestion on the current view at once.

Use filters (account, confidence, date range) to work through the queue in batches.

### 15.4 AI Drafts tab on `/rules`

The rules page has an "AI Drafts" tab. Drafts are rules the AI has proposed based on patterns it found in your categorisation history. They are inactive and do not fire until you promote them.

Per draft row actions:

| Action | What happens |
|---|---|
| **Approve** | The rule becomes active immediately and joins the normal rule set. |
| **Modify** | Opens the rule editor pre-loaded with the draft. Saving the editor promotes the rule to active — even if you made no changes. (Save = ratification.) |
| **Deny** | Marks the draft as denied. It moves to a Denied tab and will not be re-proposed for the same pattern. |

When ≥ 2 drafts are present, an **"Approve all"** button appears in the toolbar.

**"Find candidates from history"** button — triggers the AI to scan your last 180 days of accepted categorisations for new patterns and produce drafts for any it finds. Running it again immediately produces nothing (existing drafts suppress re-mining) — self-throttling.

**Saving a rule in the editor** auto-promotes an AI Draft to Approved, regardless of whether you changed the conditions.

### 15.5 History drawer — transaction edit modal

The transaction edit modal header includes a `[⏱ History (N)]` button (where N is the event count). Click it to open a read-only drawer on the right listing every categorisation event for this transaction.

Each row shows:
- A coloured badge indicating who made the change (user manual, rule engine, vendor matcher, AI suggestion, accepted/edited AI, rejected AI).
- The relative timestamp.
- The old and new category and vendor (shown only when they differ).
- The AI's reasoning text (for AI events), in italics.
- For rule-fired events, the rule name links to the rule editor.

The drawer is read-only — no actions.

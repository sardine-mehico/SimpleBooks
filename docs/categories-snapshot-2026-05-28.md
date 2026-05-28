# Categories — Snapshot 2026-05-28

Live state of the `Category` tree at the time of export. Counts are transactions currently pointing at each leaf.

## Summary

| | Count |
|---|---|
| Top-level categories | 15 |
| Subcategories | 19 |
| Total | 34 |
| Transactions categorised | 624 |
| Transactions uncategorised | 7,182 |
| Total transactions | 7,806 |

---

## Income (4 top-level)

### Income — Customer payments
- ↳ Income — Customer payments (general) — 19 txns

### Income — Other
*(no subcategories yet — leaf)*

### Income — Personal
*(no subcategories yet — leaf)*

### Income — Refunds
*(no subcategories yet — leaf)*

---

## Expense (9 top-level)

### Expense — Bank fees
- ↳ Account Keeping Fee — 3 txns
- ↳ Card Replacement — 1 txn
- ↳ Expense — Bank fees (general) — 56 txns
- ↳ International Transaction Fee — 4 txns
- ↳ Overdraft Fee — 3 txns

### Expense — Fuel
- ↳ Expense — Fuel (general) — 165 txns

### Expense — Groceries
- ↳ Aldi — 5 txns
- ↳ Coles — 5 txns
- ↳ Expense — Groceries (general) — 60 txns
- ↳ IGA — 5 txns
- ↳ Woolworths — 5 txns

### Expense — Insurance
*(no subcategories yet — leaf)*

### Expense — Personal
*(no subcategories yet — leaf)*

### Expense — Rent
*(no subcategories yet — leaf)*

### Expense — Subscriptions & Online
- ↳ Adobe Creative Cloud — 3 txns
- ↳ Disney+ — 5 txns
- ↳ Expense — Subscriptions & Online (general) — 48 txns
- ↳ Netflix — 4 txns
- ↳ Spotify — 4 txns
- ↳ iCloud Storage — 4 txns

### Expense — Telecom
*(no subcategories yet — leaf)*

### Expense — Utilities
*(no subcategories yet — leaf)*

---

## Transfer (1 top-level)

### Transfer — Between own accounts
- ↳ CBA Smart Access — 0 txns *(auto-created by the transfer-as-account-picker flow; unused after test cleanup)*

---

## Other (1 top-level)

### Other — Uncategorised review
*(no subcategories yet — leaf)*

---

## Notes

- Each group with at least one subcategory contains a `(general)` child created by the split flow — that's where existing categorised transactions landed when the parent was first converted from a leaf to a group.
- `Transfer — Between own accounts` is the special TRANSFER-kind parent that triggers the "Other account" dropdown swap in the Edit Transaction modal — picking a destination account there auto-creates a same-named subcategory under this parent.
- All four `Income — *` top-level rows and the bare leaves under Expense (`Insurance`, `Personal`, `Rent`, `Telecom`, `Utilities`, `Other — Uncategorised review`) are still simple leaves — transactions attach directly to them without a subcategory step.

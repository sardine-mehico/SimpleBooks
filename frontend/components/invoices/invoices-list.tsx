"use client";

import { Badge } from "@/components/ui/badge";
import {
  FilteredList,
  textIncludes,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import { STATUS_TONE, INVOICE_STATUSES, type Invoice, type BillingCompany } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";

const STATUS_LABEL = Object.fromEntries(INVOICE_STATUSES.map((s) => [s.value, s.label]));

const columns: Column<Invoice>[] = [
  {
    key: "num",
    label: "Invoice No",
    render: (r) => (
      <span className="font-mono text-xs text-slate-700 tabular-nums">INV-{r.invoiceNumber}</span>
    ),
    width: "120px",
    sortValue: (r) => r.invoiceNumber,
  },
  {
    key: "date",
    label: "Invoice Date",
    render: (r) => <span className="text-slate-600 tabular-nums">{formatDate(r.invoiceDate)}</span>,
    width: "130px",
    sortValue: (r) => new Date(r.invoiceDate),
  },
  {
    key: "customer",
    label: "Customer",
    render: (r) => <span className="font-medium text-slate-900">{r.customer?.name ?? "—"}</span>,
    width: "1.5fr",
    sortValue: (r) => r.customer?.name ?? "",
  },
  {
    key: "company",
    label: "Billing Company",
    render: (r) => <span className="text-slate-700">{r.billingCompany?.name ?? "—"}</span>,
    width: "1.5fr",
    sortValue: (r) => r.billingCompany?.name ?? "",
  },
  {
    key: "amount",
    label: "Amount",
    align: "right",
    render: (r) => formatCurrency(Number(r.totalAmount)),
    width: "140px",
    sortValue: (r) => Number(r.totalAmount),
  },
  {
    key: "due",
    label: "Due Date",
    render: (r) => (
      <span className="text-slate-600 tabular-nums">{r.dueDate ? formatDate(r.dueDate) : "—"}</span>
    ),
    width: "130px",
    sortValue: (r) => (r.dueDate ? new Date(r.dueDate) : null),
  },
  {
    key: "status",
    label: "Status",
    render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
    width: "130px",
    sortValue: (r) => STATUS_LABEL[r.status],
  },
];

// Inclusive day-bound comparison against the invoice date.
function dateInRange(iso: string | null | undefined, from: string, to: string): boolean {
  if (!iso) return !from && !to;
  if (!from && !to) return true;
  const d = new Date(iso).getTime();
  if (from) {
    const fromMs = new Date(from + "T00:00:00").getTime();
    if (d < fromMs) return false;
  }
  if (to) {
    const toMs = new Date(to + "T23:59:59.999").getTime();
    if (d > toMs) return false;
  }
  return true;
}

export function InvoicesList({
  initial,
  companies,
}: {
  initial: Invoice[];
  companies: BillingCompany[];
}) {
  const filterFields: FilterFieldDef[] = [
    { key: "number", label: "Invoice No", type: "text", placeholder: "e.g. 1004" },
    { key: "customer", label: "Customer", type: "text", placeholder: "Search by customer…" },
    {
      key: "company",
      label: "Billing Company",
      type: "select",
      options: companies.map((c) => ({ value: c.id, label: c.name })),
    },
    { key: "dateFrom", label: "Date from", type: "date" },
    { key: "dateTo", label: "Date to", type: "date" },
    { key: "status", label: "Status", type: "select", options: INVOICE_STATUSES },
  ];

  return (
    <FilteredList<Invoice>
      title="Invoices"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/invoices/${r.id}`}
      newHref="/invoices/new"
      newLabel="New invoice"
      emptyMessage="No invoices yet."
      filterFields={filterFields}
      filterFn={(r, v) =>
        textIncludes(`INV-${r.invoiceNumber} ${r.invoiceNumber}`, v.number ?? "") &&
        textIncludes(r.customer?.name, v.customer ?? "") &&
        selectMatches(r.billingCompanyId ?? null, v.company ?? "") &&
        dateInRange(r.invoiceDate, v.dateFrom ?? "", v.dateTo ?? "") &&
        selectMatches(r.status, v.status ?? "")
      }
      defaultSort={{ key: "num", direction: "desc" }}
    />
  );
}

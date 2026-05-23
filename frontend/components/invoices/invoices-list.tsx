"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Filter, Plus, Send } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { ListTable, type Column, type SortSpec } from "@/components/data/list-table";
import {
  FilterPanel,
  countActive,
  textIncludes,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filter-panel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_TONE, INVOICE_STATUSES, type Invoice, type BillingCompany } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { bulkPdfDownload } from "@/lib/invoices";
import { BulkSendInvoicesDialog } from "@/components/invoices/bulk-send-invoices-dialog";

const STATUS_LABEL = Object.fromEntries(INVOICE_STATUSES.map((s) => [s.value, s.label]));

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
  const router = useRouter();

  // Filter state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk action state
  const [pdfBusy, setPdfBusy] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

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

  const activeCount = useMemo(() => countActive(filterValues), [filterValues]);

  const filtered = useMemo(() => {
    if (activeCount === 0) return initial;
    return initial.filter(
      (r) =>
        textIncludes(`INV-${r.invoiceNumber} ${r.invoiceNumber}`, filterValues.number ?? "") &&
        textIncludes(r.customer?.name, filterValues.customer ?? "") &&
        selectMatches(r.billingCompanyId ?? null, filterValues.company ?? "") &&
        dateInRange(r.invoiceDate, filterValues.dateFrom ?? "", filterValues.dateTo ?? "") &&
        selectMatches(r.status, filterValues.status ?? ""),
    );
  }, [initial, filterValues, activeCount]);

  // Whether all visible rows are selected
  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const someSelected = !allSelected && filtered.some((r) => selectedIds.has(r.id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const blob = await bulkPdfDownload([...selectedIds]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoices-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      // Surface the error in the console; a toast system isn't available here
      console.error("Bulk PDF download failed:", e?.message);
    } finally {
      setPdfBusy(false);
    }
  }

  function handleSendClose() {
    setSendDialogOpen(false);
    setSelectedIds(new Set());
    router.refresh();
  }

  // Checkbox column (leftmost, not sortable)
  const checkboxColumn: Column<Invoice> = {
    key: "__select__",
    label: "",
    width: "40px",
    render: (r) => (
      <input
        type="checkbox"
        checked={selectedIds.has(r.id)}
        onChange={() => toggleRow(r.id)}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        aria-label={`Select INV-${r.invoiceNumber}`}
      />
    ),
  };

  const dataColumns: Column<Invoice>[] = [
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

  const columns = [checkboxColumn, ...dataColumns];

  const defaultSort: SortSpec = { key: "num", direction: "desc" };

  return (
    <PageShell
      title="Invoices"
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFilterOpen((o) => !o)}
            className={cn(filterOpen && "border-indigo-300 bg-indigo-50/40")}
          >
            <Filter className="h-4 w-4" />
            Filter
            {activeCount > 0 && (
              <span className="ml-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                {activeCount}
              </span>
            )}
          </Button>
          <Button asChild>
            <Link href="/invoices/new">
              <Plus className="h-4 w-4" />
              New invoice
            </Link>
          </Button>
        </>
      }
    >
      {filterOpen && (
        <FilterPanel
          fields={filterFields}
          values={filterValues}
          onChange={(k, v) => setFilterValues((s) => ({ ...s, [k]: v }))}
          onClose={() => setFilterOpen(false)}
          onClear={() => setFilterValues({})}
          activeCount={activeCount}
        />
      )}

      {/* Bulk-actions bar — visible only when ≥1 row is selected */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
          {/* Header checkbox (select-all / clear-all) */}
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            aria-label="Select all visible invoices"
          />
          <span className="text-sm font-medium text-slate-700">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={downloadPdf}
            disabled={pdfBusy}
          >
            <Download className="h-4 w-4" />
            {pdfBusy ? "Downloading…" : "Download PDF"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSendDialogOpen(true)}
            disabled={pdfBusy}
          >
            <Send className="h-4 w-4" />
            Send emails
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* The header checkbox row — sits above ListTable when nothing is selected */}
      {selectedIds.size === 0 && filtered.length > 0 && (
        <div className="mb-1 flex items-center gap-2 px-1">
          <input
            type="checkbox"
            checked={false}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            aria-label="Select all visible invoices"
          />
          <span className="text-xs text-slate-400">Select all</span>
        </div>
      )}

      <ListTable
        columns={columns}
        rows={filtered}
        rowHref={(r) => `/invoices/${r.id}`}
        defaultSort={defaultSort}
        emptyMessage={
          activeCount > 0 ? "No matches for the current filters." : "No invoices yet."
        }
      />

      <BulkSendInvoicesDialog
        open={sendDialogOpen}
        selectedIds={selectedIds}
        onClose={handleSendClose}
      />
    </PageShell>
  );
}

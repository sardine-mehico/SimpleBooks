"use client";

import { Badge } from "@/components/ui/badge";
import {
  FilteredList,
  textIncludes,
  selectMatches,
  type FilterFieldDef,
} from "@/components/data/filtered-list";
import type { Column } from "@/components/data/list-table";
import {
  SENDING_OPTIONS,
  type BillingCompany,
  type Customer,
  type RecurringRule,
  type RecurringSchedule,
} from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { sortActiveFirst, labelForOption } from "@/lib/sort-selectable";

const SENDING_LABEL = Object.fromEntries(SENDING_OPTIONS.map((s) => [s.value, s.label]));

const columns: Column<RecurringRule>[] = [
  {
    key: "name",
    label: "Schedule Name",
    render: (r) => <span className="font-medium text-slate-900">{r.scheduleName}</span>,
    width: "2fr",
    sortValue: (r) => r.scheduleName,
  },
  {
    key: "customer",
    label: "Customer",
    render: (r) => <span className="text-slate-700">{r.customer?.name ?? "—"}</span>,
    width: "1.5fr",
    sortValue: (r) => r.customer?.name ?? "",
  },
  {
    key: "schedule",
    label: "Recurring Schedule",
    render: (r) => <span className="text-slate-700">{r.recurringSchedule?.name ?? "—"}</span>,
    width: "150px",
    sortValue: (r) => r.recurringSchedule?.name ?? "",
  },
  {
    key: "next",
    label: "Next Run",
    render: (r) => <span className="text-slate-600 tabular-nums">{formatDate(r.nextRunAt)}</span>,
    width: "120px",
    sortValue: (r) => new Date(r.nextRunAt),
  },
  {
    key: "amount",
    label: "Amount",
    align: "right",
    render: (r) => formatCurrency((r.lineItems ?? []).reduce((s, l) => s + Number(l.unitPrice || 0), 0)),
    width: "120px",
    sortValue: (r) => (r.lineItems ?? []).reduce((s, l) => s + Number(l.unitPrice || 0), 0),
  },
  {
    key: "sending",
    label: "Sending",
    render: (r) => <span className="text-slate-600">{SENDING_LABEL[r.sendingOption]}</span>,
    width: "180px",
    sortValue: (r) => SENDING_LABEL[r.sendingOption],
  },
  {
    key: "active",
    label: "Active",
    render: (r) => (
      <Badge tone={r.active ? "completed" : "cancelled"}>{r.active ? "Active" : "Paused"}</Badge>
    ),
    width: "100px",
    sortValue: (r) => r.active,
  },
];

export function RecurringList({
  initial,
  schedules,
  customers,
  companies,
}: {
  initial: RecurringRule[];
  schedules: RecurringSchedule[];
  customers: Customer[];
  companies: BillingCompany[];
}) {
  const filterFields: FilterFieldDef[] = [
    { key: "name", label: "Schedule Name", type: "text", placeholder: "Search by schedule name…" },
    {
      key: "customer",
      label: "Customer",
      type: "select",
      options: sortActiveFirst(customers).map((c) => ({ value: c.id, label: labelForOption(c) })),
    },
    {
      key: "company",
      label: "Billing Company",
      type: "select",
      options: sortActiveFirst(companies).map((c) => ({ value: c.id, label: labelForOption(c) })),
    },
    {
      key: "schedule",
      label: "Recurring Schedule",
      type: "select",
      options: schedules.map((s) => ({ value: s.id, label: s.name })),
    },
    { key: "sending", label: "Sending Option", type: "select", options: SENDING_OPTIONS },
    {
      key: "active",
      label: "Active",
      type: "select",
      options: [
        { value: "true", label: "Active" },
        { value: "false", label: "Paused" },
      ],
    },
  ];

  return (
    <FilteredList<RecurringRule>
      title="Recurring Invoices"
      rows={initial}
      columns={columns}
      rowHref={(r) => `/recurring/${r.id}`}
      newHref="/recurring/new"
      newLabel="New recurring invoice"
      emptyMessage="No recurring invoices yet."
      filterFields={filterFields}
      filterFn={(r, v) =>
        textIncludes(r.scheduleName, v.name ?? "") &&
        selectMatches(r.customerId ?? null, v.customer ?? "") &&
        selectMatches(r.billingCompanyId ?? null, v.company ?? "") &&
        selectMatches(r.recurringScheduleId ?? null, v.schedule ?? "") &&
        selectMatches(r.sendingOption, v.sending ?? "") &&
        selectMatches(r.active ? "true" : "false", v.active ?? "")
      }
      defaultSort={{ key: "active", direction: "desc" }}
      tieBreakerKey="name"
    />
  );
}

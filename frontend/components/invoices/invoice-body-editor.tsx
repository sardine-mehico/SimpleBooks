"use client";

import { useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { sortActiveFirst, labelForOption } from "@/lib/sort-selectable";
import { RichTextView } from "@/components/ui/rich-text-view";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { applyDynamicFields } from "@/lib/dynamic-fields";
import { INVOICE_STATUSES, STATUS_TONE, type Customer, type InvoiceStatus, type Item, type TaxType } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

const STATUS_LABEL: Record<InvoiceStatus, string> = Object.fromEntries(
  INVOICE_STATUSES.map((s) => [s.value, s.label]),
) as Record<InvoiceStatus, string>;

// Statuses that the operator can no longer set manually — they're derived from
// payment allocations. The void/delete actions in the dropdown handle the
// other state transitions (DRAFT → VOID, deletion).
const DERIVED_STATUSES = new Set<InvoiceStatus>(["SENT", "VIEWED", "PARTIAL_PAID", "PAID"]);

export type BodyLine = {
  itemId: string;
  description: string;
  amount: string;
  taxTypeId: string;
  taxName: string;
  taxRate: string;
};

export const blankBodyLine = (defaultTax?: TaxType | null): BodyLine => ({
  itemId: "",
  description: "",
  amount: "0",
  taxTypeId: defaultTax?.id ?? "",
  taxName: defaultTax?.name ?? "",
  taxRate: defaultTax ? String(defaultTax.rate) : "",
});

export function deriveTaxLabel(lines: BodyLine[]): string {
  const names = new Set(lines.map((l) => l.taxName).filter(Boolean));
  if (names.size === 0) return "Tax";
  if (names.size === 1) return [...names][0]!;
  return "TAX";
}

export type InvoiceBodyEditorProps = {
  customers: Customer[];
  items: Item[];
  taxTypes: TaxType[];
  customerId: string;
  setCustomerId: (id: string) => void;
  // Header fields — populated only by the invoice form (status badge +
  // Invoice Number / Date / Due Date / PO Number on the right of the
  // billing-company + customer block). When `status` isn't passed (e.g. the
  // recurring-rule form, which has its own header card) the right column
  // is skipped.
  invoiceNumber?: number | null;
  status?: InvoiceStatus;
  invoiceDate: string;
  setInvoiceDate?: (v: string) => void;
  dueDate: string;
  setDueDate?: (v: string) => void;
  poNumber?: string;
  setPoNumber?: (v: string) => void;
  lines: BodyLine[];
  setLines: React.Dispatch<React.SetStateAction<BodyLine[]>>;
  paymentDetails: string;
  setPaymentDetails: (v: string) => void;
  internalNotes: string;
  setInternalNotes: (v: string) => void;
  terms: string;
  setTerms: (v: string) => void;
  // `disabled` is passed when the invoice is open in view mode. The wrapping
  // `<fieldset disabled>` already locks native inputs/buttons/selects, but
  // the rich-text editor's `contenteditable` div ignores that, so we thread
  // the flag through explicitly.
  disabled?: boolean;
};

export function InvoiceBodyEditor({
  customers,
  items,
  taxTypes,
  customerId,
  setCustomerId,
  invoiceNumber,
  status,
  invoiceDate,
  setInvoiceDate,
  dueDate,
  setDueDate,
  poNumber,
  setPoNumber,
  lines,
  setLines,
  paymentDetails,
  setPaymentDetails,
  internalNotes,
  setInternalNotes,
  terms,
  setTerms,
  disabled,
}: InvoiceBodyEditorProps) {
  const activeTaxTypes = useMemo(() => taxTypes.filter((t) => t.isActive), [taxTypes]);
  const defaultTax = activeTaxTypes[0] ?? null;

  const customer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  );
  const billingCompany = customer?.billingCompany ?? null;

  // Auto-populate Payment Details from billing company on customer change.
  // Skip first render so editing an existing record doesn't clobber saved
  // value.
  const isFirstPaymentRun = useRef(true);
  useEffect(() => {
    if (isFirstPaymentRun.current) {
      isFirstPaymentRun.current = false;
      return;
    }
    const next = customers.find((c) => c.id === customerId)?.billingCompany?.paymentDetails ?? "";
    setPaymentDetails(next);
  }, [customerId, customers, setPaymentDetails]);

  function updateLine(idx: number, patch: Partial<BodyLine>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function pickItem(idx: number, itemId: string) {
    const it = items.find((x) => x.id === itemId);
    if (!it) return;
    const sourceText = it.description?.trim() ? it.description : it.name;
    const description = applyDynamicFields(sourceText, { invoiceDate, dueDate });
    updateLine(idx, {
      itemId,
      description,
      amount: String(it.unitPrice),
    });
  }

  function pickTax(idx: number, taxTypeId: string) {
    const t = taxTypes.find((x) => x.id === taxTypeId);
    if (!t) {
      updateLine(idx, { taxTypeId: "", taxName: "", taxRate: "" });
      return;
    }
    updateLine(idx, { taxTypeId: t.id, taxName: t.name, taxRate: String(t.rate) });
  }

  const totals = useMemo(() => {
    let sub = 0;
    let tax = 0;
    for (const l of lines) {
      const amount = Number(l.amount) || 0;
      const rate = Number(l.taxRate) || 0;
      sub += amount;
      tax += amount * (rate / 100);
    }
    sub = Math.round(sub * 100) / 100;
    tax = Math.round(tax * 100) / 100;
    return { subtotal: sub, taxAmount: tax, totalAmount: sub + tax };
  }, [lines]);

  const taxLabel = useMemo(() => deriveTaxLabel(lines), [lines]);

  return (
    <>
      <Card className="p-6">
        <div className={cn("grid grid-cols-1 gap-6", status ? "md:grid-cols-[1fr_360px]" : "")}>
          {/* Left: "From" billing company + Customer + customer address. */}
          <div className="space-y-6">
            <div className="text-sm leading-relaxed text-slate-700">
              {billingCompany ? (
                <>
                  <div className="text-base font-semibold text-slate-900">{billingCompany.name}</div>
                  {billingCompany.abn ? <div>ABN: {billingCompany.abn}</div> : null}
                  {billingCompany.address ? (
                    <RichTextView text={billingCompany.address} className="text-sm text-slate-700" />
                  ) : null}
                  {billingCompany.accountsEmail ? <div>E: {billingCompany.accountsEmail}</div> : null}
                </>
              ) : (
                <div className="text-sm italic text-slate-400">
                  Select a customer to populate billing company details.
                </div>
              )}
            </div>

            <Field label="Customer">
              <Select value={customerId || "__none__"} onValueChange={(v) => setCustomerId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="max-w-[320px]">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {sortActiveFirst(customers).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{labelForOption(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {customer?.address ? (
              <RichTextView text={customer.address} className="-mt-[18px] text-sm text-slate-700" />
            ) : null}
          </div>

          {/* Right: Status badge + invoice metadata. Same label-left layout
              the standalone card used; just nested into this side of the grid
              so the form opens with one less card. Skipped entirely when
              `status` isn't supplied (e.g. the recurring-rule form uses its
              own header card). */}
          {status ? (
          <div className="space-y-3">
            <div className="flex flex-col items-end gap-1 pb-1">
              <Badge
                tone={STATUS_TONE[status]}
                className="rounded-[5px] px-6 py-1.5 text-[33px] leading-none tracking-wide"
              >
                {STATUS_LABEL[status]}
              </Badge>
              {DERIVED_STATUSES.has(status) ? (
                <p className="max-w-[320px] text-right text-xs text-slate-500">
                  Status is derived from payment allocations. Apply or un-apply payments to change it.
                </p>
              ) : null}
            </div>
            <LabeledRow label="Invoice Number">
              <Input
                value={invoiceNumber != null ? String(invoiceNumber) : "Auto-generated"}
                disabled
                className={invoiceNumber != null ? "font-mono tabular-nums" : "font-mono text-slate-400"}
              />
            </LabeledRow>
            <LabeledRow label="Invoice Date *">
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate?.(e.target.value)} required />
            </LabeledRow>
            <LabeledRow label="Due Date">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate?.(e.target.value)} />
            </LabeledRow>
            <LabeledRow label="PO Number">
              <Input value={poNumber ?? ""} onChange={(e) => setPoNumber?.(e.target.value)} />
            </LabeledRow>
          </div>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {!customerId ? (
          <div className="border-b border-amber-100 bg-amber-50/60 px-5 py-2.5 text-xs text-amber-800">
            Select a customer to add line items.
          </div>
        ) : null}
        <div className="grid grid-cols-[1fr_140px_180px_40px] gap-x-3 bg-slate-50 px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
          <div>Items &amp; Description</div>
          <div className="text-right">Amount</div>
          <div>Tax</div>
          <div />
        </div>
        <ul className="divide-y divide-slate-100">
          {lines.map((l, idx) => (
            <li key={idx} className="grid grid-cols-[1fr_140px_180px_40px] items-center gap-x-3 px-5 py-3">
              <BodyItemDescriptionField
                value={l.description}
                items={items}
                onChangeText={(v) => updateLine(idx, { description: v, itemId: "" })}
                onPickItem={(id) => pickItem(idx, id)}
                placeholder="Item / service description"
                disabled={!customerId}
              />
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-slate-400">$</span>
                <Input
                  type="number" step="0.01" min="0"
                  value={l.amount}
                  onChange={(e) => updateLine(idx, { amount: e.target.value })}
                  className="h-9 pl-5 text-right tabular-nums"
                  disabled={!customerId}
                />
              </div>
              <Select value={l.taxTypeId || "__none__"} onValueChange={(v) => pickTax(idx, v === "__none__" ? "" : v)} disabled={!customerId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select tax" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No tax</SelectItem>
                  {activeTaxTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} {Number(t.rate)}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                disabled={!customerId}
                className="grid h-8 w-8 place-items-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                aria-label="Remove line"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 px-5 py-3">
          <Button
            type="button" variant="ghost" size="sm"
            onClick={() => setLines((l) => [...l, blankBodyLine(defaultTax)])}
            disabled={!customerId}
            className="text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Line Item
          </Button>
        </div>
        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <div className="grid w-72 grid-cols-2 gap-y-1 text-sm">
            <div className="text-slate-500">Subtotal</div>
            <div className="text-right tabular-nums text-slate-900">{formatCurrency(totals.subtotal)}</div>
            <div className="text-slate-500">{taxLabel}</div>
            <div className="text-right tabular-nums text-slate-900">{formatCurrency(totals.taxAmount)}</div>
            <div className="border-t border-slate-200 pt-1 text-sm font-semibold text-slate-900">Total (incl. {taxLabel})</div>
            <div className="border-t border-slate-200 pt-1 text-right tabular-nums text-base font-semibold text-slate-900">{formatCurrency(totals.totalAmount)}</div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Payment Details" as="div">
            <RichTextEditor value={paymentDetails} onChange={setPaymentDetails} rows={4} placeholder="BSB / Account / Reference…" disabled={disabled} />
          </Field>
          <Field label="Internal Notes" hint="Not shown to customer">
            <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} className="min-h-[128px]" />
          </Field>
          <Field label="Terms" className="md:col-span-2">
            <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className="min-h-0" />
          </Field>
        </div>
      </Card>
    </>
  );
}

function LabeledRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_160px] items-center gap-3">
      <label className="text-right text-sm text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function BodyItemDescriptionField({
  value, items, onChangeText, onPickItem, placeholder, disabled,
}: {
  value: string;
  items: Item[];
  onChangeText: (next: string) => void;
  onPickItem: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
        placeholder={placeholder}
        className="h-9 pr-9"
        disabled={disabled}
      />
      {items.length > 0 && !disabled ? (
        <DropdownMenuPrimitive.Root>
          <DropdownMenuPrimitive.Trigger
            type="button"
            aria-label="Pick item from catalogue"
            className="absolute inset-y-0 right-1 my-auto grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </DropdownMenuPrimitive.Trigger>
          <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content
              align="end" sideOffset={4}
              className={cn(
                "z-50 min-w-[14rem] overflow-hidden rounded-[0.3rem] border border-slate-200 bg-white p-1 shadow-md",
                "data-[side=bottom]:animate-in data-[side=bottom]:fade-in-0 data-[side=bottom]:slide-in-from-top-1",
              )}
            >
              {items.map((it) => (
                <DropdownMenuPrimitive.Item
                  key={it.id}
                  onSelect={() => onPickItem(it.id)}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-sm text-slate-700 outline-none focus:bg-indigo-50 focus:text-indigo-700"
                >
                  <span className="truncate">{it.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatCurrency(Number(it.unitPrice))}</span>
                </DropdownMenuPrimitive.Item>
              ))}
            </DropdownMenuPrimitive.Content>
          </DropdownMenuPrimitive.Portal>
        </DropdownMenuPrimitive.Root>
      ) : null}
    </div>
  );
}

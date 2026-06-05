"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import { ApiError, apiClient, etagFor } from "@/lib/api";
import { parseApiError } from "@/lib/api-errors";
import { toast } from "@/lib/toast";
import {
  SENDING_OPTIONS,
  type BillingCompany,
  type Customer,
  type Item,
  type RecurringRule,
  type RecurringSchedule,
  type SendingOption,
  type TaxType,
} from "@/lib/types";
import {
  InvoiceBodyEditor,
  blankBodyLine,
  type BodyLine,
} from "@/components/invoices/invoice-body-editor";

function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function toIsoDate(d?: string | null) {
  if (!d) return "";
  return localIsoDate(new Date(d));
}
function todayIso(): string {
  return localIsoDate(new Date());
}

export function RecurringForm({
  initial,
  customers,
  items,
  taxTypes,
  schedules,
}: {
  initial?: RecurringRule;
  customers: Customer[];
  // companies prop accepted but not consumed directly — billing company is
  // derived from the selected customer (same pattern as InvoiceForm).
  companies?: BillingCompany[];
  items: Item[];
  taxTypes: TaxType[];
  schedules: RecurringSchedule[];
}) {
  const router = useRouter();
  const activeTaxTypes = useMemo(() => taxTypes.filter((t) => t.isActive), [taxTypes]);
  const defaultTax = activeTaxTypes[0] ?? null;
  const activeSchedules = useMemo(() => schedules.filter((s) => s.isActive), [schedules]);

  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [startDate, setStartDate] = useState(toIsoDate(initial?.startDate) || todayIso());
  const [recurringScheduleId, setRecurringScheduleId] = useState(initial?.recurringScheduleId ?? "");
  const [sendingOption, setSendingOption] = useState<SendingOption>(initial?.sendingOption ?? "REVIEW_BEFORE_SENDING");
  const [active, setActive] = useState(initial?.active ?? true);
  const [poNumber, setPoNumber] = useState(initial?.poNumber ?? "");
  const [paymentDetails, setPaymentDetails] = useState(initial?.paymentDetails ?? "");
  const [internalNotes, setInternalNotes] = useState(initial?.internalNotes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const [lines, setLines] = useState<BodyLine[]>(
    initial?.lineItems?.length
      ? initial.lineItems.map((l) => {
          const matched =
            (l.taxTypeId ? taxTypes.find((t) => t.id === l.taxTypeId) : null) ??
            (l.taxName
              ? taxTypes.find((t) => t.name === l.taxName && Number(t.rate) === (l.taxRate != null ? Number(l.taxRate) : 0))
              : null) ??
            null;
          return {
            itemId: l.itemId ?? "",
            description: l.description,
            amount: String(l.unitPrice),
            taxTypeId: matched?.id ?? "",
            taxName: matched?.name ?? l.taxName ?? "",
            taxRate: matched ? String(matched.rate) : l.taxRate != null ? String(l.taxRate) : "",
          };
        })
      : [blankBodyLine(defaultTax)],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etag, setEtag] = useState<string | undefined>(
    initial ? etagFor((initial as any).updatedAt) : undefined,
  );

  // Derived Schedule Name — re-runs whenever customer or schedule changes.
  const scheduleName = useMemo(() => {
    const c = customers.find((x) => x.id === customerId)?.name;
    const s = schedules.find((x) => x.id === recurringScheduleId)?.name;
    if (!c || !s) return "";
    return `${c} - ${s}`;
  }, [customers, customerId, schedules, recurringScheduleId]);

  // Save validation: customer + schedule + startDate + ≥1 line with a non-empty description.
  const canSave =
    !!customerId &&
    !!recurringScheduleId &&
    !!startDate &&
    lines.some((l) => l.description.trim().length > 0);

  // For the body editor's auto due-date-display only — we don't store dueDate
  // on the rule, but the body uses {{due date}} substitution at item-pick
  // time. Compute a preview dueDate from the customer's payment terms so the
  // item-picker substitution shows something sensible while editing.
  const dueDatePreview = useMemo(() => {
    if (!startDate) return "";
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return "";
    const offset =
      customer.paymentTerms === "IN_28_DAYS" ? 27 :
      customer.paymentTerms === "IN_15_DAYS" ? 14 :
      customer.paymentTerms === "IN_7_DAYS"  ? 6  :
      0;
    const d = new Date(startDate + "T00:00:00");
    d.setDate(d.getDate() + offset);
    return localIsoDate(d);
  }, [startDate, customers, customerId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSave) return;
    setSaving(true);
    const payload = {
      startDate: new Date(startDate).toISOString(),
      recurringScheduleId,
      sendingOption,
      active,
      customerId,
      poNumber: poNumber || undefined,
      paymentDetails: paymentDetails || undefined,
      internalNotes: internalNotes || undefined,
      terms: terms || undefined,
      lineItems: lines.map((l) => ({
        itemId: l.itemId || undefined,
        description: l.description,
        unitPrice: Number(l.amount) || 0,
        taxTypeId: l.taxTypeId || undefined,
        taxName: l.taxName || undefined,
        taxRate: l.taxRate ? Number(l.taxRate) : undefined,
      })),
    };
    try {
      if (initial) {
        const updated = await apiClient.patch<{ updatedAt: string }>(
          `/recurring/${initial.id}`,
          payload,
          { ifMatch: etag },
        );
        setEtag(etagFor(updated.updatedAt));
      } else {
        await apiClient.post("/recurring", payload);
      }
      router.push("/recurring");
      router.refresh();
    } catch (e: any) {
      if (e instanceof ApiError && e.isPreconditionFailed) {
        toast.error(
          "This recurring rule was modified by someone else. Reload before re-saving.",
        );
        setError("Stale data — reload required.");
      } else {
        setError(parseApiError(e?.message));
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial || !confirm("Delete this recurring invoice?")) return;
    setError(null);
    try {
      await apiClient.delete(`/recurring/${initial.id}`);
      router.push("/recurring");
      router.refresh();
    } catch (e: any) {
      setError(parseApiError(e?.message));
    }
  }

  return (
    <EditPageChrome
      title={initial ? `Recurring · ${scheduleName || "rule"}` : "New recurring invoice"}
      backHref="/recurring"
      formId="recurring-form"
      saving={saving}
      disabled={!canSave}
      rightActions={
        initial ? (
          <Button type="button" variant="danger" size="icon" onClick={remove} aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null
      }
    >
    <form id="recurring-form" onSubmit={submit} className="flex flex-col gap-4">
      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Schedule Name">
            <Input value={scheduleName} disabled placeholder="Auto-derived from customer + schedule" />
          </Field>
          <Field label="Start Date" required>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>

          <Field label="Recurring Schedule" required>
            <Select value={recurringScheduleId || "__none__"} onValueChange={(v) => setRecurringScheduleId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {activeSchedules.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sending Options" required>
            <Select value={sendingOption} onValueChange={(v) => setSendingOption(v as SendingOption)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SENDING_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Active">
            <div className="flex h-9 items-center">
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </Field>
          <Field label="PO Number">
            <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          </Field>
        </div>
      </Card>

      <InvoiceBodyEditor
        customers={customers}
        items={items}
        taxTypes={taxTypes}
        customerId={customerId}
        setCustomerId={setCustomerId}
        invoiceDate={startDate}
        dueDate={dueDatePreview}
        lines={lines}
        setLines={setLines}
        paymentDetails={paymentDetails}
        setPaymentDetails={setPaymentDetails}
        internalNotes={internalNotes}
        setInternalNotes={setInternalNotes}
        terms={terms}
        setTerms={setTerms}
      />

      {error ? <p className="text-xs text-rose-600" role="alert">{error}</p> : null}
    </form>
    </EditPageChrome>
  );
}

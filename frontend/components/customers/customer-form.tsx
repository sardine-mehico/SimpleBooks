"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import { apiClient } from "@/lib/api";
import { PAYMENT_TERMS, type Customer, type BillingCompany, type PaymentTerms } from "@/lib/types";

export function CustomerForm({ initial, companies }: { initial?: Customer; companies: BillingCompany[] }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [primaryEmail, setPrimaryEmail] = useState(initial?.billingEmail1 ?? "");
  const [secondaryEmail, setSecondaryEmail] = useState(initial?.billingEmail2 ?? "");
  const [billingCompanyId, setBillingCompanyId] = useState(initial?.billingCompanyId ?? "");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(initial?.paymentTerms ?? "IN_28_DAYS");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!billingCompanyId) {
      setError("Billing Company is required.");
      return;
    }
    setSaving(true);
    const payload = {
      name,
      billingEmail1: primaryEmail,
      billingEmail2: secondaryEmail || undefined,
      billingCompanyId,
      paymentTerms,
      address,
      notes: notes || undefined,
      isActive,
    };
    try {
      if (initial) await apiClient.patch(`/customers/${initial.id}`, payload);
      else await apiClient.post("/customers", payload);
      router.push("/customers");
      router.refresh();
    } catch (e: any) {
      setError(parseError(e?.message));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial || !confirm("Delete this customer?")) return;
    setError(null);
    try {
      await apiClient.delete(`/customers/${initial.id}`);
      router.push("/customers");
      router.refresh();
    } catch (e: any) {
      // Most likely cause: backend Conflict because the customer is still
      // referenced by an invoice or recurring rule.
      setError(parseError(e?.message));
    }
  }

  return (
    <EditPageChrome
      title={initial ? `Customer · ${initial.name}` : "New customer"}
      backHref="/customers"
      formId="customer-form"
      saving={saving}
      rightActions={
        initial ? (
          <Button type="button" variant="danger" size="icon" onClick={remove} aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null
      }
    >
    <form id="customer-form" onSubmit={submit}>
      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Row 1 */}
          {initial ? (
            <Field label="Customer Number">
              <Input value={initial.customerNumber} disabled className="font-mono tabular-nums" />
            </Field>
          ) : null}
          <Field label="Customer Name" required className={initial ? "" : "md:col-span-2"}>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>

          {/* Row 2 */}
          <Field label="Primary billing email" required>
            <Input type="email" value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} required />
          </Field>
          <Field label="Secondary billing email">
            <Input type="email" value={secondaryEmail} onChange={(e) => setSecondaryEmail(e.target.value)} />
          </Field>

          {/* Row 3 */}
          <Field label="Billing Company" required>
            <Select value={billingCompanyId || ""} onValueChange={(v) => setBillingCompanyId(v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Payment Due In" required>
            <Select value={paymentTerms} onValueChange={(v) => setPaymentTerms(v as PaymentTerms)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </Field>

          {/* Row 4 */}
          <Field label="Address" required>
            <Textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              className="min-h-0"
              placeholder={"Street\nSuburb\nCity, State Postcode"}
              required
            />
          </Field>
          <Field label="Active">
            <div className="flex h-9 items-center">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </Field>

          {/* Row 5 */}
          <Field label="Notes" className="md:col-span-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} className="min-h-[148px]" />
          </Field>
        </div>
        {error ? <p className="mt-3 text-xs text-rose-600">{error}</p> : null}
      </Card>
    </form>
    </EditPageChrome>
  );
}

function parseError(msg?: string) {
  if (!msg) return "Save failed";
  if (/Primary billing email/i.test(msg)) return "Primary billing email is required and must be a valid email.";
  if (/Billing Company/i.test(msg)) return "Billing Company is required.";
  if (/Payment Due/i.test(msg) || /paymentTerms/i.test(msg)) return "Payment Due In is required.";
  if (/Address/i.test(msg)) return "Address is required.";
  return msg;
}

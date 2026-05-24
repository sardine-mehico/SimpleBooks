"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { AliasChipInput } from "./alias-chip-input";
import { createVendor, deleteVendor, updateVendor } from "@/lib/banking-rules";
import { VENDOR_KINDS, type Customer, type Vendor, type VendorKind } from "@/lib/types";

export function VendorForm({ initial, customers = [] }: { initial?: Vendor; customers?: Customer[] }) {
  const router = useRouter();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<VendorKind>(initial?.kind ?? "MERCHANT");
  const [aliases, setAliases] = useState<string[]>(initial?.aliases ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [customerId, setCustomerId] = useState<string>(initial?.customerId ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const resolvedCustomerId = customerId === "__none__" ? "" : customerId;
      const payload = {
        name: name.trim(),
        kind,
        aliases,
        notes: notes.trim() || undefined,
        isActive,
        customerId: resolvedCustomerId,
      };
      if (isEdit) await updateVendor(initial!.id, payload);
      else await createVendor(payload);
      router.push("/vendors");
    } finally { setSaving(false); }
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(`Delete vendor "${initial.name}"? Transactions linked to it will be unlinked (not deleted).`)) return;
    await deleteVendor(initial.id);
    router.push("/vendors");
  }

  return (
    <EditPageChrome
      title={isEdit ? "Edit Vendor" : "New Vendor"}
      backHref="/vendors"
      formId="vendor-form"
      saving={saving}
      rightActions={initial ? <Button type="button" variant="outline" onClick={onDelete}><Trash2 className="h-3.5 w-3.5"/> Delete</Button> : undefined}
    >
      <Card className="p-6">
        <form id="vendor-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </Field>
          <Field label="Kind">
            <Select value={kind} onValueChange={(v) => setKind(v as VendorKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VENDOR_KINDS.map((k) => (<SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Customer">
              <Select value={customerId || "__none__"} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {customers.filter((c) => c.isActive).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-slate-500">
                Linking a vendor to a customer enables automatic candidate matching in the Payments queue.
              </p>
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label='Aliases (lowercase substrings; match is case-insensitive. Trailing space prevents false-positives — e.g. "rac " not "rac".)'>
              <AliasChipInput value={aliases} onChange={setAliases} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
            </Field>
          </div>
          <Field label="Active">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
              <span>{isActive ? "Active" : "Inactive"}</span>
            </label>
          </Field>
        </form>
      </Card>
    </EditPageChrome>
  );
}

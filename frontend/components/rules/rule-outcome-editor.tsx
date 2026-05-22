"use client";

import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Category, type Vendor } from "@/lib/types";

export function RuleOutcomeEditor({
  categoryId, onCategoryId,
  vendorId, onVendorId,
  noteOnApply, onNoteOnApply,
  categories, vendors,
}: {
  categoryId: string; onCategoryId: (v: string) => void;
  vendorId: string | null; onVendorId: (v: string | null) => void;
  noteOnApply: string; onNoteOnApply: (v: string) => void;
  categories: Category[]; vendors: Vendor[];
}) {
  return (
    <div className="space-y-3">
      <Field label="Category (required)">
        <Select value={categoryId} onValueChange={onCategoryId}>
          <SelectTrigger><SelectValue placeholder="pick a category" /></SelectTrigger>
          <SelectContent>
            {categories.filter((c) => c.isActive).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Vendor (optional)">
        <Select value={vendorId ?? "__none__"} onValueChange={(v) => onVendorId(v === "__none__" ? null : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— none —</SelectItem>
            {vendors.filter((v) => v.isActive).map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Note appended to transaction.notes when this rule fires (optional)">
        <Textarea value={noteOnApply} onChange={(e) => onNoteOnApply(e.target.value)} rows={2} maxLength={2000} />
      </Field>
    </div>
  );
}

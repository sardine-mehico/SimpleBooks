"use client";

import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Category } from "@/lib/types";

export function RuleOutcomeEditor({
  categoryId, onCategoryId,
  noteOnApply, onNoteOnApply,
  categories,
}: {
  categoryId: string; onCategoryId: (v: string) => void;
  noteOnApply: string; onNoteOnApply: (v: string) => void;
  categories: Category[];
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
      <Field label="Note appended to transaction.notes when this rule fires (optional)">
        <Textarea value={noteOnApply} onChange={(e) => onNoteOnApply(e.target.value)} rows={2} maxLength={2000} />
      </Field>
    </div>
  );
}

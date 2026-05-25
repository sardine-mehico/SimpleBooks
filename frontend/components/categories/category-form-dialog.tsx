"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_KINDS, type Category, type CategoryKind } from "@/lib/types";
import { createCategory, updateCategory } from "@/lib/banking-rules";

type ParentOption = Pick<Category, "id" | "name" | "kind">;

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (cat: Category) => void;
  initial?: Category;
  defaultParentId?: string | null;
  parents: ParentOption[];
};

export function CategoryFormDialog({
  open,
  onClose,
  onSaved,
  initial,
  defaultParentId,
  parents,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<CategoryKind>(initial?.kind ?? "EXPENSE");
  const [parentId, setParentId] = useState<string | null>(
    initial?.parentId ?? defaultParentId ?? null,
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubcategory = parentId !== null;
  const parentKind = isSubcategory
    ? parents.find((p) => p.id === parentId)?.kind ?? null
    : null;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const effectiveKind = parentKind ?? kind;
      const payload = { name: name.trim(), kind: effectiveKind, isActive, parentId };
      const saved = initial
        ? await updateCategory(initial.id, payload)
        : await createCategory(payload);
      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit category" : "Add category"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Type">
            <Select
              value={parentId ?? "__top__"}
              onValueChange={(v) => setParentId(v === "__top__" ? null : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__top__">Top-level group</SelectItem>
                {parents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    Subcategory under {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
            />
          </Field>

          {!isSubcategory && (
            <Field label="Kind">
              <Select value={kind} onValueChange={(v) => setKind(v as CategoryKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {isSubcategory && parentKind && (
            <div className="text-xs text-slate-500">
              Kind inherited from parent: <strong>{parentKind}</strong>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            Active
          </label>

          {error && (
            <div className="rounded-[0.3rem] border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={submitting || !name.trim()}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

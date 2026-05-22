"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { CATEGORY_KINDS, type Category, type CategoryKind } from "@/lib/types";
import { createCategory, deleteCategory, updateCategory } from "@/lib/banking-rules";

export function CategoryForm({ initial }: { initial?: Category }) {
  const router = useRouter();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<CategoryKind>(initial?.kind ?? "EXPENSE");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 100));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: name.trim(), kind, sortOrder: Number(sortOrder), isActive };
      if (isEdit) await updateCategory(initial!.id, payload);
      else await createCategory(payload);
      router.push("/categories");
    } finally { setSaving(false); }
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(`Delete category "${initial.name}"?`)) return;
    try {
      await deleteCategory(initial.id);
      router.push("/categories");
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const rightActions = initial ? (
    <Button type="button" variant="outline" onClick={onDelete}>
      <Trash2 className="h-3.5 w-3.5" /> Delete
    </Button>
  ) : null;

  return (
    <EditPageChrome
      title={isEdit ? "Edit Category" : "New Category"}
      backHref="/categories"
      formId="category-form"
      saving={saving}
      rightActions={rightActions ?? undefined}
    >
      <Card className="p-6">
        <form id="category-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </Field>
          <Field label="Kind">
            <Select value={kind} onValueChange={(v) => setKind(v as CategoryKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_KINDS.map((k) => (<SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sort order (lower = higher in dropdown)">
            <Input type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import { ApiError, apiClient, etagFor } from "@/lib/api";
import { parseApiError } from "@/lib/api-errors";
import { toast } from "@/lib/toast";
import type { Item } from "@/lib/types";

export function ItemForm({ initial }: { initial?: Item }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [unitPrice, setUnitPrice] = useState(initial ? String(initial.unitPrice) : "0");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etag, setEtag] = useState<string | undefined>(
    initial ? etagFor((initial as any).updatedAt) : undefined,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = { name, unitPrice: Number(unitPrice), description: description || undefined, isActive };
    try {
      if (initial) {
        const updated = await apiClient.patch<{ updatedAt: string }>(
          `/items/${initial.id}`,
          payload,
          { ifMatch: etag },
        );
        setEtag(etagFor(updated.updatedAt));
      } else {
        await apiClient.post("/items", payload);
      }
      router.push("/items");
      router.refresh();
    } catch (e: any) {
      if (e instanceof ApiError && e.isPreconditionFailed) {
        toast.error("This item was modified by someone else. Reload before re-saving.");
        setError("Stale data — reload required.");
      } else {
        setError(parseApiError(e?.message));
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm("Delete this item?")) return;
    await apiClient.delete(`/items/${initial.id}`);
    router.push("/items");
    router.refresh();
  }

  return (
    <EditPageChrome
      title={initial ? `Item · ${initial.name}` : "New item"}
      backHref="/items"
      formId="item-form"
      saving={saving}
      rightActions={
        initial ? (
          <Button type="button" variant="danger" size="icon" onClick={remove} aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null
      }
    >
    <form id="item-form" onSubmit={submit}>
      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name" required className="md:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Unit Price" required>
            <Input type="number" step="0.01" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
          </Field>
          <Field label="Active">
            <div className="flex h-9 items-center">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </Field>
          <Field label="Description" className="md:col-span-2">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        {error ? <p className="mt-3 text-xs text-rose-600" role="alert">{error}</p> : null}
      </Card>
    </form>
    </EditPageChrome>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Check, X, Pencil } from "lucide-react";
import {
  createAccountType,
  deleteAccountType,
  updateAccountType,
} from "@/lib/banking";
import type { AccountType } from "@/lib/types";

export function AccountTypesManager({ initial }: { initial: AccountType[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  async function onAdd() {
    if (!newName.trim()) return;
    await createAccountType({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
    });
    setNewName("");
    setNewDescription("");
    router.refresh();
  }

  function beginEdit(t: AccountType) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditDescription(t.description ?? "");
  }

  async function saveEdit(t: AccountType) {
    await updateAccountType(t.id, {
      name: editName.trim(),
      description: editDescription.trim() || undefined,
    });
    setEditingId(null);
    router.refresh();
  }

  async function onToggle(t: AccountType) {
    await updateAccountType(t.id, { isActive: !t.isActive });
    router.refresh();
  }

  async function onDelete(t: AccountType) {
    try {
      await deleteAccountType(t.id);
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4">
        <div className="flex flex-col gap-2 md:flex-row">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New account type, e.g. Brokerage"
            maxLength={60}
            className="md:max-w-[260px]"
          />
          <Input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Short description shown on /accounts (optional)"
            maxLength={300}
            className="flex-1"
          />
          <Button type="button" onClick={onAdd}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </Card>

      <Card>
        <ul className="divide-y divide-slate-100">
          {initial.map((t) => {
            const isEditing = editingId === t.id;
            return (
              <li key={t.id} className="flex flex-col gap-3 px-5 py-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} />
                      <Input
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Short description (optional)"
                        maxLength={300}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-slate-900">{t.name}</span>
                        <Badge tone={t.isActive ? "completed" : "cancelled"}>{t.isActive ? "Active" : "Inactive"}</Badge>
                      </div>
                      {t.description ? (
                        <p className="mt-1 text-xs text-slate-500">{t.description}</p>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {isEditing ? (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => saveEdit(t)} aria-label="Save">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)} aria-label="Cancel">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => beginEdit(t)} aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => onToggle(t)}>
                        {t.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => onDelete(t)} aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

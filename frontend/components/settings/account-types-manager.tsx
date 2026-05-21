"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import {
  createAccountType,
  deleteAccountType,
  updateAccountType,
} from "@/lib/banking";
import type { AccountType } from "@/lib/types";

export function AccountTypesManager({ initial }: { initial: AccountType[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");

  async function onAdd() {
    if (!newName.trim()) return;
    await createAccountType({ name: newName.trim() });
    setNewName("");
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
      <Card className="p-4">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New account type, e.g. Brokerage"
            maxLength={60}
          />
          <Button type="button" onClick={onAdd}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </Card>

      <Card>
        <ul className="divide-y divide-slate-100">
          {initial.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-900">{t.name}</span>
                <Badge tone={t.isActive ? "completed" : "cancelled"}>{t.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onToggle(t)}>
                  {t.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onDelete(t)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

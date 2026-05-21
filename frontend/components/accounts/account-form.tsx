"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { archiveAccount, createAccount, restoreAccount, updateAccount } from "@/lib/banking";
import type { Account, AccountType } from "@/lib/types";

// Build YYYY-MM-DD from local calendar parts (per CLAUDE.md gotcha — never use toISOString().slice(0,10)).
function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AccountForm({
  initial,
  accountTypes,
}: {
  initial?: Account;
  accountTypes: AccountType[];
}) {
  const router = useRouter();
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [bank, setBank] = useState(initial?.bank ?? "");
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? "");
  const [accountTypeId, setAccountTypeId] = useState(initial?.accountTypeId ?? accountTypes[0]?.id ?? "");
  const [openingBalance, setOpeningBalance] = useState(initial?.openingBalance ?? "0.00");
  const [openingDate, setOpeningDate] = useState(initial?.openingDate?.slice(0, 10) ?? localIsoDate(new Date()));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        bank: bank.trim(),
        accountNumber: accountNumber.trim() || undefined,
        accountTypeId,
        openingBalance: Number(openingBalance),
        openingDate,
        notes: notes.trim() || undefined,
      };
      if (isEdit) await updateAccount(initial!.id, payload);
      else await createAccount(payload);
      router.push(isEdit ? `/accounts/${initial!.id}` : "/accounts");
    } finally {
      setSaving(false);
    }
  }

  async function onArchive() {
    if (!initial) return;
    if (initial.isActive) await archiveAccount(initial.id);
    else await restoreAccount(initial.id);
    router.refresh();
  }

  const archiveBtn = initial ? (
    <Button type="button" variant="outline" onClick={onArchive}>
      {initial.isActive ? "Archive" : "Restore"}
    </Button>
  ) : null;

  return (
    <EditPageChrome
      title={isEdit ? "Edit Account" : "New Account"}
      backHref={isEdit ? `/accounts/${initial!.id}` : "/accounts"}
      formId="account-form"
      saving={saving}
      rightActions={archiveBtn ?? undefined}
    >
      <Card className="p-6">
        <form id="account-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </Field>
          <Field label="Bank" required>
            <Input value={bank} onChange={(e) => setBank(e.target.value)} required maxLength={120} />
          </Field>
          <Field label="Account number (optional)">
            <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Account type" required>
            <Select value={accountTypeId} onValueChange={setAccountTypeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {accountTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Opening balance (AUD)" required>
            <Input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              required
            />
          </Field>
          <Field label="Opening date" required>
            <Input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} required />
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
          </Field>
        </form>
      </Card>
    </EditPageChrome>
  );
}

"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "./section-header";
import { apiClient } from "@/lib/api";
import { EMAIL_ENCRYPTIONS, type EmailEncryption, type MailConfiguration } from "@/lib/types";
import { TestEmailDialog } from "@/components/mail/test-email-dialog";

export function MailConfigForm({ initial }: { initial: MailConfiguration }) {
  const [smtpServer, setSmtpServer] = useState(initial.smtpServer ?? "");
  const [port, setPort] = useState(String(initial.port ?? 587));
  const [encryption, setEncryption] = useState<EmailEncryption>(initial.encryption ?? "STARTTLS");
  const [user, setUser] = useState(initial.user ?? "");
  const [password, setPassword] = useState(initial.password ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiClient.put<MailConfiguration>("/mail-configuration", {
        smtpServer,
        port: Number(port),
        encryption,
        user,
        password,
      });
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SectionHeader
        title="Mail Configuration"
        description="SMTP credentials used for outgoing email. Stored in the database."
      />
      <Card className="p-5">
        <form onSubmit={save} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="SMTP Server">
            <Input
              value={smtpServer}
              onChange={(e) => setSmtpServer(e.target.value)}
              placeholder="smtp.example.com"
            />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </Field>
          <Field label="Encryption">
            <Select value={encryption} onValueChange={(v) => setEncryption(v as EmailEncryption)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMAIL_ENCRYPTIONS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="User">
            <Input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="username or full email"
              autoComplete="off"
            />
          </Field>
          <Field label="Password" className="md:col-span-2">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <div className="md:col-span-2 flex items-center justify-between border-t border-slate-100 pt-4">
            <div className="text-xs">
              {error ? <span className="text-rose-600">{error}</span> : null}
              {!error && savedAt ? <span className="text-emerald-600">Saved at {savedAt}</span> : null}
              {!error && !savedAt ? <span className="text-slate-400">Click Save to update.</span> : null}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTestOpen(true)}
                disabled={!smtpServer}
              >
                Send Test Email
              </Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </form>
      </Card>
      <TestEmailDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        config={{ smtpServer, port: Number(port) || 0, encryption, user, password }}
        defaultTo={user.includes("@") ? user : ""}
      />
    </div>
  );
}

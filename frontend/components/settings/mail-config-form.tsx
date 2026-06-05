"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
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
import { toast } from "@/lib/toast";
import { EMAIL_ENCRYPTIONS, type EmailEncryption, type MailConfiguration } from "@/lib/types";
import { TestEmailDialog } from "@/components/mail/test-email-dialog";

export function MailConfigForm({ initial }: { initial: MailConfiguration }) {
  const router = useRouter();
  const [smtpServer, setSmtpServer] = useState(initial.smtpServer ?? "");
  const [port, setPort] = useState(String(initial.port ?? 587));
  const [encryption, setEncryption] = useState<EmailEncryption>(initial.encryption ?? "STARTTLS");
  const [user, setUser] = useState(initial.user ?? "");
  const [password, setPassword] = useState(initial.password ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
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
      toast.success("Mail configuration saved");
      router.refresh();
    } catch (e: any) {
      const msg = e?.message ?? "Save failed";
      setError(msg);
      toast.error(msg);
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
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                className="pr-9"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-2 my-auto grid h-7 w-7 place-items-center rounded text-slate-500 hover:text-slate-900"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <div className="md:col-span-2 flex items-center justify-between border-t border-slate-100 pt-4">
            <div className="text-xs">
              {error ? <span className="text-rose-600">{error}</span> : <span className="text-slate-400">Click Save to update.</span>}
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

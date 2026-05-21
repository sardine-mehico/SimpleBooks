"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/api-errors";
import type { EmailEncryption } from "@/lib/types";

export type TestEmailConfig = {
  smtpServer: string;
  port: number;
  encryption: EmailEncryption;
  user?: string;
  password?: string;
};

type Phase = "form" | "sending" | "success" | "error";

// Reusable Send Test Email modal. The caller supplies the current SMTP config
// (which need not be saved yet) and a default recipient. The dialog handles
// the request lifecycle and surfaces a clear in-place result.
export function TestEmailDialog({
  open,
  onOpenChange,
  config,
  defaultTo = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: TestEmailConfig;
  defaultTo?: string;
}) {
  const [to, setTo] = useState(defaultTo);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the dialog opens so a previous send doesn't leak in.
  function handleOpenChange(next: boolean) {
    if (next) {
      setTo(defaultTo);
      setPhase("form");
      setError(null);
    }
    onOpenChange(next);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setPhase("sending");
    setError(null);
    try {
      await apiClient.post("/mail/test", { ...config, to });
      setPhase("success");
    } catch (e: any) {
      setError(parseApiError(e?.message));
      setPhase("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
          <DialogDescription>
            Sends a one-off test message using the SMTP credentials currently in this form.
          </DialogDescription>
        </DialogHeader>

        {phase === "form" || phase === "error" ? (
          <form onSubmit={send} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Send to</label>
              <Input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                required
                autoFocus
              />
            </div>
            {phase === "error" && error ? (
              <p className="text-xs text-rose-600" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">{phase === "error" ? "Try again" : "Send"}</Button>
            </DialogFooter>
          </form>
        ) : null}

        {phase === "sending" ? (
          <div className="flex items-center gap-3 py-4 text-sm text-slate-600" aria-live="polite">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"
              aria-hidden
            />
            Sending… please wait.
          </div>
        ) : null}

        {phase === "success" ? (
          <div className="py-2">
            <p className="text-sm text-emerald-700" role="status">
              Email Sent Successfully.
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

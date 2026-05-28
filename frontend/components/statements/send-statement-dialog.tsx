"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Mail } from "lucide-react";
import { getStatementSendContext, sendStatement } from "@/lib/statements";
import type { StatementSendContext } from "@/lib/types";
import { parseApiError } from "@/lib/api-errors";

type Phase = "loading" | "compose" | "sending" | "sent" | "error";

export function SendStatementDialog({
  open,
  onOpenChange,
  params,
  customerName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  params: {
    customerId: string;
    billingCompanyId: string;
    dateFrom: string | null;
    dateTo: string | null;
  };
  customerName: string;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");

  useEffect(() => {
    if (!open) return;
    setPhase("loading");
    setError(null);
    getStatementSendContext(params)
      .then((ctx: StatementSendContext) => {
        setFrom(ctx.from);
        setTo(ctx.to);
        setCc(ctx.cc);
        setBcc(ctx.bcc);
        setSubject(ctx.subject);
        setHtml(ctx.html);
        setPhase("compose");
      })
      .catch((e: any) => {
        setError(parseApiError(e?.message));
        setPhase("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, params.customerId, params.billingCompanyId, params.dateFrom, params.dateTo]);

  async function submit() {
    setPhase("sending");
    setError(null);
    try {
      await sendStatement({
        ...params,
        fromEmail: from,
        toEmail: to,
        ccEmail: cc || undefined,
        bccEmail: bcc || undefined,
        subject,
        html,
      });
      setPhase("sent");
    } catch (e: any) {
      setError(parseApiError(e?.message));
      setPhase("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Statement</DialogTitle>
          <DialogDescription>
            Statement for {customerName} · PDF will be attached. Edit recipients or subject, then send.
          </DialogDescription>
        </DialogHeader>

        {phase === "loading" ? (
          <div className="flex items-center gap-3 py-6 text-sm text-slate-600" aria-live="polite">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" aria-hidden />
            Loading…
          </div>
        ) : null}

        {phase === "compose" ? (
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex flex-col gap-3">
              <Field label="From" required>
                <Input value={from} onChange={(e) => setFrom(e.target.value)} required />
              </Field>
              <Field label="To" required>
                <Input value={to} onChange={(e) => setTo(e.target.value)} required />
              </Field>
              <Field label="CC">
                <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="BCC">
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Subject" required>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
              </Field>
              <Field label="Body" hint="Read-only preview">
                <div
                  className="max-h-72 overflow-y-auto rounded-[0.3rem] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 [&_a]:text-indigo-600 [&_a]:underline [&_p]:my-2 [&_strong]:font-semibold"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </Field>
            </div>
          </div>
        ) : null}

        {phase === "sending" ? (
          <div className="flex items-center gap-3 py-6 text-sm text-slate-600" aria-live="polite">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" aria-hidden />
            Sending…
          </div>
        ) : null}

        {phase === "sent" ? (
          <div className="py-2">
            <p className="text-sm text-emerald-700" role="status">Statement sent successfully.</p>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="space-y-2 py-2">
            <p className="text-sm text-rose-600" role="alert">{error}</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              {to && subject ? (
                <Button type="button" onClick={submit}>Try again</Button>
              ) : null}
            </DialogFooter>
          </div>
        ) : null}

        {phase === "compose" ? (
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={!from || !to || !subject}>
              <Mail className="h-3.5 w-3.5" />
              Send Statement
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

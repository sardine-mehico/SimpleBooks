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
import { api, apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/api-errors";
import type { InvoiceSendContext } from "@/lib/types";

type Phase = "loading" | "compose" | "sending" | "sent" | "queued" | "error";
type SendResponse =
  | { status: "SENT"; messageId?: string }
  | { status: "QUEUED_FOR_RETRY"; error: string; triesRemaining: number };

// Send Invoice dialog. Opens with From / To / CC / BCC / Subject pre-filled
// from the assigned EmailTemplate (token-substituted on the server via
// GET /invoices/:id/send-context). The user can edit those fields plus toggle
// the Attach PDF checkbox; the Body is rendered read-only from the snapshotted
// HTML template — the customer-facing copy lives in the seeded template, not
// per-send. Clicking Email Invoice dispatches via POST /invoices/:id/send
// straight away — there is no separate preview step.
export function SendInvoiceDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: number;
  customerName?: string | null;
  onSent?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<{ error: string; triesRemaining: number } | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [attachPdf, setAttachPdf] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhase("loading");
    setError(null);
    setQueued(null);
    setAttachPdf(false);
    api<InvoiceSendContext>(`/invoices/${invoiceId}/send-context`)
      .then((ctx) => {
        setFrom(ctx.from);
        setTo(ctx.to);
        setCc(ctx.cc);
        setBcc(ctx.bcc);
        setSubject(ctx.subject);
        setHtml(ctx.html);
        setPhase("compose");
      })
      .catch((e) => {
        setError(parseApiError(e?.message));
        setPhase("error");
      });
  }, [open, invoiceId]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  async function send() {
    setPhase("sending");
    setError(null);
    try {
      const res = await apiClient.post<SendResponse>(`/invoices/${invoiceId}/send`, {
        from,
        to,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject,
        html,
        attachPdf,
      });
      if (res.status === "SENT") {
        setPhase("sent");
        onSent?.();
      } else {
        setQueued({ error: res.error, triesRemaining: res.triesRemaining });
        setPhase("queued");
      }
    } catch (e: any) {
      setError(parseApiError(e?.message));
      setPhase("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Invoice</DialogTitle>
          <DialogDescription>
            INV-{invoiceNumber} · pre-filled from the assigned email template. Edit the recipients or subject, then send.
          </DialogDescription>
        </DialogHeader>

        {phase === "loading" ? (
          <div className="flex items-center gap-3 py-6 text-sm text-slate-600" aria-live="polite">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" aria-hidden />
            Loading template…
          </div>
        ) : null}

        {phase === "compose" ? (
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <ComposeForm
              from={from} setFrom={setFrom}
              to={to} setTo={setTo}
              cc={cc} setCc={setCc}
              bcc={bcc} setBcc={setBcc}
              subject={subject} setSubject={setSubject}
              html={html}
              attachPdf={attachPdf} setAttachPdf={setAttachPdf}
            />
          </div>
        ) : null}

        {phase === "sending" ? (
          <div className="flex items-center gap-3 py-6 text-sm text-slate-600" aria-live="polite">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" aria-hidden />
            Sending… please wait.
          </div>
        ) : null}

        {phase === "sent" ? (
          <div className="py-2">
            <p className="text-sm text-emerald-700" role="status">Invoice sent successfully.</p>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : null}

        {phase === "queued" && queued ? (
          <div className="space-y-2 py-2">
            <p className="text-sm font-medium text-amber-700" role="status">
              First send attempt failed. {queued.triesRemaining} more {queued.triesRemaining === 1 ? "try" : "tries"} queued.
            </p>
            <p className="text-xs text-slate-600">
              We&apos;ll retry every 10 minutes (4 attempts total). If all of them fail, the invoice will be marked
              <span className="px-1 font-semibold">Failed to Send</span> and a notification will be sent via Telegram
              and email to the billing company&apos;s accounts email.
            </p>
            <p className="text-xs text-slate-500"><span className="font-medium">Last error:</span> {queued.error}</p>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="space-y-2 py-2">
            <p className="text-sm text-rose-600" role="alert">{error}</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>Cancel</Button>
              {to && subject ? (
                <Button type="button" onClick={send}>Try again</Button>
              ) : null}
            </DialogFooter>
          </div>
        ) : null}

        {phase === "compose" ? (
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={send}
              disabled={!from || !to || !subject}
            >
              <Mail className="h-3.5 w-3.5" />
              Email Invoice
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ComposeForm({
  from, setFrom, to, setTo, cc, setCc, bcc, setBcc, subject, setSubject, html,
  attachPdf, setAttachPdf,
}: {
  from: string; setFrom: (v: string) => void;
  to: string; setTo: (v: string) => void;
  cc: string; setCc: (v: string) => void;
  bcc: string; setBcc: (v: string) => void;
  subject: string; setSubject: (v: string) => void;
  html: string;
  attachPdf: boolean; setAttachPdf: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="From" required>
        <Input value={from} onChange={(e) => setFrom(e.target.value)} required />
      </Field>
      <Field label="To" required>
        <Input value={to} onChange={(e) => setTo(e.target.value)} required />
      </Field>
      <Field label="CC">
        <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional: CC recipient" />
      </Field>
      <Field label="BCC">
        <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Optional: BCC recipient" />
      </Field>
      <Field label="Subject" required>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
        />
      </Field>
      <Field label="Body" hint="Read-only — managed by the assigned email template">
        <div
          className="max-h-72 overflow-y-auto rounded-[0.3rem] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 [&_a]:text-indigo-600 [&_a]:underline [&_p]:my-2 [&_strong]:font-semibold"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </Field>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={attachPdf}
          onChange={(e) => setAttachPdf(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        Attach PDF invoice
        <span className="text-xs text-slate-500">
          (otherwise the customer downloads it from the link)
        </span>
      </label>
    </div>
  );
}

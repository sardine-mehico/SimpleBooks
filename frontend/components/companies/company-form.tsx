"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Trash2 } from "lucide-react";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import { ApiError, apiClient, etagFor } from "@/lib/api";
import { toast } from "@/lib/toast";
import { EMAIL_ENCRYPTIONS, type BillingCompany, type EmailEncryption, type SendVia } from "@/lib/types";
import { TestEmailDialog } from "@/components/mail/test-email-dialog";

function formatStamp(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const min = pad(d.getMinutes());
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${dd}/${mm}/${yyyy} ${pad(h)}:${min} ${ampm}`;
}

export function CompanyForm({ initial }: { initial?: BillingCompany }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [abn, setAbn] = useState(initial?.abn ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [paymentDetails, setPaymentDetails] = useState(initial?.paymentDetails ?? "");
  const [accountsEmail, setAccountsEmail] = useState(initial?.accountsEmail ?? "");
  const [invoiceBcc, setInvoiceBcc] = useState(initial?.invoiceBcc ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [sendVia, setSendVia] = useState<SendVia>(initial?.sendVia ?? "GENERAL_SMTP");
  const [smtpServer, setSmtpServer] = useState(initial?.customSmtpServer ?? "");
  const [smtpPort, setSmtpPort] = useState(initial?.customSmtpPort != null ? String(initial.customSmtpPort) : "587");
  const [smtpEncryption, setSmtpEncryption] = useState<EmailEncryption>(initial?.customSmtpEncryption ?? "STARTTLS");
  const [smtpUser, setSmtpUser] = useState(initial?.customSmtpUser ?? "");
  const [smtpPassword, setSmtpPassword] = useState(initial?.customSmtpPassword ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etag, setEtag] = useState<string | undefined>(
    initial ? etagFor((initial as any).updatedAt) : undefined,
  );
  const [testOpen, setTestOpen] = useState(false);

  const isCustom = sendVia === "CUSTOM_SMTP";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // RichTextEditor stores sanitized HTML — strip tags + whitespace to check non-empty.
    const paymentDetailsPlain = paymentDetails.replace(/<[^>]+>/g, "").trim();
    if (!paymentDetailsPlain) {
      setError("Payment Details is required.");
      return;
    }
    setSaving(true);
    const payload = {
      name,
      abn,
      address,
      paymentDetails,
      accountsEmail,
      invoiceBcc,
      notes: notes || undefined,
      isActive,
      sendVia,
      // Only forward custom-SMTP fields when CUSTOM_SMTP is selected, so
      // switching back to GENERAL_SMTP doesn't accidentally persist stale
      // values from the form.
      customSmtpServer: isCustom ? smtpServer || undefined : undefined,
      customSmtpPort: isCustom && smtpPort ? Number(smtpPort) : undefined,
      customSmtpEncryption: isCustom ? smtpEncryption : undefined,
      customSmtpUser: isCustom ? smtpUser || undefined : undefined,
      customSmtpPassword: isCustom ? smtpPassword || undefined : undefined,
    };
    try {
      if (initial) {
        const updated = await apiClient.patch<{ updatedAt: string }>(
          `/companies/${initial.id}`,
          payload,
          { ifMatch: etag },
        );
        setEtag(etagFor(updated.updatedAt));
      } else {
        await apiClient.post("/companies", payload);
      }
      router.push("/companies");
      router.refresh();
    } catch (e: any) {
      if (e instanceof ApiError && e.isPreconditionFailed) {
        toast.error(
          "This billing company was modified by someone else. Reload before re-saving.",
        );
        setError("Stale data — reload required.");
      } else {
        setError(parseError(e?.message));
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial || !confirm("Delete this company?")) return;
    await apiClient.delete(`/companies/${initial.id}`);
    router.push("/companies");
    router.refresh();
  }

  return (
    <EditPageChrome
      title={initial ? `Company · ${initial.name}` : "New billing company"}
      backHref="/companies"
      formId="company-form"
      saving={saving}
      rightActions={
        initial ? (
          <Button type="button" variant="danger" size="icon" onClick={remove} aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null
      }
    >
    <form id="company-form" onSubmit={submit}>
      <Card className="p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Row 1 */}
          <Field label="Company Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="ABN" required>
            <Input value={abn} onChange={(e) => setAbn(e.target.value)} placeholder="Australian Business Number" required />
          </Field>

          {/* Row 2 */}
          <Field label="Accounts Email (from)" required>
            <Input type="email" value={accountsEmail} onChange={(e) => setAccountsEmail(e.target.value)} required />
          </Field>
          <Field label="Invoice Backup Email (BCC)" required>
            <Input
              type="email"
              value={invoiceBcc}
              onChange={(e) => setInvoiceBcc(e.target.value)}
              required
              placeholder="bcc@example.com"
            />
          </Field>

          {/* Row 3 */}
          <Field label="Address" required>
            <Textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              className="min-h-0"
              placeholder={"Street\nSuburb\nCity, State Postcode"}
              required
            />
          </Field>
          <Field label="Active">
            <div className="flex h-9 items-center">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </Field>

          {/* Row 4 */}
          <Field label="Payment Details" required as="div">
            <RichTextEditor value={paymentDetails} onChange={setPaymentDetails} rows={4} placeholder="BSB / Account / Reference…" />
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} className="min-h-[148px]" />
          </Field>
        </div>

        {/* Send Via — controls whether this company emails via the system's
            Mail Configuration or its own SMTP credentials below. */}
        <div className="mt-6 border-t border-slate-100 pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Send Via" required>
              <Select value={sendVia} onValueChange={(v) => setSendVia(v as SendVia)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GENERAL_SMTP">General SMTP (from Settings / Mail Configuration)</SelectItem>
                  <SelectItem value="CUSTOM_SMTP">Custom SMTP</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {isCustom ? (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="SMTP Server" required>
                <Input value={smtpServer} onChange={(e) => setSmtpServer(e.target.value)} placeholder="smtp.example.com" required={isCustom} />
              </Field>
              <Field label="Encryption" required>
                <Select value={smtpEncryption} onValueChange={(v) => setSmtpEncryption(v as EmailEncryption)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMAIL_ENCRYPTIONS.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Port" required>
                <Input type="number" min={1} max={65535} value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} required={isCustom} />
              </Field>
              <Field label="User">
                <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Password" className="md:col-span-2">
                <Input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} autoComplete="off" />
              </Field>
              <div className="md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTestOpen(true)}
                  disabled={!smtpServer}
                >
                  Send Test Email
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {initial && (
          <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs md:grid-cols-3">
            <StampRow label="Created at" value={formatStamp(initial.createdAt)} />
            <StampRow label="Last edited at" value={formatStamp(initial.updatedAt)} />
            <StampRow label="Deactivated at" value={formatStamp(initial.deactivatedAt)} />
          </div>
        )}
        {error ? <p className="mt-3 text-xs text-rose-600">{error}</p> : null}
      </Card>
      <TestEmailDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        config={{
          smtpServer,
          port: Number(smtpPort) || 587,
          encryption: smtpEncryption,
          user: smtpUser,
          password: smtpPassword,
        }}
        defaultTo={accountsEmail || (smtpUser.includes("@") ? smtpUser : "")}
      />
    </form>
    </EditPageChrome>
  );
}

function StampRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-700">{value}</dd>
    </div>
  );
}

function parseError(msg?: string) {
  if (!msg) return "Something went wrong";
  if (/Invoice Backup Email/i.test(msg)) return "Invoice Backup Email (BCC) is required and must be a valid email.";
  if (/accountsEmail|email/i.test(msg)) return "Please check email fields.";
  return msg;
}

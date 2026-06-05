"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Copy, FileText, Menu, Send, Trash2 } from "lucide-react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { ApiError, apiBase, apiClient, etagFor } from "@/lib/api";
import { parseApiError } from "@/lib/api-errors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { EditPageChrome } from "@/components/layout/edit-page-chrome";
import {
  type Allocation,
  type Invoice,
  type InvoiceStatus,
  type BillingCompany,
  type Customer,
  type Item,
  type PaymentTerms,
  type TaxType,
} from "@/lib/types";
import { SendInvoiceDialog } from "@/components/invoices/send-invoice-dialog";
import { ReasonConfirmDialog } from "@/components/invoices/reason-confirm-dialog";
import {
  InvoiceBodyEditor,
  blankBodyLine,
  type BodyLine,
} from "@/components/invoices/invoice-body-editor";
import { AllocationsPanel } from "@/components/payments/allocations-panel";
import { ApplyPaymentModal } from "@/components/payments/apply-payment-modal";
import { Button } from "@/components/ui/button";

// Shape the backend ships back inside `GET /invoices/:id`. The Allocation rows
// are wrapped with a thin `transaction` snippet so the panel can render the
// date and description without a second fetch (see `invoices.service.ts`).
type AllocationWithTx = Allocation & {
  transaction?: { date: string; description: string } | null;
};

const DEFAULT_TERMS =
  "Please reference invoice number when making payment.\nA $25 search fee applies if the funds cannot be properly allocated to your account.";

// Format a Date as `yyyy-mm-dd` using local calendar parts. Using
// `toISOString().slice(0, 10)` shifts the date when the user is in a positive
// UTC offset, which silently introduces an off-by-one in computed due dates.
function localIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toIsoDate(d?: string | null) {
  if (!d) return "";
  return localIsoDate(new Date(d));
}

function todayIso(): string {
  return localIsoDate(new Date());
}

// Days to add to invoice date to get due date. Spec: (Payment Due In − 1 day),
// except DUE_ON_RECEIPT which means same day as the invoice date.
function paymentTermsToOffsetDays(p: PaymentTerms | null | undefined): number {
  switch (p) {
    case "IN_28_DAYS":
      return 27;
    case "IN_15_DAYS":
      return 14;
    case "IN_7_DAYS":
      return 6;
    case "DUE_ON_RECEIPT":
      return 0;
    default:
      return 0;
  }
}

function addDaysIso(isoDate: string, days: number): string {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return localIsoDate(d);
}

export function InvoiceForm({
  initial,
  customers,
  items,
  taxTypes,
}: {
  initial?: Invoice;
  customers: Customer[];
  // `companies` is still loaded by the page but no longer needed here —
  // billing company is derived from the selected customer.
  companies?: BillingCompany[];
  items: Item[];
  taxTypes: TaxType[];
}) {
  const router = useRouter();
  const activeTaxTypes = taxTypes.filter((t) => t.isActive);
  const defaultTax = activeTaxTypes[0] ?? null;
  const [invoiceDate, setInvoiceDate] = useState(toIsoDate(initial?.invoiceDate) || todayIso());
  const [dueDate, setDueDate] = useState(toIsoDate(initial?.dueDate));
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  // Status is locally mutable so Void can reflect immediately without a full
  // router refresh — the backend POST is the source of truth, but the UI flips
  // the badge as soon as the call resolves.
  const [status, setStatus] = useState<InvoiceStatus>(initial?.status ?? "DRAFT");
  const [poNumber, setPoNumber] = useState(initial?.poNumber ?? "");
  const [paymentDetails, setPaymentDetails] = useState(initial?.paymentDetails ?? "");
  const [internalNotes, setInternalNotes] = useState(initial?.internalNotes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? DEFAULT_TERMS);
  const [lines, setLines] = useState<BodyLine[]>(
    initial?.lineItems?.length
      ? initial.lineItems.map((l) => {
          const qty = Number(l.quantity) || 0;
          const price = Number(l.unitPrice) || 0;
          const lineAmount = +(qty * price).toFixed(2);
          const savedRate = l.taxRate != null ? Number(l.taxRate) : null;
          // Match by stored id first, then by (name + rate) for older invoices
          // that pre-date the TaxType linkage.
          const matched =
            (l.taxTypeId ? taxTypes.find((t) => t.id === l.taxTypeId) : null) ??
            (l.taxName
              ? taxTypes.find(
                  (t) => t.name === l.taxName && Number(t.rate) === (savedRate ?? 0),
                )
              : null) ??
            null;
          return {
            itemId: l.itemId ?? "",
            description: l.description,
            amount: String(lineAmount),
            taxTypeId: matched?.id ?? "",
            taxName: matched?.name ?? l.taxName ?? "",
            taxRate: matched ? String(matched.rate) : savedRate != null ? String(savedRate) : "",
          };
        })
      : [blankBodyLine(defaultTax)],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ETag for optimistic concurrency. Initialised from the loaded entity's
  // updatedAt; refreshed from every successful PATCH response so subsequent
  // saves stay in lock-step with the server's view.
  const [etag, setEtag] = useState<string | undefined>(
    initial ? etagFor((initial as any).updatedAt) : undefined,
  );
  const [sendOpen, setSendOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [receivePaymentOpen, setReceivePaymentOpen] = useState(false);
  // Existing invoices open in view mode (fields locked, Save disabled) and
  // require an explicit Edit click. New invoices skip this — there's no
  // saved state to protect yet.
  const [viewMode, setViewMode] = useState<boolean>(!!initial);

  const customer = customers.find((c) => c.id === customerId);
  const billingCompany = customer?.billingCompany ?? null;
  const billingCompanyId = billingCompany?.id ?? "";

  // Allocations are loaded from the backend via the extended `GET /invoices/:id`
  // include. We flatten the nested `transaction.date` / `transaction.description`
  // so the panel can render them inline.
  const rawAllocations: AllocationWithTx[] =
    (initial as (Invoice & { allocations?: AllocationWithTx[] }) | undefined)?.allocations ?? [];
  const allocations = rawAllocations.map((a) => ({
    ...a,
    transactionDate: a.transaction?.date ?? undefined,
    transactionDescription: a.transaction?.description ?? undefined,
  }));

  // Recompute due date on user-driven changes. Skip the very first effect run
  // so we don't clobber a saved due date when editing.
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    if (!customer || !invoiceDate) return;
    setDueDate(addDaysIso(invoiceDate, paymentTermsToOffsetDays(customer.paymentTerms)));
  }, [customerId, invoiceDate, customer]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (lines.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    setSaving(true);
    const payload = {
      invoiceDate: invoiceDate ? new Date(invoiceDate).toISOString() : undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      customerId: customerId || "",
      billingCompanyId: billingCompanyId || "",
      status,
      poNumber: poNumber || undefined,
      paymentDetails: paymentDetails || undefined,
      internalNotes: internalNotes || undefined,
      terms: terms || undefined,
      lineItems: lines.map((l) => ({
        itemId: l.itemId || undefined,
        description: l.description,
        // Quantity is no longer surfaced; we always send 1 and put the whole
        // per-line value into `unitPrice` so the backend's `lineAmount =
        // quantity * unitPrice` matches the UI's "Amount" exactly.
        quantity: 1,
        unitPrice: Number(l.amount) || 0,
        taxTypeId: l.taxTypeId || undefined,
        taxName: l.taxName || undefined,
        taxRate: l.taxRate ? Number(l.taxRate) : undefined,
      })),
    };
    try {
      if (initial) {
        const updated = await apiClient.patch<{ updatedAt: string }>(
          `/invoices/${initial.id}`,
          payload,
          { ifMatch: etag },
        );
        setEtag(etagFor(updated.updatedAt));
      } else {
        await apiClient.post("/invoices", payload);
      }
      router.push("/invoices");
      router.refresh();
    } catch (e: any) {
      if (e instanceof ApiError && e.isPreconditionFailed) {
        toast.error(
          "This invoice was modified by someone else. Reload the page to see the latest changes before re-saving.",
        );
        setError("Stale data — reload required.");
      } else {
        setError(parseApiError(e?.message));
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(reason: string) {
    if (!initial) return;
    await apiClient.delete(`/invoices/${initial.id}`, { reason });
    router.push("/invoices");
    router.refresh();
  }

  // Duplicate this invoice into a new DRAFT (fresh number, today's date) and
  // navigate to the clone's edit page so the user can tweak before saving.
  async function clone() {
    if (!initial) return;
    const created = await apiClient.post<Invoice>(`/invoices/${initial.id}/clone`, {});
    router.push(`/invoices/${created.id}`);
    router.refresh();
  }

  // Open the rendered PDF in a new tab.
  function openPdf() {
    if (!initial) return;
    window.open(`${apiBase()}/invoices/${initial.id}/pdf`, "_blank", "noopener,noreferrer");
  }

  async function voidInvoice(reason: string) {
    if (!initial) return;
    const updated = await apiClient.post<Invoice>(`/invoices/${initial.id}/void`, { reason });
    setStatus(updated.status);
    router.refresh();
  }

  const pageTitle = initial ? `Invoice · INV-${initial.invoiceNumber}` : "New invoice";
  // Send stays available on SENT invoices so the user can resend if the
  // first delivery bounced or the customer asks for a fresh copy. Only VOID
  // hides it — voided invoices are no longer collectable.
  const canSend = status !== "VOID";
  const canVoid = status !== "VOID";
  // Receive payment is meaningful only while the invoice is still collectable.
  // PAID has nothing outstanding; VOID isn't collectable. DRAFT could in theory
  // accept payments but the standard flow is to Send first, so we follow the
  // spec and gate on PAID/VOID only.
  const canReceivePayment = !!initial && status !== "PAID" && status !== "VOID";

  return (
    <EditPageChrome
      title={pageTitle}
      backHref="/invoices"
      formId="invoice-form"
      saving={saving}
      isViewMode={viewMode}
      onEditClick={() => setViewMode(false)}
      rightActions={
        initial ? (
          <>
            {canReceivePayment ? (
              <Button type="button" onClick={() => setReceivePaymentOpen(true)}>
                Receive payment
              </Button>
            ) : null}
            <ActionMenu
              onClone={clone}
              onPdf={openPdf}
              onSend={() => setSendOpen(true)}
              onVoid={() => setVoidOpen(true)}
              onDelete={() => setDeleteOpen(true)}
              canSend={canSend}
              canVoid={canVoid}
            />
          </>
        ) : null
      }
    >
      <form id="invoice-form" onSubmit={submit} className="flex flex-col gap-4">
        {/* `fieldset disabled` locks every native form control + Radix select
            inside it when in view mode. The rich-text editor honours the
            same flag via its own `disabled` prop further down the tree. */}
        <fieldset disabled={viewMode} className="m-0 flex flex-col gap-4 border-0 p-0 disabled:opacity-100">
          <InvoiceBodyEditor
            customers={customers}
            items={items}
            taxTypes={taxTypes}
            customerId={customerId}
            setCustomerId={setCustomerId}
            invoiceNumber={initial?.invoiceNumber ?? null}
            status={status}
            invoiceDate={invoiceDate}
            setInvoiceDate={setInvoiceDate}
            dueDate={dueDate}
            setDueDate={setDueDate}
            poNumber={poNumber}
            setPoNumber={setPoNumber}
            lines={lines}
            setLines={setLines}
            paymentDetails={paymentDetails}
            setPaymentDetails={setPaymentDetails}
            internalNotes={internalNotes}
            setInternalNotes={setInternalNotes}
            terms={terms}
            setTerms={setTerms}
            disabled={viewMode}
          />
        </fieldset>

        {/* Allocations sit outside the `<fieldset disabled>` so the trash /
            Receive-payment buttons stay operable when the form is in view
            mode — un-applying is a deliberate action with its own confirm
            modal, no different from Void / Delete in the action menu which
            also work without entering edit mode. Only shown on saved
            invoices (no allocations exist for a brand-new draft). */}
        {initial ? (
          <AllocationsPanel
            invoice={initial}
            allocations={allocations}
            onChanged={() => router.refresh()}
            onReceivePayment={() => setReceivePaymentOpen(true)}
          />
        ) : null}

        {error ? (
          <p className="text-xs text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      {initial ? (
        <>
          <SendInvoiceDialog
            open={sendOpen}
            onOpenChange={setSendOpen}
            invoiceId={initial.id}
            invoiceNumber={initial.invoiceNumber}
            customerName={initial.customer?.name ?? customer?.name ?? null}
            onSent={() => router.refresh()}
          />
          <ReasonConfirmDialog
            open={voidOpen}
            onOpenChange={setVoidOpen}
            title={`Void invoice INV-${initial.invoiceNumber}`}
            description="The invoice stays on file but its amounts are excluded from reports. The reason is saved on the invoice for the audit trail."
            reasonLabel="Reason to void"
            confirmLabel="Void invoice"
            onConfirm={voidInvoice}
          />
          <ReasonConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={`Delete invoice INV-${initial.invoiceNumber}`}
            description="The invoice is permanently removed. This cannot be undone. The reason is written to the backend log for traceability."
            reasonLabel="Reason to delete"
            confirmLabel="Delete invoice"
            onConfirm={remove}
          />
          {receivePaymentOpen ? (
            <ApplyPaymentModal
              context="invoice"
              invoice={initial}
              onClose={() => setReceivePaymentOpen(false)}
              onApplied={() => {
                setReceivePaymentOpen(false);
                router.refresh();
              }}
            />
          ) : null}
        </>
      ) : null}
    </EditPageChrome>
  );
}

// Radix dropdown holding the per-invoice destructive / secondary actions.
// Rendered only on saved invoices (Clone / PDF / Send / Void / Delete all
// require an id). Send hides when the invoice has already shipped or been
// voided; Void hides on already-voided rows. Delete sits in a danger-tinted
// group at the bottom.
function ActionMenu({
  onClone,
  onPdf,
  onSend,
  onVoid,
  onDelete,
  canSend,
  canVoid,
}: {
  onClone: () => void;
  onPdf: () => void;
  onSend: () => void;
  onVoid: () => void;
  onDelete: () => void;
  canSend: boolean;
  canVoid: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="More actions"
          className="inline-flex h-9 items-center gap-1.5 rounded-[0.3rem] border border-slate-200 bg-white px-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        >
          <Menu className="h-4 w-4" />
          Menu
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={4}
          className={cn(
            "z-50 min-w-[10rem] overflow-hidden rounded-[0.3rem] border border-slate-200 bg-white p-1 shadow-md",
            "data-[side=bottom]:animate-in data-[side=bottom]:fade-in-0 data-[side=bottom]:slide-in-from-top-1",
          )}
        >
          <ActionMenuItem icon={<Copy className="h-3.5 w-3.5" />} label="Clone" onSelect={onClone} />
          <ActionMenuItem icon={<FileText className="h-3.5 w-3.5" />} label="PDF" onSelect={onPdf} />
          {canSend ? (
            <ActionMenuItem icon={<Send className="h-3.5 w-3.5" />} label="Send" onSelect={onSend} />
          ) : null}
          {canVoid ? (
            <ActionMenuItem icon={<Ban className="h-3.5 w-3.5" />} label="Void" onSelect={onVoid} danger />
          ) : null}
          <DropdownMenuPrimitive.Separator className="my-1 h-px bg-slate-100" />
          <ActionMenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" onSelect={onDelete} danger />
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

function ActionMenuItem({
  icon,
  label,
  onSelect,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Item
      onSelect={(e) => {
        e.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none",
        danger
          ? "text-rose-700 focus:bg-rose-50"
          : "text-slate-700 focus:bg-slate-100 focus:text-slate-900",
      )}
    >
      {icon}
      {label}
    </DropdownMenuPrimitive.Item>
  );
}

import type { PublicInvoiceDesignProps } from "./types";
import type { DesignPalette } from "./palettes";

// Single shared layout for every customer-facing invoice view; styling is
// driven by the supplied palette so each PDF templateKey can match its
// matching React-PDF design aesthetically without duplicating the layout.
// Aesthetic parity (palette + font), not pixel parity, is the goal.

function formatCurrency(n: number): string {
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function PalettedInvoice({
  invoice,
  palette,
}: PublicInvoiceDesignProps & { palette: DesignPalette }) {
  const tax = invoice.lineItems.find((l) => l.taxName)?.taxName ?? "Tax";
  return (
    <div
      // Page-on-desk styling: solid border + drop shadow + generous min-height
      // so even short invoices read as a single A4 sheet of paper sitting on
      // the neutral grey desk rendered by <PublicInvoiceView>.
      className="mx-auto max-w-3xl border border-slate-300 p-8 shadow-[0_10px_30px_-10px_rgba(15,23,42,0.25)] min-h-[1086px] sm:p-12"
      style={{
        fontFamily: palette.fontVar,
        backgroundColor: palette.pageBg,
        color: palette.ink,
      }}
    >
      <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            className="text-base font-bold uppercase tracking-[0.16em]"
            style={{ color: palette.brand }}
          >
            {invoice.billingCompany?.name ?? ""}
          </h2>
          {invoice.billingCompany?.abn ? (
            <p className="mt-2 text-xs" style={{ color: palette.inkSoft }}>
              ABN: {invoice.billingCompany.abn}
            </p>
          ) : null}
          {invoice.billingCompany?.address ? (
            <p
              className="mt-2 whitespace-pre-line text-xs"
              style={{ color: palette.inkSoft }}
            >
              {invoice.billingCompany.address}
            </p>
          ) : null}
          {invoice.billingCompany?.accountsEmail ? (
            <p className="mt-1 text-xs" style={{ color: palette.inkSoft }}>
              E: {invoice.billingCompany.accountsEmail}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p
            className="text-2xl font-bold tracking-tight"
            style={{ color: palette.brand }}
          >
            Invoice
          </p>
          <p className="mt-1 text-base font-semibold">INV-{invoice.invoiceNumber}</p>
          <dl
            className="mt-4 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-1 border bg-white px-4 py-3 text-xs"
            style={{ borderColor: palette.border }}
          >
            <dt style={{ color: palette.inkSoft }}>Invoice Date</dt>
            <dd className="font-medium">{formatDate(invoice.invoiceDate)}</dd>
            {invoice.dueDate ? (
              <>
                <dt style={{ color: palette.inkSoft }}>Due Date</dt>
                <dd className="font-medium">{formatDate(invoice.dueDate)}</dd>
              </>
            ) : null}
            {invoice.poNumber ? (
              <>
                <dt style={{ color: palette.inkSoft }}>PO Number</dt>
                <dd className="font-medium">{invoice.poNumber}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </header>

      <section className="mb-8">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: palette.brand }}
        >
          Bill To
        </p>
        <p className="mt-1 font-semibold">{invoice.customer?.name ?? ""}</p>
        {invoice.customer?.address ? (
          <p
            className="mt-1 whitespace-pre-line text-xs"
            style={{ color: palette.inkSoft }}
          >
            {invoice.customer.address}
          </p>
        ) : null}
      </section>

      <div
        className="mb-6 overflow-hidden border bg-white"
        style={{ borderColor: palette.border }}
      >
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: palette.brand, color: "#ffffff" }}>
            <tr className="text-left text-[11px] uppercase tracking-[0.12em]">
              <th className="py-2.5 px-4 font-semibold">Description</th>
              <th className="py-2.5 px-4 text-right font-semibold">Amount</th>
              <th className="py-2.5 px-4 text-right font-semibold">Tax</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((l, i) => (
              <tr
                key={i}
                className="border-t align-top"
                style={{ borderColor: palette.border }}
              >
                <td className="py-3 px-4 whitespace-pre-line">{l.description}</td>
                <td className="py-3 px-4 text-right tabular-nums">
                  {formatCurrency(l.lineAmount)}
                </td>
                <td
                  className="py-3 px-4 text-right tabular-nums"
                  style={{ color: palette.inkSoft }}
                >
                  {l.taxName && l.taxRate != null ? `${l.taxName} ${l.taxRate}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-8 flex justify-end">
        <dl
          className="w-full max-w-xs space-y-1 border bg-white p-4 text-sm"
          style={{ borderColor: palette.border }}
        >
          <div className="flex justify-between">
            <dt style={{ color: palette.inkSoft }}>Subtotal</dt>
            <dd className="tabular-nums">{formatCurrency(invoice.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: palette.inkSoft }}>{tax}</dt>
            <dd className="tabular-nums">{formatCurrency(invoice.taxAmount)}</dd>
          </div>
          <div
            className="mt-2 flex justify-between border-t pt-2 text-base font-semibold"
            style={{ borderColor: palette.border, color: palette.brand }}
          >
            <dt>Total (incl. {tax})</dt>
            <dd className="tabular-nums">{formatCurrency(invoice.totalAmount)}</dd>
          </div>
        </dl>
      </div>

      {invoice.paymentDetails ? (
        <section
          className="mb-6 border-l-[3px] bg-white p-4 text-xs"
          style={{ borderLeftColor: palette.brand }}
        >
          <p
            className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: palette.brand }}
          >
            Payment Details
          </p>
          <div dangerouslySetInnerHTML={{ __html: invoice.paymentDetails }} />
        </section>
      ) : null}
      {invoice.terms ? (
        <section className="text-xs" style={{ color: palette.inkSoft }}>
          <p
            className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: palette.brand }}
          >
            Terms
          </p>
          <p className="whitespace-pre-line">{invoice.terms}</p>
        </section>
      ) : null}
    </div>
  );
}

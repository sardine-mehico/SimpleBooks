"use client";

import { browserApiBase } from "@/lib/api";
import { PalettedInvoice, getPalette } from "./index";
import type { PublicInvoice } from "./types";

// Customer-facing invoice page chrome. Resolves the palette from the
// snapshotted `invoiceTemplate.templateKey`, renders the paletted layout,
// and floats a "Download PDF" action that hits GET /public/invoices/:token/pdf
// with attachment disposition so the browser saves the file directly.
export function PublicInvoiceView({
  invoice,
  token,
}: {
  invoice: PublicInvoice;
  token: string;
}) {
  const palette = getPalette(invoice.invoiceTemplate?.templateKey);
  // Must be the browser-facing URL, not the in-compose `http://backend:4000`
  // that the SSR-time `apiBase()` would bake in — customers' browsers can't
  // route to a Docker service name.
  const pdfUrl = `${browserApiBase()}/public/invoices/${token}/pdf`;
  return (
    // Neutral "desk" background so the palette-tinted PalettedInvoice paper
    // reads as a discrete A4 sheet sitting on top.
    <div className="min-h-screen bg-slate-200 py-10">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs text-slate-600">
            Invoice INV-{invoice.invoiceNumber}
            {invoice.billingCompany?.name ? ` · ${invoice.billingCompany.name}` : ""}
          </p>
          <a
            href={pdfUrl}
            download
            className="inline-flex items-center gap-2 rounded-[0.3rem] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            style={{ backgroundColor: palette.brand }}
          >
            Download PDF
          </a>
        </div>
        <PalettedInvoice invoice={invoice} palette={palette} />
      </div>
    </div>
  );
}

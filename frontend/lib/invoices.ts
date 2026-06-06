import { api, browserApiBase } from "./api";

export type BulkSendResult = {
  sent: Array<{ id: string; invoiceNumber: number }>;
  failed: Array<{ id: string; invoiceNumber: number; error: string }>;
};

// Fetches a concatenated PDF for the given invoice IDs and returns a Blob
// suitable for triggering a browser download. Must be called client-side only.
export async function bulkPdfDownload(ids: string[]): Promise<Blob> {
  const res = await fetch(`${browserApiBase()}/invoices/bulk-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`PDF download failed: ${res.status}`);
  return res.blob();
}

// POST /invoices/bulk-send — sends each invoice via the default email flow.
export function bulkSendInvoices(ids: string[]): Promise<BulkSendResult> {
  return api<BulkSendResult>("/invoices/bulk-send", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

// POST /invoices/:id/mark-as-sent — manual status flip from DRAFT or
// FAILED_TO_SEND to SENT, for when delivery happened outside the app.
export function markInvoiceAsSent(id: string) {
  return api<{ id: string; status: string; updatedAt: string }>(
    `/invoices/${id}/mark-as-sent`,
    { method: "POST" },
  );
}

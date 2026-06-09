import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { readRuntimeConfig } from "@/lib/runtime-config";
import { PublicInvoiceView } from "@/components/public-invoice/public-invoice-view";
import type { PublicInvoice } from "@/components/public-invoice/types";

// Customer-facing public invoice page. The token in the URL is the only auth;
// the backend's status guards (DRAFT/VOID/FAILED → 404) keep invoices out of
// the wrong customer's hands. First view of a SENT invoice flips status to
// VIEWED via the backend's same-transaction update.
export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let invoice: PublicInvoice;
  try {
    invoice = await api<PublicInvoice>(`/public/invoices/${encodeURIComponent(token)}`);
  } catch {
    notFound();
  }
  // Compute the public PDF URL on the server so the SSR HTML already carries
  // the right hostname. The client-side `browserApiBase()` falls back to
  // `http://localhost:4000` during SSR (when window is undefined), which
  // would leak into the rendered <a href=...> and bounce customers off to
  // localhost when they clicked Download PDF.
  const apiUrl = readRuntimeConfig().apiUrl;
  return <PublicInvoiceView invoice={invoice} token={token} apiUrl={apiUrl} />;
}

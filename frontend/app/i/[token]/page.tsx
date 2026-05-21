import { notFound } from "next/navigation";
import { api } from "@/lib/api";
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
  return <PublicInvoiceView invoice={invoice} token={token} />;
}

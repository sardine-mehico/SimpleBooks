import { notFound } from "next/navigation";
import { DESIGN_PALETTES } from "@/components/public-invoice/palettes";
import { PublicInvoiceView } from "@/components/public-invoice/public-invoice-view";
import type { PublicInvoice } from "@/components/public-invoice/types";

// Developer/operator preview route. Renders the customer-facing
// <PublicInvoiceView> with the chosen design palette against a static
// "sample invoice" fixture so the operator can eyeball each design in the
// browser without seeding real data. Open /preview/design/design-1 …
// /preview/design/design-10.
const SAMPLE_INVOICE: PublicInvoice = {
  invoiceNumber: 1042,
  invoiceDate: "2026-05-21T00:00:00.000Z",
  dueDate: "2026-06-17T00:00:00.000Z",
  status: "VIEWED",
  subtotal: 1280,
  taxAmount: 128,
  totalAmount: 1408,
  poNumber: "PO-998877",
  paymentDetails:
    "<strong>BSB:</strong> 062-000<br/><strong>Account:</strong> 1234 5678<br/><em>Reference:</em> invoice number",
  terms:
    "Please reference invoice number when making payment.\nA $25 search fee applies if the funds cannot be properly allocated to your account.",
  invoiceTemplate: { templateKey: "design-1" },
  customer: {
    name: "Acme Pty Ltd",
    address: "Level 2, 14 Sample Street\nSydney NSW 2000",
    billingEmail1: "accounts@acme.example",
  },
  billingCompany: {
    name: "SimpleBooks Pty Ltd",
    abn: "12 345 678 901",
    address: "1 Example Street\nLevel 2, Suite 5\nSydney NSW 2000",
    accountsEmail: "accounts@simplebooks.com",
  },
  lineItems: [
    {
      description: "Cleaning service for 4 weeks (from 21/05/2026 to 17/06/2026)",
      quantity: 1,
      unitPrice: 1000,
      lineAmount: 1000,
      taxName: "GST",
      taxRate: 10,
      taxAmount: 100,
    },
    {
      description: "Carpet shampoo — common areas",
      quantity: 1,
      unitPrice: 280,
      lineAmount: 280,
      taxName: "GST",
      taxRate: 10,
      taxAmount: 28,
    },
  ],
};

export default async function PublicInvoicePreviewPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  if (!DESIGN_PALETTES[key]) notFound();
  const invoice: PublicInvoice = { ...SAMPLE_INVOICE, invoiceTemplate: { templateKey: key } };
  // Token is irrelevant in preview — there's no real PDF route, but the
  // Download PDF button still renders so the operator can see its colour.
  return <PublicInvoiceView invoice={invoice} token="PREVIEW_TOKEN" />;
}

// Mirror of the backend `PublicInvoiceDto` in
// backend/src/public-invoices/public-invoices.service.ts. Keep them in
// lockstep — both ends of the wire read this shape.
export type PublicInvoice = {
  invoiceNumber: number;
  invoiceDate: string;
  dueDate: string | null;
  status: "SENT" | "VIEWED" | "PARTIAL_PAID" | "PAID";
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  poNumber: string | null;
  paymentDetails: string | null;
  terms: string | null;
  invoiceTemplate: { templateKey: string } | null;
  customer: { name: string; address: string | null; billingEmail1: string | null } | null;
  billingCompany: {
    name: string;
    abn: string | null;
    address: string | null;
    accountsEmail: string | null;
  } | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    lineAmount: number;
    taxName: string | null;
    taxRate: number | null;
    taxAmount: number;
  }>;
};

export type PublicInvoiceDesignProps = {
  invoice: PublicInvoice;
};

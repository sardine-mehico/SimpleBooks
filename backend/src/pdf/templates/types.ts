// Shared shape passed into every React-PDF invoice template. Kept narrow
// (only the fields a template actually needs) so test fixtures are easy to
// build and the contract stays explicit.

export type PdfLineItem = {
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  lineAmount: number | string;
  taxName: string | null;
  taxRate: number | string | null;
  taxAmount: number | string;
};

export type PdfInvoice = {
  invoiceNumber: number;
  invoiceDate: Date;
  dueDate: Date | null;
  poNumber: string | null;
  paymentDetails: string | null;
  terms: string | null;
  subtotal: number | string;
  taxAmount: number | string;
  totalAmount: number | string;
  lineItems: PdfLineItem[];
};

export type PdfCompany = {
  name: string;
  abn: string | null;
  address: string | null;
  accountsEmail: string | null;
} | null;

export type PdfCustomer = {
  name: string;
  address: string | null;
  billingEmail1: string | null;
} | null;

export type PdfTemplateProps = {
  invoice: PdfInvoice;
  company: PdfCompany;
  customer: PdfCustomer;
};

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

// === Statement template ===

export type PdfStatementRow = {
  date: string;            // YYYY-MM-DD
  type: 'INVOICE' | 'PAYMENT';
  details: string;
  amount: string;          // "0.00" when type === PAYMENT
  payment: string;         // "0.00" when type === INVOICE
  balance: string;
};

export type PdfStatementPayload = {
  customer: {
    customerNumber: number;
    name: string;
    address: string | null;
    billingEmail1: string | null;
  };
  billingCompany: {
    name: string;
    abn: string | null;
    address: string | null;
    accountsEmail: string | null;
  };
  dateFrom: string | null;   // YYYY-MM-DD
  dateTo: string | null;
  openingBalance: string;
  rows: PdfStatementRow[];
  summary: {
    invoicedAmount: string;
    amountReceived: string;
    balanceDue: string;
  };
};

export type PdfStatementTemplateProps = {
  statement: PdfStatementPayload;
};

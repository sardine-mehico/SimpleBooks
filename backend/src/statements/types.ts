// Shape returned by GET /statements. Numbers are Decimal-as-string
// (`.toFixed(2)`) per the existing convention — the frontend wraps in
// Number(...) for display math.

export type StatementRowType = 'INVOICE' | 'PAYMENT';

export type StatementRow = {
  date: string;            // YYYY-MM-DD (the row's transaction-or-invoice date)
  type: StatementRowType;
  details: string;         // e.g. "Invoice No 10488" / "Payment Received $746.16 on 02/09/2024"
  amount: string;          // "0.00" when type === 'PAYMENT'
  payment: string;         // "0.00" when type === 'INVOICE'
  balance: string;
};

export type StatementResponse = {
  customer: {
    id: string;
    customerNumber: number;
    name: string;
    address: string | null;
    billingEmail1: string | null;
    billingEmail2: string | null;
  };
  billingCompany: {
    id: string;
    name: string;
    abn: string | null;
    address: string | null;
    accountsEmail: string | null;
    invoiceBcc: string;
    paymentDetails: string | null;
  };
  dateFrom: string | null;   // YYYY-MM-DD or null (= "all time" lower bound)
  dateTo: string | null;     // YYYY-MM-DD or null (= "all time" upper bound)
  openingBalance: string;
  rows: StatementRow[];
  summary: {
    invoicedAmount: string;
    amountReceived: string;
    balanceDue: string;
  };
};

export type StatementSendContext = {
  from: string;   // billingCompany.accountsEmail
  to: string;     // customer.billingEmail1
  cc: string;     // customer.billingEmail2 or ''
  bcc: string;   // billingCompany.invoiceBcc or ''
  subject: string;
  html: string;
};

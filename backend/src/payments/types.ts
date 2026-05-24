// backend/src/payments/types.ts

export interface ScoredInvoiceView {
  id: string;
  invoiceNumber: number;
  invoiceDate: string;   // ISO date (yyyy-mm-dd)
  totalAmount: string;
  amountOutstanding: string;
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PAID' | 'VOID';
  customerId: string | null;
  customerName: string | null;
  score: number;
  signals: {
    invoiceNumber: boolean;
    exactAmount: boolean;
    customerToken: boolean;
    datePlausible: boolean;
    partialBonus: boolean;
  };
}

export interface BundleSuggestionView {
  invoiceIds: string[];
  invoices: Array<{ id: string; invoiceNumber: number; amountOutstanding: string }>;
  total: string;
}

export interface CandidatesResponse {
  candidates: ScoredInvoiceView[];
  bundleSuggestion: BundleSuggestionView | null;
}

export interface PaymentQueueItem {
  id: string;
  date: string;
  amount: string;
  description: string;
  accountId: string;
  accountName: string;
  vendorId: string | null;
  vendorName: string | null;
  vendorCustomerId: string | null;
  vendorCustomerName: string | null;
  unallocated: string;
}

export interface AllocationView {
  id: string;
  transactionId: string;
  invoiceId: string;
  amount: string;
  createdAt: string;
  transactionDate: string;
  transactionDescription: string;
}

export interface CustomerCreditView {
  credit: string;
  transactions: Array<{
    id: string;
    date: string;
    amount: string;
    remaining: string;
    description: string;
  }>;
}

export interface ApplyResponse {
  transaction: {
    id: string;
    amount: string;
    unallocated: string;
  };
  invoices: Array<{
    id: string;
    status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PAID' | 'VOID';
    amountPaid: string;
    amountOutstanding: string;
  }>;
}

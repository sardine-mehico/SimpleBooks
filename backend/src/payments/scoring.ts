import { Decimal } from '@prisma/client/runtime/library';

export interface ScoreTransaction {
  description: string;
  unallocated: Decimal;
  date: Date;
  // categoryCustomerId is the FK the user has set on the transaction's Category
  // (Category.customerId). When this matches invoice.customerId, +30 fires — a
  // strong signal that the user has manually identified the payer.
  categoryCustomerId?: string | null;
  // tagCustomerIds is the set of Tag.customerId values across all tags attached
  // to the transaction. Symmetric to categoryCustomerId — if any element matches
  // invoice.customerId, +30 fires.
  tagCustomerIds?: string[];
}

export interface ScoreInvoice {
  invoiceNumber: number;
  amountOutstanding: Decimal;
  invoiceDate: Date;
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PAID' | 'VOID';
  customerId: string;
}

export interface ScoreCustomer {
  displayName: string;
}

export interface ScoreSignals {
  invoiceNumber: boolean;
  exactAmount: boolean;
  customerToken: boolean;
  datePlausible: boolean;
  partialBonus: boolean;
  categoryCustomerMatch: boolean;
  tagCustomerMatch: boolean;
}

export interface ScoreResult {
  total: number;
  signals: ScoreSignals;
}

const INVOICE_NUMBER_RE = /INV[-\s]?0*(\d{3,6})/i;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export function scoreInvoice(
  tx: ScoreTransaction,
  invoice: ScoreInvoice,
  customer: ScoreCustomer,
): ScoreResult {
  const signals: ScoreSignals = {
    invoiceNumber: false,
    exactAmount: false,
    customerToken: false,
    datePlausible: false,
    partialBonus: false,
    categoryCustomerMatch: false,
    tagCustomerMatch: false,
  };

  // Signal 1: invoice number in description (+60)
  const m = tx.description.match(INVOICE_NUMBER_RE);
  if (m && Number(m[1]) === invoice.invoiceNumber) {
    signals.invoiceNumber = true;
  }

  // Signal 2: exact amount equality (+40)
  if (tx.unallocated.eq(invoice.amountOutstanding)) {
    signals.exactAmount = true;
  }

  // Signal 3: customer name token (length >= 4) substring match, case-insensitive (+15)
  const descLower = tx.description.toLowerCase();
  const tokens = customer.displayName.split(/\s+/).filter((t) => t.length >= 4);
  for (const t of tokens) {
    if (descLower.includes(t.toLowerCase())) {
      signals.customerToken = true;
      break;
    }
  }

  // Signal 4: date plausible — invoiceDate <= tx.date <= invoiceDate + 60d (+10)
  const txMs = tx.date.getTime();
  const invMs = invoice.invoiceDate.getTime();
  if (txMs >= invMs && txMs <= invMs + SIXTY_DAYS_MS) {
    signals.datePlausible = true;
  }

  // Signal 5: invoice already PARTIAL_PAID (+5)
  if (invoice.status === 'PARTIAL_PAID') {
    signals.partialBonus = true;
  }

  // Signal 6: tx.category.customerId === invoice.customerId (+30).
  // Strong signal — the user has manually labelled the transaction's category as
  // belonging to this customer, so any of that customer's invoices should rank high.
  if (tx.categoryCustomerId && tx.categoryCustomerId === invoice.customerId) {
    signals.categoryCustomerMatch = true;
  }

  // Signal 7: any tag on the transaction has customerId === invoice.customerId (+30).
  // Symmetric to signal 6. Tags replaced the old Vendor concept; a tag with a
  // customerId set means the user labelled the counterparty via that tag.
  if (tx.tagCustomerIds && tx.tagCustomerIds.includes(invoice.customerId)) {
    signals.tagCustomerMatch = true;
  }

  const total =
    (signals.invoiceNumber ? 60 : 0) +
    (signals.exactAmount ? 40 : 0) +
    (signals.categoryCustomerMatch ? 30 : 0) +
    (signals.tagCustomerMatch ? 30 : 0) +
    (signals.customerToken ? 15 : 0) +
    (signals.datePlausible ? 10 : 0) +
    (signals.partialBonus ? 5 : 0);

  return { total, signals };
}

import { Decimal } from '@prisma/client/runtime/library';

export type DerivableStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PAID' | 'VOID';

export interface RecomputeInvoiceInput {
  status: DerivableStatus;
  totalAmount: Decimal;
  viewedAt: Date | null;
  sendAttempts: number;
}

export interface RecomputeAllocation {
  amount: Decimal;
}

export interface RecomputeResult {
  amountPaid: Decimal;
  amountOutstanding: Decimal;
  status: DerivableStatus;
}

export function recomputeInvoicePayment(
  invoice: RecomputeInvoiceInput,
  allocations: RecomputeAllocation[],
): RecomputeResult {
  const allocSum = allocations.reduce(
    (acc, a) => acc.add(a.amount),
    new Decimal(0),
  );
  const amountPaid = allocSum;
  const amountOutstanding = invoice.totalAmount.sub(allocSum);

  // VOID is terminal — never auto-changed by this helper.
  if (invoice.status === 'VOID') {
    return { amountPaid, amountOutstanding, status: 'VOID' };
  }

  let status: DerivableStatus;
  if (allocSum.eq(invoice.totalAmount)) {
    status = 'PAID';
  } else if (allocSum.gt(0)) {
    status = 'PARTIAL_PAID';
  } else if (invoice.viewedAt !== null) {
    status = 'VIEWED';
  } else if (invoice.sendAttempts > 0) {
    status = 'SENT';
  } else {
    status = 'DRAFT';
  }
  return { amountPaid, amountOutstanding, status };
}

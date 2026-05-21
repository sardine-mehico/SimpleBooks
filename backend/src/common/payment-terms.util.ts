import { PaymentTerms } from '@prisma/client';

// Same table the invoice form uses for "Due Date auto-compute". Mirrors the
// frontend's `paymentTermsToOffsetDays` so generated invoices land on the same
// due date the user would have computed manually.
export function paymentTermsOffsetDays(p: PaymentTerms | null | undefined): number {
  switch (p) {
    case 'IN_28_DAYS':
      return 27;
    case 'IN_15_DAYS':
      return 14;
    case 'IN_7_DAYS':
      return 6;
    case 'DUE_ON_RECEIPT':
      return 0;
    default:
      return 0;
  }
}

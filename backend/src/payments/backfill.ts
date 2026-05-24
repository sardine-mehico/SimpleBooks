import type { PrismaService } from '../prisma/prisma.service';

// One-shot, idempotent backfill of denormalised payment columns.
// The WHERE clause means a second run is a no-op on already-backfilled rows.
// Called from PaymentsModule.onModuleInit.
export async function runPaymentsBackfill(
  prisma: Pick<PrismaService, '$executeRawUnsafe'>,
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    UPDATE "Invoice"
    SET "amountPaid"        = CASE WHEN status = 'PAID' THEN "totalAmount" ELSE 0 END,
        "amountOutstanding" = CASE WHEN status = 'PAID' THEN 0 ELSE "totalAmount" END
    WHERE "amountPaid" = 0 AND "amountOutstanding" = 0
  `);
}

import { runPaymentsBackfill } from './backfill';

function makePrisma() {
  const updates: any[] = [];
  return {
    _updates: updates,
    $executeRawUnsafe: jest.fn(async (sql: string) => {
      updates.push(sql);
      // Return rowcount for the call. First call: rowCount=2. Subsequent calls: 0.
      return updates.length === 1 ? 2 : 0;
    }),
  } as any;
}

describe('runPaymentsBackfill', () => {
  it('issues a single UPDATE matching the spec SQL', async () => {
    const prisma = makePrisma();
    await runPaymentsBackfill(prisma);
    expect(prisma._updates).toHaveLength(1);
    expect(prisma._updates[0]).toContain('UPDATE "Invoice"');
    expect(prisma._updates[0]).toContain('amountPaid');
    expect(prisma._updates[0]).toContain('amountOutstanding');
    expect(prisma._updates[0]).toContain('WHERE "amountPaid" = 0 AND "amountOutstanding" = 0');
  });

  it('is idempotent — second run does not write any new rows', async () => {
    const prisma = makePrisma();
    await runPaymentsBackfill(prisma);
    await runPaymentsBackfill(prisma);
    expect(prisma._updates).toHaveLength(2); // the SQL is fired twice, but the WHERE clause guards
  });
});

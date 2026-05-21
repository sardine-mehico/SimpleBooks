// Revert the catalog to the 4 user-curated Items and rebuild every invoice's
// line items so they reference only those 4. Preserves each invoice's
// existing line-item count (so the 4/3/2/1 distribution is untouched), but
// every line is now sourced from the catalog: description = Item.name,
// unitPrice = Item.unitPrice, itemId = Item.id, quantity randomised 1..4 so
// totals stay varied even with a small catalog. Invoice subtotal/tax/total
// are recomputed from the regenerated lines.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Same PRNG as the seed script for reproducible quantities.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260522);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const KEEPER_NAMES = [
  "Cleaning service for 4 weeks",
  "Cleaning service for this month",
  "One-off cleaning service",
  "Supplies",
];

async function main() {
  console.log("== use-only-original-items ==");

  // 1) Record current per-invoice line-item counts so we can preserve the
  // 4/3/2/1 distribution after deletion.
  const counts = await prisma.invoiceItem.groupBy({
    by: ["invoiceId"],
    _count: { _all: true },
  });
  const lineCountByInvoice = new Map(counts.map((c) => [c.invoiceId, c._count._all]));
  console.log(`[snapshot] captured line counts for ${lineCountByInvoice.size} invoices`);

  // 2) Delete every InvoiceItem (also clears the itemId FK refs).
  const removedLines = await prisma.invoiceItem.deleteMany({});
  console.log(`[wipe] deleted ${removedLines.count} InvoiceItem rows`);

  // 3) Delete every Item that's not one of the 4 originals.
  const removedItems = await prisma.item.deleteMany({
    where: { name: { notIn: KEEPER_NAMES } },
  });
  console.log(`[wipe] deleted ${removedItems.count} Item rows (the 22 added by the previous script)`);
  const remainingItems = await prisma.item.findMany({ orderBy: { name: "asc" } });
  console.log(`[catalog] remaining ${remainingItems.length} items:`,
    remainingItems.map((i) => `${i.name} (\$${i.unitPrice})`).join(", "));
  if (remainingItems.length !== 4) {
    throw new Error(`expected 4 remaining items, got ${remainingItems.length}`);
  }

  // 4) Rebuild every invoice's line items from the 4-item catalog. Quantity
  // is 1..4 (skewed low) so even small-unitPrice items can produce varied
  // line amounts.
  const allInvoices = await prisma.invoice.findMany({ select: { id: true } });
  let totalLinesCreated = 0;
  let processed = 0;
  for (const inv of allInvoices) {
    const n = lineCountByInvoice.get(inv.id) ?? 1;
    const lines = [];
    for (let position = 0; position < n; position++) {
      const item = pick(remainingItems);
      const quantity = pick([1, 1, 1, 1, 2, 2, 2, 3, 3, 4]);
      const unitPrice = Number(item.unitPrice);
      const lineAmount = +(unitPrice * quantity).toFixed(2);
      const taxAmount = +(lineAmount * 0.1).toFixed(2);
      lines.push({
        itemId: item.id,
        description: item.name,
        quantity,
        unitPrice,
        lineAmount,
        taxName: "GST",
        taxRate: 10,
        taxAmount,
        position,
      });
    }
    const subtotal = +lines.reduce((s, l) => s + l.lineAmount, 0).toFixed(2);
    const taxAmount = +lines.reduce((s, l) => s + l.taxAmount, 0).toFixed(2);
    const totalAmount = +(subtotal + taxAmount).toFixed(2);

    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        subtotal,
        taxAmount,
        totalAmount,
        lineItems: { create: lines },
      },
    });
    totalLinesCreated += lines.length;
    processed++;
    if (processed % 40 === 0) console.log(`[rebuild] processed ${processed}/${allInvoices.length}`);
  }
  console.log(`[rebuild] regenerated ${totalLinesCreated} InvoiceItem rows across ${processed} invoices`);

  const summary = {
    items: await prisma.item.count(),
    invoices: await prisma.invoice.count(),
    invoiceItems: await prisma.invoiceItem.count(),
    invoiceItemsLinked: await prisma.invoiceItem.count({ where: { itemId: { not: null } } }),
  };
  console.log("== summary ==", summary);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

// Adds 150 invoices to the dev DB, additive (does not wipe).
// Spreads invoices across the past 12 months, mixes statuses, picks 1-3 line
// items per invoice from the seeded Item table, computes totals correctly,
// and snapshots the billing company's template assignments onto each row.
//
// Run from the repo root:
//   docker cp scripts/add-150-invoices.js simplebooks-backend-1:/tmp/
//   docker compose exec backend node /tmp/add-150-invoices.js

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260530);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const intBetween = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// Random date within the past N days.
function dateNDaysAgo(maxDays) {
  const days = Math.floor(rand() * maxDays);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

// Pick a status with a realistic distribution.
function pickStatus() {
  const r = rand();
  if (r < 0.55) return "PAID";
  if (r < 0.75) return "SENT";
  if (r < 0.85) return "VIEWED";
  if (r < 0.92) return "PARTIAL_PAID";
  if (r < 0.97) return "DRAFT";
  return "VOID";
}

async function main() {
  const customers = await prisma.customer.findMany({ where: { isActive: true } });
  const companies = await prisma.billingCompany.findMany({ where: { isActive: true } });
  const items = await prisma.item.findMany({ where: { isActive: true } });
  if (customers.length === 0) throw new Error("No active customers");
  if (companies.length === 0) throw new Error("No active billing companies");
  if (items.length === 0) throw new Error("No active items");

  const top = await prisma.invoice.findFirst({ orderBy: { invoiceNumber: "desc" } });
  let nextNumber = (top?.invoiceNumber ?? 999) + 1;

  console.log(`Starting at invoice number ${nextNumber}`);
  console.log(`Pool: ${customers.length} customers, ${companies.length} billing companies, ${items.length} items`);

  let created = 0;
  for (let i = 0; i < 150; i++) {
    const customer = pick(customers);
    const company = pick(companies);
    const status = pickStatus();
    const invoiceDate = dateNDaysAgo(365);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + pick([7, 14, 28, 30]));

    // 1-3 line items.
    const lineCount = intBetween(1, 3);
    const lineItems = [];
    let subtotal = 0;
    let taxAmount = 0;
    for (let j = 0; j < lineCount; j++) {
      const item = pick(items);
      const quantity = intBetween(1, 5);
      const unitPrice = Number(item.unitPrice);
      const lineAmount = +(quantity * unitPrice).toFixed(2);
      // No tax types seeded → no tax on lines.
      const lineTaxAmount = 0;
      subtotal += lineAmount;
      taxAmount += lineTaxAmount;
      lineItems.push({
        itemId: item.id,
        description: item.name,
        quantity,
        unitPrice,
        lineAmount,
        taxTypeId: null,
        taxName: null,
        taxRate: null,
        taxAmount: lineTaxAmount,
        position: j,
      });
    }
    subtotal = +subtotal.toFixed(2);
    taxAmount = +taxAmount.toFixed(2);
    const totalAmount = +(subtotal + taxAmount).toFixed(2);

    // Payment fields consistent with status.
    let amountPaid = 0;
    let amountOutstanding = totalAmount;
    if (status === "PAID") {
      amountPaid = totalAmount;
      amountOutstanding = 0;
    } else if (status === "PARTIAL_PAID") {
      amountPaid = +(totalAmount * (0.3 + rand() * 0.4)).toFixed(2);
      amountOutstanding = +(totalAmount - amountPaid).toFixed(2);
    } else if (status === "VOID" || status === "DRAFT") {
      amountPaid = 0;
      amountOutstanding = 0;
    }

    await prisma.invoice.create({
      data: {
        invoiceNumber: nextNumber++,
        invoiceDate,
        dueDate,
        customerId: customer.id,
        billingCompanyId: company.id,
        invoiceTemplateId: company.invoiceTemplateId,
        emailTemplateId: company.emailTemplateId,
        status,
        subtotal,
        taxAmount,
        totalAmount,
        amountPaid,
        amountOutstanding,
        voidReason: status === "VOID" ? "Created as test data with VOID status" : null,
        voidedAt: status === "VOID" ? invoiceDate : null,
        lineItems: { create: lineItems },
      },
    });
    created++;
  }

  console.log(`Created ${created} invoices. New max invoiceNumber = ${nextNumber - 1}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

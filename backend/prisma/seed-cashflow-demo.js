// One-shot seed script to populate the DB with realistic cashflow data
// for testing the Cashflow Sankey report.
//
// Usage (from project root):
//   docker compose cp backend/prisma/seed-cashflow-demo.js backend:/tmp/seed-cf.js
//   docker compose exec backend sh -c 'cd /app && node /tmp/seed-cf.js'
//
// Idempotency: NOT idempotent. Designed to run once against a fresh DB
// (with the standard minimal seed already in place). Re-running will
// duplicate billing companies, customers, accounts, and categories.

const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

const FY_START = new Date('2025-07-01');
const FY_END   = new Date('2026-06-06');

const randomDate = (start, end) =>
  new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const randomAmt = (min, max) => Math.round((min + Math.random() * (max - min)) * 100) / 100;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const weightedPick = (items, weightFn) => {
  const total = items.reduce((a, it) => a + weightFn(it), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= weightFn(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
};

async function main() {
  console.log('seed-cashflow-demo: starting');

  // ── AccountType (reuse "Transactions" if present) ─────────────────────────
  let accountType = await prisma.accountType.findFirst({ where: { name: 'Transactions' } });
  if (!accountType) {
    accountType = await prisma.accountType.create({
      data: { name: 'Transactions', description: 'Day-to-day account for income and expenses' },
    });
  }

  // ── 5 Billing Companies + 5 Customers each ────────────────────────────────
  const bcSpecs = [
    { name: 'Acme Cleaning Services', customers: ['Northbridge Offices', 'West Perth Dental', 'Subiaco Legal Group', 'East Vic Park Cafe', 'Cottesloe Real Estate'] },
    { name: 'Pearl Tutoring Group',  customers: ['Mt Lawley Family',  'Como Family',         'Applecross Family',     'Nedlands Family',     'Floreat Family'] },
    { name: 'Bright Spark Electrical', customers: ['Burswood Apartments', 'Joondalup Strata', 'Belmont Warehousing', 'Welshpool Industrial', 'Canning Vale Logistics'] },
    { name: 'Mountain View Catering', customers: ['Hyatt Centric Events', 'Crown Functions',  'Optus Stadium Hospitality', 'Perth Concert Hall', 'Pan Pacific Events'] },
    { name: 'Silverline Consulting',  customers: ['Dept of Mines WA',   'Wesfarmers Strategy', 'Rio Tinto Logistics',   'BHP Operations',       'Woodside Projects'] },
  ];

  const maxCust = await prisma.customer.findFirst({ orderBy: { customerNumber: 'desc' } });
  let nextCustNum = (maxCust?.customerNumber ?? 1000) + 1;

  const billingCompanies = [];
  const customers = []; // { id, name, billingCompanyId }
  for (const spec of bcSpecs) {
    const slug = spec.name.toLowerCase().replace(/[^a-z]/g, '');
    const bc = await prisma.billingCompany.create({
      data: {
        name: spec.name,
        abn: '00 000 000 000',
        address: 'Perth WA 6000',
        accountsEmail: `accounts@${slug}.com.au`,
        invoiceBcc: '',
        isActive: true,
        sendVia: 'GENERAL_SMTP',
      },
    });
    billingCompanies.push(bc);
    for (const cName of spec.customers) {
      const c = await prisma.customer.create({
        data: {
          customerNumber: nextCustNum++,
          name: cName,
          billingCompanyId: bc.id,
          paymentTerms: 'IN_28_DAYS',
          isActive: true,
        },
      });
      customers.push({ id: c.id, name: c.name, billingCompanyId: bc.id });
    }
  }
  console.log(`  billing companies: ${billingCompanies.length}`);
  console.log(`  customers: ${customers.length}`);

  // ── 5 Accounts ────────────────────────────────────────────────────────────
  const accountSpecs = [
    { name: 'ANZ Operating',     bank: 'ANZ' },
    { name: 'Westpac Savings',   bank: 'Westpac' },
    { name: 'NAB Petty Cash',    bank: 'NAB' },
    { name: 'CommBank Business', bank: 'CommBank' },
    { name: 'ING Investments',   bank: 'ING' },
  ];
  const accounts = [];
  for (const a of accountSpecs) {
    const acc = await prisma.account.create({
      data: {
        name: a.name,
        bank: a.bank,
        accountTypeId: accountType.id,
        openingBalance: 0,
        openingDate: new Date('2025-06-30'),
        isActive: true,
      },
    });
    accounts.push(acc);
  }
  console.log(`  accounts: ${accounts.length}`);

  // ── Categories ────────────────────────────────────────────────────────────
  // Income — top-level leaves.
  const incomeCats = {};
  for (const n of ['Investments', 'Salary']) {
    let existing = await prisma.category.findFirst({ where: { name: n, kind: 'INCOME', parentId: null } });
    if (!existing) {
      existing = await prisma.category.create({
        data: { name: n, kind: 'INCOME', isActive: true, sortOrder: 100 },
      });
    }
    incomeCats[n] = existing;
  }

  // Expense — 5 parents with 3-4 subs each.
  const expenseTree = {
    Operations: ['Rent', 'Utilities', 'Internet & Phone', 'Supplies'],
    Staff:      ['Wages', 'Superannuation', 'Training'],
    Vehicle:    ['Fuel', 'Servicing', 'Insurance'],
    Marketing:  ['Advertising', 'Website', 'Print'],
    Finance:    ['Bank Fees', 'Loan Interest', 'Accounting'],
  };
  const expenseLeaves = []; // { id, name, parentName, weight }
  // Per-leaf weight (rough share of txn count) and amount range.
  const leafTuning = {
    Rent:              { weight: 12,  min: 1800, max: 2500 },
    Utilities:         { weight: 36,  min:  100, max:  400 },
    'Internet & Phone':{ weight: 24,  min:   80, max:  200 },
    Supplies:          { weight: 160, min:   30, max:  500 },
    Wages:             { weight: 150, min: 1500, max: 3500 },
    Superannuation:    { weight: 24,  min:  200, max:  600 },
    Training:          { weight: 12,  min:  100, max: 1500 },
    Fuel:              { weight: 220, min:   50, max:  200 },
    Servicing:         { weight: 8,   min:  200, max: 1500 },
    Insurance:         { weight: 6,   min:  200, max:  800 },
    Advertising:       { weight: 50,  min:  100, max: 2000 },
    Website:           { weight: 12,  min:   50, max:  500 },
    Print:             { weight: 18,  min:   30, max:  400 },
    'Bank Fees':       { weight: 238, min:    5, max:   50 },
    'Loan Interest':   { weight: 12,  min:  300, max:  800 },
    Accounting:        { weight: 18,  min:  200, max: 1500 },
  };
  for (const [parentName, subs] of Object.entries(expenseTree)) {
    let parent = await prisma.category.findFirst({ where: { name: parentName, kind: 'EXPENSE', parentId: null } });
    if (!parent) {
      parent = await prisma.category.create({
        data: { name: parentName, kind: 'EXPENSE', isActive: true, sortOrder: 100 },
      });
    }
    for (const subName of subs) {
      let sub = await prisma.category.findFirst({ where: { name: subName, kind: 'EXPENSE', parentId: parent.id } });
      if (!sub) {
        sub = await prisma.category.create({
          data: { name: subName, kind: 'EXPENSE', isActive: true, sortOrder: 100, parentId: parent.id },
        });
      }
      expenseLeaves.push({ id: sub.id, name: subName, parentName, ...leafTuning[subName] });
    }
  }
  console.log(`  expense leaves: ${expenseLeaves.length}`);

  // ── 1000 expense transactions, scaled to exactly $250,000 ─────────────────
  console.log('  generating 1000 expense transactions...');
  const expenseTxns = [];
  for (let i = 0; i < 1000; i++) {
    const leaf = weightedPick(expenseLeaves, (l) => l.weight);
    const amt = randomAmt(leaf.min, leaf.max);
    expenseTxns.push({
      id: randomUUID(),
      accountId: pick(accounts).id,
      date: randomDate(FY_START, FY_END),
      amount: amt,                  // raw, will scale & negate below
      description: `${leaf.name} - txn ${i + 1}`,
      categoryId: leaf.id,
      importHash: `seed-cf-exp-${i}-${randomUUID()}`,
    });
  }
  // Scale to $250k.
  const expSum = expenseTxns.reduce((a, t) => a + t.amount, 0);
  const expScale = 250000 / expSum;
  for (const t of expenseTxns) {
    t.amount = Math.round(t.amount * expScale * 100) / 100;
  }
  // Adjust first row for rounding drift.
  const expFinal = expenseTxns.reduce((a, t) => a + t.amount, 0);
  expenseTxns[0].amount = Math.round((expenseTxns[0].amount + (250000 - expFinal)) * 100) / 100;
  // Convert to negative (expense convention).
  for (const t of expenseTxns) t.amount = -t.amount;

  // Insert in chunks.
  for (let i = 0; i < expenseTxns.length; i += 250) {
    await prisma.transaction.createMany({ data: expenseTxns.slice(i, i + 250) });
  }

  // ── Investment income: 4 quarterly @ $25k = $100k ────────────────────────
  const investDates = ['2025-09-30', '2025-12-31', '2026-03-31', '2026-06-01'];
  const investTxns = investDates.map((d, i) => ({
    id: randomUUID(),
    accountId: accounts[4].id, // ING Investments
    date: new Date(d),
    amount: 25000,
    description: `Quarterly dividend distribution Q${i + 1}`,
    categoryId: incomeCats['Investments'].id,
    importHash: `seed-cf-inv-${i}-${randomUUID()}`,
  }));
  await prisma.transaction.createMany({ data: investTxns });

  // ── Salary income: 26 fortnightly = $80k ─────────────────────────────────
  const salaryAmt = Math.round((80000 / 26) * 100) / 100; // 3076.92
  const salaryTxns = [];
  for (let i = 0; i < 26; i++) {
    const d = new Date(FY_START);
    d.setDate(d.getDate() + i * 14);
    if (d > FY_END) break;
    salaryTxns.push({
      id: randomUUID(),
      accountId: accounts[1].id, // Westpac Savings
      date: d,
      amount: salaryAmt,
      description: `Salary deposit - pay period ${i + 1}`,
      categoryId: incomeCats['Salary'].id,
      importHash: `seed-cf-sal-${i}-${randomUUID()}`,
    });
  }
  // Tiny drift from rounding — adjust last row.
  const salaryDrift = 80000 - salaryTxns.reduce((a, t) => a + t.amount, 0);
  salaryTxns[salaryTxns.length - 1].amount = Math.round((salaryTxns[salaryTxns.length - 1].amount + salaryDrift) * 100) / 100;
  await prisma.transaction.createMany({ data: salaryTxns });
  console.log(`  other income txns: ${investTxns.length + salaryTxns.length}`);

  // ── 300 customer payments totalling $500k via invoices + allocations ─────
  console.log('  generating 300 invoices + allocations...');
  const paymentAmounts = [];
  for (let i = 0; i < 300; i++) {
    const tier = Math.random();
    let amt;
    if (tier < 0.5) amt = randomAmt(500, 2000);
    else if (tier < 0.85) amt = randomAmt(2000, 5000);
    else amt = randomAmt(5000, 10000);
    paymentAmounts.push(amt);
  }
  const paySum = paymentAmounts.reduce((a, b) => a + b, 0);
  const payScale = 500000 / paySum;
  for (let i = 0; i < paymentAmounts.length; i++) {
    paymentAmounts[i] = Math.round(paymentAmounts[i] * payScale * 100) / 100;
  }
  paymentAmounts[0] = Math.round((paymentAmounts[0] + (500000 - paymentAmounts.reduce((a, b) => a + b, 0))) * 100) / 100;

  const maxInv = await prisma.invoice.findFirst({ orderBy: { invoiceNumber: 'desc' } });
  let nextInvoiceNumber = (maxInv?.invoiceNumber ?? 1000) + 1;

  const invoicesData = [];
  const lineItemsData = [];
  const paymentTxnsData = [];
  const allocsData = [];

  for (let i = 0; i < 300; i++) {
    const amt = paymentAmounts[i];
    const customer = pick(customers);
    const invoiceDate = randomDate(FY_START, new Date(Math.min(FY_END.getTime(), Date.now() - 7 * 86400000)));
    const paymentDate = new Date(Math.min(
      invoiceDate.getTime() + Math.floor(1 + Math.random() * 28) * 86400000,
      FY_END.getTime(),
    ));
    const invoiceId = randomUUID();
    const txnId = randomUUID();
    const invoiceNumber = nextInvoiceNumber++;

    invoicesData.push({
      id: invoiceId,
      invoiceNumber,
      invoiceDate,
      dueDate: new Date(invoiceDate.getTime() + 28 * 86400000),
      customerId: customer.id,
      billingCompanyId: customer.billingCompanyId,
      status: 'PAID',
      subtotal: amt,
      taxAmount: 0,
      totalAmount: amt,
      amountPaid: amt,
      amountOutstanding: 0,
    });
    lineItemsData.push({
      id: randomUUID(),
      invoiceId,
      description: 'Professional services',
      quantity: 1,
      unitPrice: amt,
      lineAmount: amt,
      taxAmount: 0,
      position: 0,
    });
    paymentTxnsData.push({
      id: txnId,
      accountId: pick(accounts).id,
      date: paymentDate,
      amount: amt,
      description: `Payment from ${customer.name} INV-${invoiceNumber}`,
      importHash: `seed-cf-pay-${i}-${randomUUID()}`,
    });
    allocsData.push({
      id: randomUUID(),
      transactionId: txnId,
      invoiceId,
      amount: amt,
    });
  }
  for (let i = 0; i < invoicesData.length;     i += 200) await prisma.invoice.createMany({ data: invoicesData.slice(i, i + 200) });
  for (let i = 0; i < lineItemsData.length;    i += 200) await prisma.invoiceItem.createMany({ data: lineItemsData.slice(i, i + 200) });
  for (let i = 0; i < paymentTxnsData.length;  i += 200) await prisma.transaction.createMany({ data: paymentTxnsData.slice(i, i + 200) });
  for (let i = 0; i < allocsData.length;       i += 200) await prisma.allocation.createMany({ data: allocsData.slice(i, i + 200) });

  console.log(`  invoices/payments/allocations: ${invoicesData.length}`);
  console.log('seed-cashflow-demo: done');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

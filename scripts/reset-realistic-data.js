// One-shot reset script. Wipes old test/billing/customer/invoice data and
// reseeds with 40 cleaning-company billing entities + 150 customers + 160
// invoices with realistic Australian cleaning-services data. Keeps the two
// reference rows the user already curated (Office Cleaners Maddington
// creationOrder=13 and customer DCW Enterprises customerNumber=1007).
//
// Run: docker cp this file into the container, then `docker exec ... node /tmp/reset-realistic-data.js`.

const { PrismaClient } = require("@prisma/client");
const { randomBytes } = require("crypto");
const prisma = new PrismaClient();

// Deterministic PRNG so repeat runs (locally) produce stable distributions.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260521);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const intBetween = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Australian-flavoured ABN. Format "XX XXX XXX XXX" — content is fake but
// shape matches what an operator would expect to see on screen.
function fakeAbn() {
  let s = "";
  for (let i = 0; i < 11; i++) s += Math.floor(rand() * 10);
  return `${s.slice(0, 2)} ${s.slice(2, 5)} ${s.slice(5, 8)} ${s.slice(8, 11)}`;
}

// Slugify a company name to use as an email host. Strips "&", "'", "Pty Ltd"
// suffixes, removes spaces, lowercases.
function slug(name) {
  return name
    .toLowerCase()
    .replace(/\s+pty\s+ltd\b/g, "")
    .replace(/[&']/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

// 40 hand-curated Australian cleaning companies with realistic locations
// covering every state + territory. Suburbs are real and the postcodes match
// their state's range, but business identities are fabricated.
const BILLING_DEFS = [
  { name: "Pristine Office Cleaners",         suburb: "Surry Hills",      state: "NSW", postcode: "2010", bsb: "062-001", acc: "1100 2345" },
  { name: "Sparkle Commercial Cleaning",      suburb: "Richmond",         state: "VIC", postcode: "3121", bsb: "063-100", acc: "2233 4456" },
  { name: "Crystal Clear Services",           suburb: "Fortitude Valley", state: "QLD", postcode: "4006", bsb: "064-200", acc: "3344 5678" },
  { name: "Diamond Cleaning Co",              suburb: "West Perth",       state: "WA",  postcode: "6005", bsb: "066-001", acc: "4455 6789" },
  { name: "Apex Janitorial Services",         suburb: "North Adelaide",   state: "SA",  postcode: "5006", bsb: "065-001", acc: "5566 7890" },
  { name: "EcoGreen Cleaning Solutions",      suburb: "Sandy Bay",        state: "TAS", postcode: "7005", bsb: "067-001", acc: "6677 8901" },
  { name: "Spotless Pro Cleaning",            suburb: "Braddon",          state: "ACT", postcode: "2612", bsb: "062-002", acc: "7788 9012" },
  { name: "Allied Cleaning Group",            suburb: "Newcastle West",   state: "NSW", postcode: "2302", bsb: "062-003", acc: "8899 0123" },
  { name: "MaxxClean Services",               suburb: "Wollongong",       state: "NSW", postcode: "2500", bsb: "062-004", acc: "9900 1234" },
  { name: "Total Care Cleaners",              suburb: "Southport",        state: "QLD", postcode: "4215", bsb: "064-002", acc: "1010 2233" },
  { name: "Premium Cleaning Co",              suburb: "Maroochydore",     state: "QLD", postcode: "4558", bsb: "064-003", acc: "1111 2244" },
  { name: "Bright and Shine Cleaning",        suburb: "Geelong",          state: "VIC", postcode: "3220", bsb: "063-200", acc: "1212 2255" },
  { name: "Elite Office Care",                suburb: "Ballarat Central", state: "VIC", postcode: "3350", bsb: "063-300", acc: "1313 2266" },
  { name: "SwiftBroom Commercial",            suburb: "Cairns City",      state: "QLD", postcode: "4870", bsb: "064-004", acc: "1414 2277" },
  { name: "Aurora Cleaning Services",         suburb: "Townsville",       state: "QLD", postcode: "4810", bsb: "064-005", acc: "1515 2288" },
  { name: "CleanMate Australia",              suburb: "Bunbury",          state: "WA",  postcode: "6230", bsb: "066-002", acc: "1616 2299" },
  { name: "Polaris Janitorial",               suburb: "Fremantle",        state: "WA",  postcode: "6160", bsb: "066-003", acc: "1717 2300" },
  { name: "Fresh Start Cleaning",             suburb: "Joondalup",        state: "WA",  postcode: "6027", bsb: "066-004", acc: "1818 2311" },
  { name: "CleanCorp Solutions",              suburb: "Mandurah",         state: "WA",  postcode: "6210", bsb: "066-005", acc: "1919 2322" },
  { name: "Blue Sky Cleaners",                suburb: "Rockingham",       state: "WA",  postcode: "6168", bsb: "066-006", acc: "2020 2333" },
  { name: "Coast2Coast Cleaning",             suburb: "Albany",           state: "WA",  postcode: "6330", bsb: "066-007", acc: "2121 2344" },
  { name: "Sunrise Office Cleaning",          suburb: "Geraldton",        state: "WA",  postcode: "6530", bsb: "066-008", acc: "2222 2355" },
  { name: "NeatNook Commercial",              suburb: "Kalgoorlie",       state: "WA",  postcode: "6430", bsb: "066-009", acc: "2323 2366" },
  { name: "ShineRight Cleaners",              suburb: "Darwin",           state: "NT",  postcode: "0800", bsb: "065-002", acc: "2424 2377" },
  { name: "GreenLeaf Cleaning Services",      suburb: "Launceston",       state: "TAS", postcode: "7250", bsb: "067-002", acc: "2525 2388" },
  { name: "CleanWave Commercial",             suburb: "Toowoomba City",   state: "QLD", postcode: "4350", bsb: "064-006", acc: "2626 2399" },
  { name: "Forte Cleaning Solutions",         suburb: "Mackay",           state: "QLD", postcode: "4740", bsb: "064-007", acc: "2727 2400" },
  { name: "Mosaic Office Cleaners",           suburb: "Bendigo",          state: "VIC", postcode: "3550", bsb: "063-400", acc: "2828 2411" },
  { name: "Verde Eco Cleaners",               suburb: "Shepparton",       state: "VIC", postcode: "3630", bsb: "063-500", acc: "2929 2422" },
  { name: "Stratus Cleaning Group",           suburb: "Mildura",          state: "VIC", postcode: "3500", bsb: "063-600", acc: "3030 2433" },
  { name: "Tidy Pro Services",                suburb: "Mount Gambier",    state: "SA",  postcode: "5290", bsb: "065-003", acc: "3131 2444" },
  { name: "ClearGlass Window and Office",     suburb: "Whyalla",          state: "SA",  postcode: "5600", bsb: "065-004", acc: "3232 2455" },
  { name: "UrbanCare Cleaning Co",            suburb: "Port Macquarie",   state: "NSW", postcode: "2444", bsb: "062-005", acc: "3333 2466" },
  { name: "AcePoint Janitorial",              suburb: "Tamworth",         state: "NSW", postcode: "2340", bsb: "062-006", acc: "3434 2477" },
  { name: "PristineEdge Cleaning",            suburb: "Orange",           state: "NSW", postcode: "2800", bsb: "062-007", acc: "3535 2488" },
  { name: "Westside Office Cleaners",         suburb: "Penrith",          state: "NSW", postcode: "2750", bsb: "062-008", acc: "3636 2499" },
  { name: "Northshore Cleaning Co",           suburb: "Chatswood",        state: "NSW", postcode: "2067", bsb: "062-009", acc: "3737 2500" },
  { name: "Riverbank Cleaning Services",      suburb: "Parramatta",       state: "NSW", postcode: "2150", bsb: "062-010", acc: "3838 2511" },
  { name: "Skyline Janitorial Group",         suburb: "Liverpool",        state: "NSW", postcode: "2170", bsb: "062-011", acc: "3939 2522" },
  { name: "Harbour Cleaning Solutions",       suburb: "Manly",            state: "NSW", postcode: "2095", bsb: "062-012", acc: "4040 2533" },
];

function billingCompanyPaymentDetails(name, bsb, acc) {
  return `Commonwealth Bank<div>${name}<br><div>BSB: ${bsb}</div><div>ACC: ${acc}</div></div>`;
}

function billingCompanyAddress(suburb, state, postcode) {
  const streetNum = intBetween(10, 350);
  const street = pick(["Industrial Way", "Commerce Drive", "Beach Road", "Business Park", "Main Street", "King Street", "Queen Street", "George Street", "Victoria Avenue", "Pacific Highway"]);
  return `Unit ${intBetween(1, 12)}/${streetNum} ${street}\n${suburb} ${state} ${postcode}`;
}

// Customer-name generator: { prefix } + { type-suffix } pairs. 25 × 6 = 150
// unique names, each with a matching email local-part convention.
const CUSTOMER_PREFIXES = [
  "North Shore", "Westgate", "Bayview", "Parkside", "Highland",
  "Riverside", "Central City", "Pacific", "Coastal", "Hillcrest",
  "Maple Grove", "Cedar Park", "Sunset Bay", "Sunrise Plaza", "Forest Hill",
  "Heritage", "Crown Point", "Royal Oak", "Meadowbrook", "Skyline",
  "Lakeside", "Greenfield", "Bluestone", "Goldfield", "Silverleaf",
];
const CUSTOMER_TYPES = [
  { suffix: "Strata Management", email: "admin", terms: "IN_28_DAYS" },
  { suffix: "Real Estate Group", email: "office", terms: "IN_28_DAYS" },
  { suffix: "Medical Centre",    email: "reception", terms: "IN_15_DAYS" },
  { suffix: "Primary School",    email: "accounts", terms: "IN_28_DAYS" },
  { suffix: "Early Learning",    email: "admin", terms: "IN_28_DAYS" },
  { suffix: "Legal Partners",    email: "billing", terms: "IN_28_DAYS" },
];
function buildCustomers() {
  const list = [];
  let n = 0;
  for (const p of CUSTOMER_PREFIXES) {
    for (const t of CUSTOMER_TYPES) {
      n++;
      const name = `${p} ${t.suffix}`;
      const host = slug(name);
      const hasSecondary = n % 4 === 0; // 25% of customers get a CC email
      list.push({
        name,
        billingEmail1: `${t.email}@${host}.com.au`,
        billingEmail2: hasSecondary ? `manager@${host}.com.au` : null,
        paymentTerms: t.terms,
        address: customerAddress(),
      });
    }
  }
  return list;
}
function customerAddress() {
  const num = intBetween(1, 450);
  const street = pick(["Smith Street", "Wattle Avenue", "Banksia Road", "Eucalyptus Drive", "Sturt Highway", "Hay Street", "Murray Street", "Adelaide Terrace", "St Georges Terrace", "Collins Street", "Elizabeth Street", "Bourke Street", "Pitt Street", "Macquarie Street", "Albany Highway", "Stirling Highway"]);
  const suburb = pick(["Subiaco", "Cottesloe", "Claremont", "Glebe", "Newtown", "Brunswick", "Carlton", "Fitzroy", "South Yarra", "St Kilda", "Spring Hill", "New Farm", "Indooroopilly", "Norwood", "Glenelg", "Battery Point", "Sandringham", "Mosman", "Bondi", "Cronulla"]);
  const state = pick(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT"]);
  const stateRanges = { NSW: [2000, 2999], VIC: [3000, 3999], QLD: [4000, 4999], WA: [6000, 6999], SA: [5000, 5999], TAS: [7000, 7999], ACT: [2600, 2618] };
  const [lo, hi] = stateRanges[state];
  const postcode = String(intBetween(lo, hi)).padStart(4, "0");
  return `Suite ${intBetween(1, 25)}, ${num} ${street}\n${suburb} ${state} ${postcode}`;
}

// 22 realistic cleaning-service line-item descriptions paired with a price
// band. The line-item generator picks one + a quantity, computing a tidy
// unit price within the band.
const SERVICE_CATALOG = [
  { desc: "Weekly office cleaning service - 4 weeks", lo: 800, hi: 2400 },
  { desc: "Daily office cleaning - 5 days/week", lo: 1200, hi: 3500 },
  { desc: "Carpet shampoo and steam clean", lo: 280, hi: 720 },
  { desc: "Window cleaning - exterior", lo: 220, hi: 650 },
  { desc: "Window cleaning - interior and exterior", lo: 380, hi: 950 },
  { desc: "Bathroom deep clean and sanitisation", lo: 180, hi: 480 },
  { desc: "Strip and seal vinyl floors", lo: 450, hi: 1450 },
  { desc: "End-of-lease clean", lo: 380, hi: 880 },
  { desc: "Construction clean - post-build", lo: 650, hi: 2200 },
  { desc: "Pressure washing - driveway and pathway", lo: 280, hi: 620 },
  { desc: "Glass partition and entrance door clean", lo: 140, hi: 360 },
  { desc: "Kitchen and pantry detail clean", lo: 160, hi: 420 },
  { desc: "Disinfection service - whole premises", lo: 320, hi: 980 },
  { desc: "Floor polishing - showroom", lo: 380, hi: 1100 },
  { desc: "Steam cleaning - upholstery and chairs", lo: 220, hi: 580 },
  { desc: "Skirting boards, door frames and fixtures", lo: 140, hi: 320 },
  { desc: "Tile and grout deep clean", lo: 240, hi: 680 },
  { desc: "Light fixtures, fans and high-dust clean", lo: 180, hi: 420 },
  { desc: "High-pressure wash - external walls", lo: 480, hi: 1450 },
  { desc: "Grounds tidy, edging and rubbish removal", lo: 220, hi: 540 },
  { desc: "Spring deep clean - common areas", lo: 380, hi: 1100 },
  { desc: "Monthly office cleaning service", lo: 320, hi: 880 },
];
function lineItem(position) {
  const s = pick(SERVICE_CATALOG);
  const unit = Math.round(intBetween(s.lo, s.hi) / 10) * 10; // tidy to $10
  const quantity = 1;
  const lineAmount = unit * quantity;
  const taxAmount = +(lineAmount * 0.1).toFixed(2);
  return {
    description: s.desc,
    quantity,
    unitPrice: unit,
    lineAmount,
    taxName: "GST",
    taxRate: 10,
    taxAmount,
    position,
  };
}

async function wipe() {
  console.log("[wipe] deleting invoices + recurring rules + non-keeper customers and companies");

  // InvoiceItems cascade with their parent Invoice.
  await prisma.invoice.deleteMany({});

  // Recurring rules reference customers/companies we're about to remove.
  await prisma.recurringRuleLineItem.deleteMany({});
  await prisma.recurringRule.deleteMany({});

  // Customers: keep only DCW Enterprises (customerNumber 1007).
  await prisma.customer.deleteMany({ where: { customerNumber: { not: 1007 } } });

  // BillingCompanies: keep only Office Cleaners Maddington (creationOrder 13).
  await prisma.billingCompany.deleteMany({ where: { creationOrder: { not: 13 } } });

  const counts = {
    billing: await prisma.billingCompany.count(),
    customer: await prisma.customer.count(),
    invoice: await prisma.invoice.count(),
  };
  console.log("[wipe] post-wipe counts:", counts);
}

async function insertBillingCompanies() {
  console.log(`[billing] inserting ${BILLING_DEFS.length} new companies (creationOrder 14..${13 + BILLING_DEFS.length})`);
  const invoiceTemplates = await prisma.invoiceTemplate.findMany({ orderBy: { displayOrder: "asc" } });
  const emailTemplates = await prisma.emailTemplate.findMany({ orderBy: { displayOrder: "asc" } });
  if (invoiceTemplates.length !== 10 || emailTemplates.length !== 10) {
    throw new Error("expected 10 invoice + 10 email templates seeded");
  }
  const created = [];
  let creationOrder = 14;
  for (const def of BILLING_DEFS) {
    const slot = ((creationOrder - 1) % 10); // 0..9
    const c = await prisma.billingCompany.create({
      data: {
        name: def.name,
        abn: fakeAbn(),
        address: billingCompanyAddress(def.suburb, def.state, def.postcode),
        paymentDetails: billingCompanyPaymentDetails(def.name, def.bsb, def.acc),
        accountsEmail: `accounts@${slug(def.name)}.com.au`,
        invoiceBcc: `bcc@${slug(def.name)}.com.au`,
        notes: `Cleaning operations — ${def.suburb} ${def.state}.`,
        creationOrder,
        invoiceTemplateId: invoiceTemplates[slot].id,
        emailTemplateId: emailTemplates[slot].id,
        isActive: true,
      },
    });
    created.push(c);
    creationOrder++;
  }
  return created;
}

async function insertCustomers(companies) {
  console.log("[customer] inserting 150 new customers");
  const customers = buildCustomers();
  const created = [];
  let n = 1008; // DCW is 1007
  for (let i = 0; i < customers.length; i++) {
    const def = customers[i];
    const company = companies[i % companies.length];
    const c = await prisma.customer.create({
      data: {
        name: def.name,
        customerNumber: n++,
        billingEmail1: def.billingEmail1,
        billingEmail2: def.billingEmail2,
        billingCompanyId: company.id,
        paymentTerms: def.paymentTerms,
        address: def.address,
        isActive: true,
      },
    });
    created.push(c);
  }
  return created;
}

// 160 invoices, line-item-count distribution: 4 items × 40, 3 × 24, 2 × 16, 1 × 80.
function invoiceLineItemCounts() {
  const counts = [];
  for (let i = 0; i < 40; i++) counts.push(4);
  for (let i = 0; i < 24; i++) counts.push(3);
  for (let i = 0; i < 16; i++) counts.push(2);
  for (let i = 0; i < 80; i++) counts.push(1);
  return shuffle(counts);
}

// Date generator: spread invoices across the last 6 months so the dashboard
// has a believable monthly distribution.
function invoiceDateAndDue() {
  const daysAgo = intBetween(0, 180);
  const invoiceDate = new Date();
  invoiceDate.setDate(invoiceDate.getDate() - daysAgo);
  invoiceDate.setHours(9, 0, 0, 0);
  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + 28); // matches IN_28_DAYS terms
  return { invoiceDate, dueDate };
}

async function insertInvoices(customers, companies) {
  console.log("[invoice] inserting 160 invoices");
  const customerById = new Map(customers.map((c) => [c.id, c]));
  // Include the kept-over DCW Enterprises customer (1007).
  const dcw = await prisma.customer.findUnique({ where: { customerNumber: 1007 } });
  if (dcw) customerById.set(dcw.id, dcw);
  const allCustomers = Array.from(customerById.values());
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const ocm = await prisma.billingCompany.findUnique({ where: { creationOrder: 13 } });
  if (ocm) companyById.set(ocm.id, ocm);

  const lineCounts = invoiceLineItemCounts();
  const invoices = [];
  let invoiceNumber = 1000;

  for (let i = 0; i < 160; i++) {
    // Pick a customer; if that customer has a billingCompanyId use it as the
    // invoice's billing company so the invoice consistently sits under the
    // customer's normal trading entity.
    const customer = pick(allCustomers);
    let company;
    if (customer.billingCompanyId && companyById.has(customer.billingCompanyId)) {
      company = companyById.get(customer.billingCompanyId);
    } else {
      company = pick(companies);
    }

    const nItems = lineCounts[i];
    const lineItems = Array.from({ length: nItems }, (_, k) => lineItem(k));
    const subtotal = lineItems.reduce((s, li) => s + li.lineAmount, 0);
    const taxAmount = +lineItems.reduce((s, li) => s + li.taxAmount, 0).toFixed(2);
    const totalAmount = +(subtotal + taxAmount).toFixed(2);
    const { invoiceDate, dueDate } = invoiceDateAndDue();

    const inv = await prisma.invoice.create({
      data: {
        invoiceNumber: invoiceNumber++,
        invoiceDate,
        dueDate,
        status: "DRAFT", // every invoice starts as DRAFT — status pass after this block re-allocates
        customerId: customer.id,
        billingCompanyId: company.id,
        invoiceTemplateId: company.invoiceTemplateId,
        emailTemplateId: company.emailTemplateId,
        subtotal,
        taxAmount,
        totalAmount,
        terms: "Net 28",
        lineItems: { create: lineItems },
      },
    });
    invoices.push(inv);
  }
  console.log(`[invoice] inserted ${invoices.length} invoices (#${invoices[0].invoiceNumber}..#${invoices[invoices.length-1].invoiceNumber})`);
  return invoices;
}

// Distribute statuses: first pick 10 customers to become inactive — set every
// invoice they own to PAID. Then distribute the remaining 160 - (forced-PAID)
// invoices to satisfy the target counts (top up to 32 PAID, 32 SENT, 32
// VIEWED, 5 VOID, rest DRAFT). Returns { paidCustomerIds }.
async function distributeStatuses(invoices, customers) {
  console.log("[status] distributing statuses across 160 invoices");
  // Group invoices by customerId.
  const byCustomer = new Map();
  for (const inv of invoices) {
    if (!inv.customerId) continue;
    const list = byCustomer.get(inv.customerId) || [];
    list.push(inv);
    byCustomer.set(inv.customerId, list);
  }

  // Pick 10 candidate customers who have ≥1 invoice. Sort by fewest invoices
  // first so we don't burn the whole PAID budget on a single high-volume
  // customer; that keeps the residual top-up positive.
  const candidates = customers
    .filter((c) => (byCustomer.get(c.id) || []).length > 0)
    .map((c) => ({ id: c.id, invs: byCustomer.get(c.id) }))
    .sort((a, b) => a.invs.length - b.invs.length);
  const inactiveCustomerIds = candidates.slice(0, 10).map((c) => c.id);
  const forcedPaidInvoiceIds = inactiveCustomerIds.flatMap((id) => byCustomer.get(id).map((i) => i.id));
  console.log(`[status] forcing ${forcedPaidInvoiceIds.length} invoices to PAID (for 10 soon-to-be-inactive customers)`);

  // All remaining invoices.
  const remaining = invoices.filter((i) => !forcedPaidInvoiceIds.includes(i.id));
  const shuffled = shuffle(remaining);

  const targets = { PAID: 32, SENT: 32, VIEWED: 32, VOID: 5 };
  let remainingPaidBudget = Math.max(0, targets.PAID - forcedPaidInvoiceIds.length);
  const assignments = new Map(); // invoiceId → status
  for (const id of forcedPaidInvoiceIds) assignments.set(id, "PAID");

  let cursor = 0;
  for (let i = 0; i < remainingPaidBudget && cursor < shuffled.length; i++, cursor++) assignments.set(shuffled[cursor].id, "PAID");
  for (let i = 0; i < targets.SENT && cursor < shuffled.length; i++, cursor++) assignments.set(shuffled[cursor].id, "SENT");
  for (let i = 0; i < targets.VIEWED && cursor < shuffled.length; i++, cursor++) assignments.set(shuffled[cursor].id, "VIEWED");
  for (let i = 0; i < targets.VOID && cursor < shuffled.length; i++, cursor++) assignments.set(shuffled[cursor].id, "VOID");
  while (cursor < shuffled.length) { assignments.set(shuffled[cursor].id, "DRAFT"); cursor++; }

  // Apply transitions. SENT + VIEWED need a publicToken (the customer would
  // not have a view link otherwise). VIEWED additionally stamps viewedAt.
  // PAID had been SENT before payment, so it gets a token too. VOID gets a
  // reason + voidedAt. DRAFT stays bare.
  let i = 0;
  for (const [invoiceId, status] of assignments.entries()) {
    const data = { status };
    if (status === "SENT" || status === "VIEWED" || status === "PAID") {
      data.publicToken = randomBytes(32).toString("base64url");
      data.publicTokenIssuedAt = new Date();
      data.sendAttempts = 1;
      data.lastSendAt = new Date();
    }
    if (status === "VIEWED") {
      data.viewedAt = new Date();
    }
    if (status === "VOID") {
      data.voidReason = pick([
        "Duplicate invoice — superseded by replacement",
        "Customer disputed and a credit was issued",
        "Issued in error against the wrong customer",
        "Service was not delivered as scheduled",
        "Replaced with a corrected invoice after price change",
      ]);
      data.voidedAt = new Date();
    }
    await prisma.invoice.update({ where: { id: invoiceId }, data });
    i++;
    if (i % 40 === 0) console.log(`[status] applied ${i}/160 transitions`);
  }

  // Report final counts.
  const finalCounts = await prisma.invoice.groupBy({ by: ["status"], _count: { _all: true } });
  console.log("[status] final status distribution:", finalCounts.map((r) => `${r.status}=${r._count._all}`).join(", "));

  return { inactiveCustomerIds };
}

async function deactivate(inactiveCustomerIds, companies) {
  console.log("[deactivate] marking 10 customers inactive (their invoices are all PAID)");
  await prisma.customer.updateMany({
    where: { id: { in: inactiveCustomerIds } },
    data: { isActive: false },
  });

  // Pick 5 billing companies to deactivate. Spread across creationOrders to
  // exercise the template-rotation visualisation.
  const picks = shuffle(companies).slice(0, 5);
  console.log(`[deactivate] marking 5 billing companies inactive: ${picks.map((p) => p.name).join(", ")}`);
  for (const c of picks) {
    await prisma.billingCompany.update({
      where: { id: c.id },
      data: { isActive: false, deactivatedAt: new Date() },
    });
  }
}

async function main() {
  console.log("== reset-realistic-data starting ==");
  await wipe();
  const newCompanies = await insertBillingCompanies();
  const newCustomers = await insertCustomers(newCompanies);
  const invoices = await insertInvoices(newCustomers, newCompanies);
  const { inactiveCustomerIds } = await distributeStatuses(invoices, newCustomers);
  await deactivate(inactiveCustomerIds, newCompanies);

  const summary = {
    billingCompanies: await prisma.billingCompany.count(),
    billingCompaniesInactive: await prisma.billingCompany.count({ where: { isActive: false } }),
    customers: await prisma.customer.count(),
    customersInactive: await prisma.customer.count({ where: { isActive: false } }),
    invoices: await prisma.invoice.count(),
  };
  console.log("== summary ==", summary);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

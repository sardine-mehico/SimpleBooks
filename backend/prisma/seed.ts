import { PrismaClient, InvoiceStatus, PaymentTerms } from '@prisma/client';

const prisma = new PrismaClient();

// Boilerplate placeholder content used for any slot the user hasn't yet
// provided a real design for. As each real template arrives we replace one
// entry in EMAIL_TEMPLATE_SPECS below; the rotation stays end-to-end
// functional for un-filled slots until then. HTML-only — customer emails do
// not include a plain-text alternative.
const EMAIL_BODY_HTML_PLACEHOLDER =
  '<p>Hello {{customer name}},</p>' +
  '<p>Invoice <strong>{{invoice number}}</strong> from {{billing company}} is ready for you to view.</p>' +
  '<p>Invoice Date: {{invoice date}}<br/>Due Date: {{due date}}</p>' +
  '<p>{{invoice link button}}</p>' +
  '<p>If you have any questions please reply to this email.</p>' +
  '<p>Thank you,<br/>{{billing company}}</p>';

// ── Email template 1 — email-grey-1 ─────────────────────────────────────────
// Bulletproof-table layout with Outlook VML button fallback. The author's
// original `{{ $invoiceUrl }}` placeholders are replaced with our canonical
// `{{invoice link}}` token so the substituter wires the public URL in.
const EMAIL_GREY_1_HTML = `<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <title>New Invoice</title>

  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->

  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { text-decoration: none; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; max-width: 100% !important; }
      .px-mobile { padding-left: 24px !important; padding-right: 24px !important; }
      .btn-mobile { width: 80% !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, Helvetica, sans-serif;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #f4f4f4;">
    You have received a new invoice from {{billing company}}. View it below.
  </div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f4;">
    <tbody><tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" class="container" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border: 1px solid #e5e7eb;">
          <tbody><tr>
            <td align="center" style="background-color: #f3f4f6; padding: 18px 24px; border-bottom: 1px solid #e5e7eb; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; color: #9ca3af; letter-spacing: 0.2px;">
              {{billing company}}
            </td>
          </tr>
          <tr>
            <td class="px-mobile" align="center" style="padding: 44px 48px 20px 48px; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 24px; color: #111827; font-weight: bold;">
              You have received new invoice from {{billing company}}<br>
              It can be viewed and downloaded using the button below.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 16px 24px 36px 24px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{invoice link}}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="8%" stroke="f" fillcolor="#4d5970">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">View Invoice</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="{{invoice link}}" target="_blank" class="btn-mobile" style="background-color: #4d5970; border-radius: 4px; color: #ffffff; display: inline-block; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; line-height: 48px; text-align: center; text-decoration: none; width: 200px; -webkit-text-size-adjust: none; mso-hide: all;">View Invoice</a>
              <!--<![endif]-->
            </td>
          </tr>
          <tr>
            <td class="px-mobile" style="padding: 0 48px 44px 48px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 22px; color: #111827;">
              <strong>Please contact us if you have any questions.</strong><br>
              <strong>Email:</strong>&nbsp; <a style="text-decoration: none;">{{accounts email}}</a>
            </td>
          </tr>
          <tr>
            <td align="center" style="background-color: #f3f4f6; padding: 18px 24px; border-top: 1px solid #e5e7eb; font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #9ca3af;">
              Thank you!
            </td>
          </tr>
        </tbody></table>
      </td>
    </tr>
  </tbody></table>
</body></html>`;

// Slot 2..N templates are forks of EMAIL_GREY_1_HTML with the surface palette
// swapped to match the matching PDF design. Layout is identical (bulletproof
// table + Outlook VML button + mobile responsive) — only colors change.
function recolor(palette: {
  outerBg: string;
  barBg: string;
  barText: string;
  buttonBg: string;
}): string {
  return EMAIL_GREY_1_HTML
    .replace(/background-color: #f4f4f4/g, `background-color: ${palette.outerBg}`)
    .replace(/color: #f4f4f4/g, `color: ${palette.outerBg}`)
    .replace(/background-color: #f3f4f6/g, `background-color: ${palette.barBg}`)
    .replace(/color: #9ca3af/g, `color: ${palette.barText}`)
    .replace(/background-color: #4d5970/g, `background-color: ${palette.buttonBg}`)
    .replace(/fillcolor="#4d5970"/g, `fillcolor="${palette.buttonBg}"`);
}

// One spec per templateKey slot (1..10). Real designs land here as the user
// provides them; until a slot has a real entry the boilerplate placeholder
// is used so the rotation still works end-to-end. The `templateKey` and
// `displayOrder` are derived from the array index at create time. HTML body
// only — there is no plain-text alternative.
export type EmailTemplateSpec = { name: string; subject: string; body: string };
export const EMAIL_TEMPLATE_SPECS: EmailTemplateSpec[] = [
  // Slot 1 — email-grey-1. Already a grey/slate palette in the source HTML.
  {
    name: 'email-grey-1',
    subject: 'Your invoice from {{billing company}} (Ref: {{invoice number}})',
    body: EMAIL_GREY_1_HTML,
  },
  // Slot 2 — email-orange-1 (design-2 palette: cream + rust).
  {
    name: 'email-orange-1',
    subject: 'Invoice - {{invoice number}} from {{billing company}}',
    body: recolor({
      outerBg: '#fceee5',
      barBg: '#fff1e6',
      barText: '#c4451c',
      buttonBg: '#c4451c',
    }),
  },
  // Slot 3 — email-blue-1 (design-3 palette: slate + sky-blue / navy chrome).
  {
    name: 'email-blue-1',
    subject: 'Your invoice is ready — {{invoice number}} from {{billing company}}',
    body: recolor({
      outerBg: '#F7FAFC',
      barBg: '#F7FAFC',
      barText: '#1A365D',
      buttonBg: '#3182CE',
    }),
  },
  // Slot 4 — email-green-orange. Emerald page tint + emerald chrome, with a
  // vibrant orange CTA. Pure email-side styling — the matching PDF
  // (design-4 orange-2) stays orange, so the public viewing page remains
  // orange too.
  {
    name: 'email-green-orange',
    subject: 'New invoice from {{billing company}} — {{invoice number}}',
    body: recolor({
      outerBg: '#ecfdf5',
      barBg: '#d1fae5',
      barText: '#047857',
      buttonBg: '#ea580c',
    }),
  },
  // Slot 5 — email-blue-grey-1. Cool slate chrome (matches design-5's slate
  // top band) with a sky-blue CTA that picks up design-5's `#4299e1` accent.
  {
    name: 'email-blue-grey-1',
    subject: 'Invoice from {{billing company}}',
    body: recolor({
      outerBg: '#f1f5f9',
      barBg: '#f1f5f9',
      barText: '#2d3748',
      buttonBg: '#4299e1',
    }),
  },
  // Slot 6 — email-pink-berry (design-6 palette: pale pink + berry).
  {
    name: 'email-pink-berry',
    subject: 'Tax Invoice from {{billing company}}',
    body: recolor({
      outerBg: '#f5e2e8',
      barBg: '#f5e2e8',
      barText: '#b51449',
      buttonBg: '#b51449',
    }),
  },
  // Slot 7 — email-green-pro (design-7 palette: blue-grey + teal).
  {
    name: 'email-green-pro',
    subject: 'Invoice from {{billing company}}-({{invoice number}})',
    body: recolor({
      outerBg: '#eaf1f4',
      barBg: '#eaf1f4',
      barText: '#2c8a92',
      buttonBg: '#2c8a92',
    }),
  },
  // Slot 8 — email-green-elegance (design-8 palette: light sage + sage).
  {
    name: 'email-green-elegance',
    subject: 'View your invoice {{invoice number}}-{{billing company}}',
    body: recolor({
      outerBg: '#f0f4ee',
      barBg: '#f0f4ee',
      barText: '#6b958f',
      buttonBg: '#6b958f',
    }),
  },
  // Slot 9 — email-brown-black (design-9 palette: warm beige + dark orange).
  {
    name: 'email-brown-black',
    subject: 'New Invoice (Ref:{{invoice number}}) from {{billing company}}',
    body: recolor({
      outerBg: '#f2efe9',
      barBg: '#f2efe9',
      barText: '#b3541a',
      buttonBg: '#b3541a',
    }),
  },
  // Slot 10 — email-blue-simple (design-10 palette: cool grey + navy).
  {
    name: 'email-blue-simple',
    subject: 'Your Tax Invoice {{invoice number}} from {{billing company}}',
    body: recolor({
      outerBg: '#e8e8eb',
      barBg: '#e8e8eb',
      barText: '#1849a6',
      buttonBg: '#1849a6',
    }),
  },
];

async function main() {
  // Phase 1 contract: the env admin is the single source of identity. We
  // bootstrap it here so the rest of the seed has a stable admin to reason
  // about, then the running app's AuthService reconciles the same row at
  // boot. If the env vars are missing we skip silently — the backend's
  // refuse-to-start guard will surface a clear FATAL on the next process.
  const adminUsername = process.env.ADMIN_USERNAME;
  if (adminUsername) {
    await prisma.user.upsert({
      where: { username: adminUsername },
      update: { role: 'ADMIN', isActive: true },
      create: {
        username: adminUsername,
        displayName: 'Administrator',
        role: 'ADMIN',
        passwordHash: null,
        isActive: true,
      },
    });
  }

  // Demo-data gate: any seeded billing company means we've already run; skip.
  if ((await prisma.billingCompany.count()) > 0) {
    console.log('seed: already populated, skipping');
    return;
  }

  // Templates first so the BillingCompany can be assigned at creation.
  // Names + templateKeys are deliberately generic placeholders — they
  // become the real design names when the user provides them.
  const invoiceTemplates = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      prisma.invoiceTemplate.create({
        data: {
          name: `Design ${i + 1}`,
          templateKey: `design-${i + 1}`,
          displayOrder: i + 1,
        },
      }),
    ),
  );

  const emailTemplates = await Promise.all(
    EMAIL_TEMPLATE_SPECS.map((spec, i) =>
      prisma.emailTemplate.create({
        data: {
          name: spec.name,
          templateKey: `template-${i + 1}`,
          displayOrder: i + 1,
          subject: spec.subject,
          body: spec.body,
        },
      }),
    ),
  );

  // First BillingCompany — creationOrder 1, gets displayOrder-1 templates.
  const company = await prisma.billingCompany.create({
    data: {
      name: 'AAA Test billing Company',
      abn: '00 000 000 000',
      address: '1 Example Street\nLevel 2, Suite 5\nSydney NSW 2000',
      paymentDetails:
        '<strong>BSB:</strong> 062-000<br><strong>Account:</strong> 1234 5678<br><em>Reference:</em> invoice number',
      accountsEmail: 'reallybasic@gmail.com',
      invoiceBcc: 'email.sam.dabhi+invoicebackup@gmail.com',
      creationOrder: 1,
      sendVia: 'GENERAL_SMTP',
      invoiceTemplateId: invoiceTemplates[0].id,
      emailTemplateId: emailTemplates[0].id,
    },
  });

  // Single demo customer. paymentTerms IN_28_DAYS matches the form default.
  const customer = await prisma.customer.create({
    data: {
      name: 'AAA Test Customer',
      customerNumber: 1001,
      billingEmail1: 'email.sam.dabhi@gmail.com',
      billingEmail2: 'reallybasic@gmail.com',
      billingCompanyId: company.id,
      paymentTerms: PaymentTerms.IN_28_DAYS,
      address: 'Level 3, Suite 32\n168 Havelock Street\nOsborne Park, WA-6545',
    },
  });

  // Three cleaning-business items, all $0 — placeholders that expect the
  // operator to set the real amount on the invoice each time. Descriptions
  // carry dynamic-field tokens that the invoice form substitutes on item-pick.
  const items = await Promise.all(
    [
      {
        name: 'Cleaning Service - 4 weeks',
        unitPrice: 0,
        description: 'Cleaning service for 4 weeks ({{invoice date}} to {{due date}})',
      },
      {
        name: 'Cleaning Service - Monthly',
        unitPrice: 0,
        description: 'Cleaning service for {{month-year}}',
      },
      {
        name: 'Supplies',
        unitPrice: 0,
        description: 'Supplies - ',
      },
    ].map((it) => prisma.item.create({ data: it })),
  );

  // INV-1000 — single DRAFT invoice using the 4-weeks cleaning item.
  // dueDate computed from customer.paymentTerms (IN_28_DAYS → +27 days),
  // matching the invoice form's `paymentTermsToOffsetDays()` behaviour.
  // The line description is the substituted form of the item template — what
  // the invoice form writes on item-pick (vs. the raw `{{…}}` placeholder).
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 27);
  const formatDate = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  await prisma.invoice.create({
    data: {
      invoiceNumber: 1000,
      invoiceDate: today,
      dueDate,
      status: InvoiceStatus.DRAFT,
      customerId: customer.id,
      billingCompanyId: company.id,
      invoiceTemplateId: company.invoiceTemplateId,
      emailTemplateId: company.emailTemplateId,
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      lineItems: {
        create: [
          {
            itemId: items[0].id,
            description: `Cleaning service for 4 weeks (${formatDate(today)} to ${formatDate(dueDate)})`,
            quantity: 1,
            unitPrice: 0,
            lineAmount: 0,
            taxName: 'GST',
            taxRate: 10,
            taxAmount: 0,
            position: 0,
          },
        ],
      },
    },
  });

  // Tax types catalog — AU-default GST and a passthrough "No tax" so invoice
  // line items always have a sensible dropdown source on a fresh boot.
  if ((await prisma.taxType.count()) === 0) {
    await prisma.taxType.createMany({
      data: [
        { name: 'GST', rate: 10, isActive: true },
        { name: 'No tax', rate: 0, isActive: true },
      ],
    });
  }

  // Recurring schedules catalog — only the two used by the seeded cleaning items.
  // Additional schedules can be added by the operator from /settings/recurring-schedules.
  await Promise.all([
    prisma.recurringSchedule.upsert({
      where: { name: "Every 4 weeks" },
      update: {},
      create: { name: "Every 4 weeks", intervalUnit: "WEEKS", intervalCount: 4 },
    }),
    prisma.recurringSchedule.upsert({
      where: { name: "Every month" },
      update: {},
      create: { name: "Every month", intervalUnit: "MONTHS", intervalCount: 1 },
    }),
  ]);

  // Singleton — lazy-create with sensible defaults.
  await prisma.preferences.create({
    data: {
      timezone: 'Australia/Perth',
      financialYearStart: 7, // July (Australian FY)
    },
  });

  // ── AccountType lookup (Banking Phase A) ─────────────────────────────────
  // Each type carries a short description shown on /accounts, /accounts/new,
  // and /settings/account-types so new operators understand which to pick.
  const accountTypes: Array<{ name: string; description: string }> = [
    {
      name: 'Transactions',
      description: 'Day-to-day account for income and expenses — business or personal.',
    },
    {
      name: 'Savings',
      description: 'Interest-bearing account for cash reserves; not used for day-to-day spending.',
    },
    {
      name: 'Credit Card',
      description: 'Revolving credit account. Balance is what you owe back to the issuer.',
    },
    {
      name: 'Loan',
      description: 'Debt account (mortgage, vehicle, personal loan). Balance is principal remaining.',
    },
    {
      name: 'Cash',
      description: 'Physical cash on hand or in a register.',
    },
    {
      name: 'Offset',
      description: 'Offset facility linked to a loan; balance reduces interest accrued on that loan.',
    },
  ];
  for (const t of accountTypes) {
    await prisma.accountType.upsert({
      where: { name: t.name },
      update: { description: t.description },
      create: { name: t.name, description: t.description },
    });
  }

  // ── Categories (taxonomy seeded from accounting-team CSV) ────────────────
  // Two-level taxonomy: each parent is a top-level group; children become
  // subcategories whose `parentId` points at the parent's id. Transactions
  // can only be assigned to a leaf — `TransactionsService.setCategory` rejects
  // assignment to any category with children (see CLAUDE.md). Parents with no
  // children act as leaves themselves.
  //
  // Idempotent: skipped if any category row already exists. To replace the
  // taxonomy, wipe the table or edit individual rows from `/categories`.
  const TAXONOMY: Array<{ kind: 'INCOME'|'EXPENSE'|'TRANSFER'; parent: string; children: string[] }> = [
    { kind: 'INCOME', parent: "Customer Payment", children: [] },
    { kind: 'INCOME', parent: "Refund", children: ["Merchant Refund", "Bank Fee Refund", "Insurance Refund"] },
    { kind: 'INCOME', parent: "Cashback/Rewards", children: [] },
    { kind: 'INCOME', parent: "Government Benefits", children: ["Family Tax Benefit", "Medicare Benefit"] },
    { kind: 'INCOME', parent: "Insurance Claim", children: [] },
    { kind: 'INCOME', parent: "Friends/Family", children: [] },
    { kind: 'INCOME', parent: "Interest Income", children: [] },
    { kind: 'INCOME', parent: "Other Income", children: [] },
    { kind: 'EXPENSE', parent: "Advertising", children: ["Facebook/Meta Ads", "Google Ads", "Other"] },
    { kind: 'EXPENSE', parent: "Marketing", children: ["Cold Calling", "SEO/Lead Gen", "Other"] },
    { kind: 'EXPENSE', parent: "Banking", children: ["Account Fee", "Annual Fee", "Monthly Fee", "ATM Withdrawal Fee", "Cash Advance Fee", "Credit Card Interest", "Excess Interest Charge", "International Transaction Fee", "Late Payment Fee", "Overdrawing/Dishonour Fee", "Overlimit Fee"] },
    { kind: 'EXPENSE', parent: "Cash", children: ["ATM Withdrawal"] },
    { kind: 'EXPENSE', parent: "Cleaning Services", children: ["Carpet Cleaning", "Specialist (Window/Pressure/Other)"] },
    { kind: 'EXPENSE', parent: "Cleaning Supplies", children: ["Chemicals (Perishable)", "Consumables (Non-Chemical)", "Equipment"] },
    { kind: 'EXPENSE', parent: "Workwear", children: ["Uniforms", "Shoes", "Other PPE (sunscreen, gloves, hats, bottles)"] },
    { kind: 'EXPENSE', parent: "Dining", children: ["Fast Food", "Restaurant", "Cafe", "Catering", "Market/Event Vendor"] },
    { kind: 'EXPENSE', parent: "Liquor", children: [] },
    { kind: 'EXPENSE', parent: "Donations", children: ["Religious", "Charity"] },
    { kind: 'EXPENSE', parent: "Education", children: ["Tuition Fees", "University/TAFE", "School Supplies", "Books", "Sports", "Music"] },
    { kind: 'EXPENSE', parent: "Employee", children: ["Wages", "Superannuation", "Holidays", "Other"] },
    { kind: 'EXPENSE', parent: "Subcontractor Wages", children: [] },
    { kind: 'EXPENSE', parent: "Entertainment", children: ["Cinema", "Attractions/Activities", "Streaming Subscriptions", "Events/Tickets"] },
    { kind: 'EXPENSE', parent: "Recreation", children: ["Sports/Hobby", "Gym"] },
    { kind: 'EXPENSE', parent: "Friends/Family", children: [] },
    { kind: 'EXPENSE', parent: "Fuel", children: [] },
    { kind: 'EXPENSE', parent: "General Merchandise", children: [] },
    { kind: 'EXPENSE', parent: "Government Fees", children: ["ASIC (Company Registration)", "ATO", "Council Rates/Fees", "Australian Federal Police", "Bupa Medical Visa Services", "VFS Visa Services", "Police Infringement/Fine", "Other"] },
    { kind: 'EXPENSE', parent: "Groceries", children: ["Supermarket", "Ethnic/Indian Grocery", "Bakery", "Specialty Food"] },
    { kind: 'EXPENSE', parent: "Hardware/DIY", children: [] },
    { kind: 'EXPENSE', parent: "Healthcare", children: ["Pharmacy", "Medical Centre", "Hospital", "Pathology/Radiology", "Dental", "Optical", "Physiotherapy", "Other"] },
    { kind: 'EXPENSE', parent: "Home", children: ["Furniture", "Whitegoods", "Soft Furnishings", "Plants/Garden", "Home Improvement"] },
    { kind: 'EXPENSE', parent: "Insurance", children: ["Health Insurance", "Vehicle Insurance", "Life Insurance", "Home/Contents Insurance", "Commercial Insurance", "Public Liability", "Other"] },
    { kind: 'EXPENSE', parent: "IT", children: ["Cloud Hosting", "Software Subscription", "AI Services", "Domain Names", "Hardware/Equipment"] },
    { kind: 'EXPENSE', parent: "Money Transfer", children: ["International", "Domestic"] },
    { kind: 'EXPENSE', parent: "Office Supplies", children: ["Stationery", "Printing"] },
    { kind: 'EXPENSE', parent: "Office Equipment", children: ["Furniture", "Electronics", "Shelving/Storage"] },
    { kind: 'EXPENSE', parent: "Online Payments", children: ["PayPal (Unclassified)"] },
    { kind: 'EXPENSE', parent: "Online Shopping", children: [] },
    { kind: 'EXPENSE', parent: "Personal Care", children: ["Hair/Salon/Nail/Beauty"] },
    { kind: 'EXPENSE', parent: "Pets", children: ["Pet Food", "Pet Supplies", "Vet"] },
    { kind: 'EXPENSE', parent: "Postage/Shipping", children: ["Australia Post", "Courier (DHL/FedEx/StarTrack)", "Delivery Fee (incoming)"] },
    { kind: 'EXPENSE', parent: "Professional Services", children: ["Accountant", "Bookkeeper", "Legal", "Airtasker", "Consulting"] },
    { kind: 'EXPENSE', parent: "Property Maintenance", children: ["Gutter Cleaning", "Landscaping", "Plumbing", "Electrical", "Pest Control", "Other"] },
    { kind: 'EXPENSE', parent: "Rent", children: ["Residential", "Office", "Storage"] },
    { kind: 'EXPENSE', parent: "Taxes", children: ["GST", "Personal Income Tax", "Company Income Tax", "PAYG Withholding"] },
    { kind: 'EXPENSE', parent: "Telecommunications", children: ["Mobile", "Internet", "VOIP", "Landline"] },
    { kind: 'EXPENSE', parent: "Travel", children: ["Flights", "Stays/Hotels", "Activities", "Ground Transport", "Travel Insurance", "Other"] },
    { kind: 'EXPENSE', parent: "Utilities", children: ["Electricity", "Gas", "Water"] },
    { kind: 'EXPENSE', parent: "Vehicle", children: ["Service/Parts", "Registration", "Tyres", "Toll Roads", "Parking", "Car Wash", "Roadside Assist", "Other"] },
    { kind: 'EXPENSE', parent: "Uncategorised", children: ["Other Expense"] },
    { kind: 'TRANSFER', parent: "Between Own Accounts", children: ["Credit Card Payment", "Personal Account", "Partner Account", "Business→Personal", "Personal→Business"] },
    { kind: 'TRANSFER', parent: "Loan", children: ["Loan Drawdown", "Loan Repayment", "Loan to Business"] },
  ];
  if ((await prisma.category.count()) === 0) {
    let sortOrder = 10;
    for (const entry of TAXONOMY) {
      const parent = await prisma.category.create({
        data: { name: entry.parent, kind: entry.kind, sortOrder },
      });
      sortOrder += 10;
      let childSortOrder = 10;
      for (const childName of entry.children) {
        await prisma.category.create({
          data: { name: childName, kind: entry.kind, parentId: parent.id, sortOrder: childSortOrder },
        });
        childSortOrder += 10;
      }
    }
  }

  // ── Starter Tags ─────────────────────────────────────────────────────────
  // Two seed blocks:
  //   1. Merchant catalog (kind=null) — description-fragment aliases drive
  //      the auto-alias pass that attaches a tag to every CSV-imported
  //      transaction whose description contains any alias.
  //   2. Entity catalog (kind=Vehicle/Property/Subcontractor/Customer/Family)
  //      — no aliases, used by the operator to tag transactions manually with
  //      a specific car, property, person, or client.
  // Users can edit / delete via /settings/tags (or /tags). Each entry upserts
  // on case-insensitive name match so this is idempotent across re-runs.
  const TAGS: Array<{ name: string; aliases: string[]; kind?: string }> = [
    { name: 'BP', aliases: ['bp ', 'bp australia', 'bp connect'] },
    { name: 'Caltex', aliases: ['caltex', 'ampol caltex'] },
    { name: 'Shell', aliases: ['shell ', 'shell coles'] },
    { name: 'Ampol', aliases: ['ampol', 'caltex ampol'] },
    { name: '7-Eleven', aliases: ['7-eleven', '7 eleven', '7eleven'] },
    { name: 'Costco', aliases: ['costco'] },
    { name: 'Liberty', aliases: ['liberty oil', 'liberty service'] },
    { name: 'Mobil', aliases: ['mobil '] },
    { name: 'Vibe', aliases: ['vibe service', 'vibe petroleum'] },
    { name: 'United', aliases: ['united petroleum'] },
    { name: 'Woolworths', aliases: ['woolworths', 'woolies', 'ww metro', 'ww supermarkets'] },
    { name: 'Coles', aliases: ['coles ', 'coles supermarkets', 'coles express'] },
    { name: 'IGA', aliases: ['iga '] },
    { name: 'ALDI', aliases: ['aldi '] },
    { name: 'Foodland', aliases: ['foodland'] },
    { name: 'PayPal', aliases: ['paypal', '617704'] },
    { name: 'Stripe', aliases: ['stripe payments'] },
    { name: 'eBay', aliases: ['ebay '] },
    { name: 'Amazon AU', aliases: ['amazon au', 'amazon.com.au', 'amzn mktp au'] },
    { name: 'Apple', aliases: ['apple.com/bill', 'apple pty ltd'] },
    { name: 'Google Play', aliases: ['google *play', 'google play'] },
    { name: 'Telstra', aliases: ['telstra'] },
    { name: 'Optus', aliases: ['optus ', 'singtel optus'] },
    { name: 'Vodafone', aliases: ['vodafone'] },
    { name: 'TPG', aliases: ['tpg internet', 'tpg telecom'] },
    { name: 'Aussie Broadband', aliases: ['aussie broadband'] },
    { name: 'Synergy', aliases: ['synergy '] },
    { name: 'Water Corp', aliases: ['water corp', 'water corporation'] },
    { name: 'Alinta Energy', aliases: ['alinta energy', 'alinta gas'] },
    { name: 'RAC', aliases: ['rac ', 'raci ', '250930'] },
    { name: 'NRMA', aliases: ['nrma '] },
    { name: 'AAMI', aliases: ['aami '] },
    { name: 'Allianz', aliases: ['allianz'] },
    { name: 'Bupa', aliases: ['bupa '] },
    { name: 'Medibank', aliases: ['medibank'] },
    { name: 'Commonwealth Bank', aliases: ['commbank', 'cba ', 'commonwealth bank'] },
    { name: 'NAB', aliases: ['national australia bank', 'nab '] },
    { name: 'Westpac', aliases: ['westpac'] },
    { name: 'ANZ', aliases: ['anz '] },

    // Entity catalog (kind-tagged, no aliases) — operator-applied facets.
    { name: "Honda CRV 2006", aliases: [], kind: "Vehicle" },
    { name: "Toyota Yaris 2008", aliases: [], kind: "Vehicle" },
    { name: "38 Torridon", aliases: [], kind: "Property" },
    { name: "Maddington Office", aliases: [], kind: "Property" },
    { name: "Dawa Sonam", aliases: [], kind: "Subcontractor" },
    { name: "Norbu", aliases: [], kind: "Subcontractor" },
    { name: "Rakesh Chloe", aliases: [], kind: "Subcontractor" },
    { name: "Poojana", aliases: [], kind: "Subcontractor" },
    { name: "Tendin/Tandin Sonam", aliases: [], kind: "Subcontractor" },
    { name: "Jigme Sherab", aliases: [], kind: "Subcontractor" },
    { name: "Tshering Pema", aliases: [], kind: "Subcontractor" },
    { name: "Kinley", aliases: [], kind: "Subcontractor" },
    { name: "Sonam Bassendean (Tshewang)", aliases: [], kind: "Subcontractor" },
    { name: "Pema Dorji", aliases: [], kind: "Subcontractor" },
    { name: "Namgay", aliases: [], kind: "Subcontractor" },
    { name: "Dorji Sonam", aliases: [], kind: "Subcontractor" },
    { name: "Sagar Niketa", aliases: [], kind: "Subcontractor" },
    { name: "Rishal Kowlessur", aliases: [], kind: "Subcontractor" },
    { name: "Sonam Jamtsho", aliases: [], kind: "Subcontractor" },
    { name: "Tshuelthrim", aliases: [], kind: "Subcontractor" },
    { name: "Mandeep Harwinder Sohi", aliases: [], kind: "Subcontractor" },
    { name: "Beant Ravinder", aliases: [], kind: "Subcontractor" },
    { name: "Sonam Cannington", aliases: [], kind: "Subcontractor" },
    { name: "Ajay (Canning Vale)", aliases: [], kind: "Subcontractor" },
    { name: "Rupinder", aliases: [], kind: "Subcontractor" },
    { name: "Krishna", aliases: [], kind: "Subcontractor" },
    { name: "Tashi (Cedarwoods)", aliases: [], kind: "Subcontractor" },
    { name: "Udip", aliases: [], kind: "Subcontractor" },
    { name: "Pasang", aliases: [], kind: "Subcontractor" },
    { name: "Prakash Jyoti", aliases: [], kind: "Subcontractor" },
    { name: "Abdul Sami Waheedy", aliases: [], kind: "Subcontractor" },
    { name: "Karma (Sealy)", aliases: [], kind: "Subcontractor" },
    { name: "Mani Dawa", aliases: [], kind: "Subcontractor" },
    { name: "Karma Dorji (Maddington)", aliases: [], kind: "Subcontractor" },
    { name: "Woodhams", aliases: [], kind: "Customer" },
    { name: "Angas Securities", aliases: [], kind: "Customer" },
    { name: "DCW Enterprises", aliases: [], kind: "Customer" },
    { name: "S.S. Chang Architects", aliases: [], kind: "Customer" },
    { name: "DWK Investment Trust (Herald Ave)", aliases: [], kind: "Customer" },
    { name: "SME", aliases: [], kind: "Customer" },
    { name: "Pharmacy Guild of Australia WA (PGAWA)", aliases: [], kind: "Customer" },
    { name: "Fundamentals Australia", aliases: [], kind: "Customer" },
    { name: "Mass Resources", aliases: [], kind: "Customer" },
    { name: "Sarre Insurance", aliases: [], kind: "Customer" },
    { name: "Industrial Power / I.Power Tools", aliases: [], kind: "Customer" },
    { name: "Colliers International", aliases: [], kind: "Customer" },
    { name: "Connect Staffing", aliases: [], kind: "Customer" },
    { name: "Gough Recruitment", aliases: [], kind: "Customer" },
    { name: "Systemcorp", aliases: [], kind: "Customer" },
    { name: "Galmon Pty Ltd (Stirling Health)", aliases: [], kind: "Customer" },
    { name: "Whites Group", aliases: [], kind: "Customer" },
    { name: "Westforce", aliases: [], kind: "Customer" },
    { name: "Dyson Appliances", aliases: [], kind: "Customer" },
    { name: "Lempira Holdings (WA Steel)", aliases: [], kind: "Customer" },
    { name: "Mass Recruitment", aliases: [], kind: "Customer" },
    { name: "Airco Fasteners", aliases: [], kind: "Customer" },
    { name: "West to West Car Group", aliases: [], kind: "Customer" },
    { name: "Raubex Construction", aliases: [], kind: "Customer" },
    { name: "Doors Doors Doors Pty Ltd", aliases: [], kind: "Customer" },
    { name: "Hima Australia", aliases: [], kind: "Customer" },
    { name: "Design Collision", aliases: [], kind: "Customer" },
    { name: "Alpha 1 Group", aliases: [], kind: "Customer" },
    { name: "M Residential Pty Ltd", aliases: [], kind: "Customer" },
    { name: "Ukawa Pty Ltd", aliases: [], kind: "Customer" },
    { name: "Annasar Pty Ltd", aliases: [], kind: "Customer" },
    { name: "Genesis Care", aliases: [], kind: "Customer" },
    { name: "Armonia Holdings (Enhance Physio)", aliases: [], kind: "Customer" },
    { name: "Datacity Pty Ltd (Merit Lining Systems)", aliases: [], kind: "Customer" },
    { name: "Global Packaging", aliases: [], kind: "Customer" },
    { name: "IMT Australia (Roobix)", aliases: [], kind: "Customer" },
    { name: "Planfarm Pty Ltd", aliases: [], kind: "Customer" },
    { name: "Sealy of Australia", aliases: [], kind: "Customer" },
    { name: "Samios", aliases: [], kind: "Customer" },
    { name: "Australian Institute of Marine and Power Engineers", aliases: [], kind: "Customer" },
    { name: "Carrier Australia", aliases: [], kind: "Customer" },
    { name: "Clearview", aliases: [], kind: "Customer" },
    { name: "Douglas Partners", aliases: [], kind: "Customer" },
    { name: "Mechanical Projects", aliases: [], kind: "Customer" },
    { name: "Raine and Horne", aliases: [], kind: "Customer" },
    { name: "Activa Developments", aliases: [], kind: "Customer" },
    { name: "Beeliar Drive Psychology", aliases: [], kind: "Customer" },
    { name: "DC Collision", aliases: [], kind: "Customer" },
    { name: "DigiTelecomm", aliases: [], kind: "Customer" },
    { name: "Penno Pty Ltd (LJ Hooker Shelley)", aliases: [], kind: "Customer" },
    { name: "Porta Craft P/L", aliases: [], kind: "Customer" },
    { name: "Samsung", aliases: [], kind: "Customer" },
    { name: "Soltex Pty Ltd", aliases: [], kind: "Customer" },
    { name: "Studco Australia", aliases: [], kind: "Customer" },
    { name: "Varner Contracting", aliases: [], kind: "Customer" },
    { name: "Westpac OLP Payment", aliases: [], kind: "Customer" },
    { name: "Satyam Dave", aliases: [], kind: "Family" },
    { name: "Snehalkumar Dabhi", aliases: [], kind: "Family" },
    { name: "Ashvinkumar Patel", aliases: [], kind: "Family" },
    { name: "Mr Vinodsinh Dabhi", aliases: [], kind: "Family" },
    { name: "Bhatt Family", aliases: [], kind: "Family" },
    { name: "Dushyant Dabhi", aliases: [], kind: "Family" },
    { name: "Ashvin Patel", aliases: [], kind: "Family" },
    { name: "Sam Dabhi", aliases: [], kind: "Family" },
  ];
  for (const t of TAGS) {
    const existing = await prisma.tag.findFirst({ where: { name: { equals: t.name, mode: 'insensitive' } } });
    if (existing) {
      await prisma.tag.update({ where: { id: existing.id }, data: { aliases: t.aliases, kind: t.kind ?? existing.kind } });
    } else {
      await prisma.tag.create({ data: { name: t.name, aliases: t.aliases, kind: t.kind } });
    }
  }

  console.log('seed: done');
}

// Only auto-run when invoked directly (via entrypoint.sh). Letting other
// scripts `require()` this module lets us reuse EMAIL_TEMPLATE_SPECS for
// one-off slot updates without triggering a full seed pass.
if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

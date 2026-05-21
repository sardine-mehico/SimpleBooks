import { PrismaClient, TaskStatus, InvoiceStatus, PaymentTerms } from '@prisma/client';

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
  if ((await prisma.user.count()) > 0) {
    console.log('seed: already populated, skipping');
    return;
  }

  await prisma.user.create({
    data: { email: 'owner@simplebooks.dev', name: 'Owner' },
  });

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
      name: 'SimpleBooks Pty Ltd',
      abn: '12 345 678 901',
      address: '1 Example Street\nLevel 2, Suite 5\nSydney NSW 2000',
      paymentDetails:
        '<strong>BSB:</strong> 062-000<br><strong>Account:</strong> 1234 5678<br><em>Reference:</em> invoice number',
      accountsEmail: 'accounts@simplebooks.dev',
      invoiceBcc: 'bcc@simplebooks.dev',
      notes: 'Primary trading entity. Use this for all AU customers.',
      creationOrder: 1,
      invoiceTemplateId: invoiceTemplates[0].id,
      emailTemplateId: emailTemplates[0].id,
    },
  });

  const customerDefs = [
    { name: 'Alex Kurm', email: 'alex@northwind.dev' },
    { name: 'Saram Stelte', email: 'hello@stelte.co' },
    { name: 'Mana Danan', email: 'mana@dananlabs.io' },
    { name: 'Pam Smith', email: 'pam@smithdesign.com' },
    { name: 'Cayen Goods', email: 'billing@cayen.com' },
    { name: 'Row Etmm', email: 'finance@etmm.io' },
  ];
  const customers = await Promise.all(
    customerDefs.map((c, i) =>
      prisma.customer.create({
        data: {
          name: c.name,
          customerNumber: 1001 + i,
          billingEmail1: c.email,
          billingCompanyId: company.id,
          paymentTerms: PaymentTerms.IN_28_DAYS,
          address: '123 Customer Lane',
        },
      }),
    ),
  );

  const items = await Promise.all(
    [
      { name: 'Consulting (hour)', unitPrice: 150 },
      { name: 'Implementation (day)', unitPrice: 1200 },
      { name: 'Monthly retainer', unitPrice: 2200 },
      { name: 'Premium support', unitPrice: 500 },
    ].map((it) => prisma.item.create({ data: it })),
  );

  const monthOffset = (m: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    return d;
  };

  const invoiceDefs: Array<{
    n: number; amount: number; status: InvoiceStatus; customer: typeof customers[number]; off: number;
  }> = [
    { n: 1000, amount: 1300, status: InvoiceStatus.SENT, customer: customers[4], off: 0 },
    { n: 1001, amount: 530, status: InvoiceStatus.SENT, customer: customers[5], off: 0 },
    { n: 1002, amount: 250, status: InvoiceStatus.SENT, customer: customers[2], off: 0 },
    { n: 1003, amount: 250, status: InvoiceStatus.SENT, customer: customers[3], off: 0 },
    { n: 1004, amount: 2200, status: InvoiceStatus.PAID, customer: customers[0], off: 1 },
    { n: 1005, amount: 1000, status: InvoiceStatus.PAID, customer: customers[1], off: 1 },
    { n: 1006, amount: 1800, status: InvoiceStatus.PAID, customer: customers[0], off: 2 },
    { n: 1007, amount: 900, status: InvoiceStatus.PAID, customer: customers[2], off: 3 },
    { n: 1008, amount: 1400, status: InvoiceStatus.PAID, customer: customers[1], off: 4 },
    { n: 1009, amount: 600, status: InvoiceStatus.PAID, customer: customers[3], off: 5 },
  ];

  for (const inv of invoiceDefs) {
    const lineAmount = inv.amount;
    const taxRate = 10;
    const taxAmount = +(lineAmount * (taxRate / 100)).toFixed(2);
    await prisma.invoice.create({
      data: {
        invoiceNumber: inv.n,
        invoiceDate: monthOffset(inv.off),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        status: inv.status,
        customerId: inv.customer.id,
        billingCompanyId: company.id,
        // Snapshot the company's template assignment onto each seeded invoice
        // so historical renders stay reproducible.
        invoiceTemplateId: company.invoiceTemplateId,
        emailTemplateId: company.emailTemplateId,
        subtotal: lineAmount,
        taxAmount,
        totalAmount: lineAmount + taxAmount,
        terms: 'Net 14',
        lineItems: {
          create: [
            {
              itemId: items[0].id,
              description: 'Consulting',
              quantity: 1,
              unitPrice: lineAmount,
              lineAmount,
              taxName: 'GST',
              taxRate,
              taxAmount,
              position: 0,
            },
          ],
        },
      },
    });
  }

  await prisma.task.createMany({
    data: [
      { title: 'Reconcile bank account for April', status: TaskStatus.PENDING },
      { title: 'Send Q1 statements to top customers', status: TaskStatus.PENDING },
      { title: 'Review pending invoices for late fees', status: TaskStatus.IN_PROGRESS },
      { title: 'Onboard Northwind Studio billing', status: TaskStatus.COMPLETED },
    ],
  });

  // Recurring schedules catalog
  const schedules = await Promise.all([
    prisma.recurringSchedule.upsert({
      where: { name: "Every week" },
      update: {},
      create: { name: "Every week", intervalUnit: "WEEKS", intervalCount: 1 },
    }),
    prisma.recurringSchedule.upsert({
      where: { name: "Every 2 weeks" },
      update: {},
      create: { name: "Every 2 weeks", intervalUnit: "WEEKS", intervalCount: 2 },
    }),
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
    prisma.recurringSchedule.upsert({
      where: { name: "Every quarter" },
      update: {},
      create: { name: "Every quarter", intervalUnit: "MONTHS", intervalCount: 3 },
    }),
    prisma.recurringSchedule.upsert({
      where: { name: "Every year" },
      update: {},
      create: { name: "Every year", intervalUnit: "YEARS", intervalCount: 1 },
    }),
  ]);
  const monthly = schedules.find((s) => s.name === "Every month")!;

  // Sample recurring rule — Monthly retainer for the first seeded customer with one dynamic-field line.
  const firstCustomer = await prisma.customer.findFirst({ orderBy: { customerNumber: "asc" } });
  if (firstCustomer && firstCustomer.billingCompanyId) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    await prisma.recurringRule.create({
      data: {
        scheduleName: `${firstCustomer.name} - ${monthly.name}`,
        startDate: tomorrow,
        recurringScheduleId: monthly.id,
        sendingOption: "REVIEW_BEFORE_SENDING",
        active: true,
        nextRunAt: tomorrow,
        customerId: firstCustomer.id,
        billingCompanyId: firstCustomer.billingCompanyId,
        lineItems: {
          create: [
            {
              description: "Monthly retainer for {{month-year}}",
              unitPrice: 1000,
              taxName: "GST",
              taxRate: 10,
              position: 0,
            },
          ],
        },
      },
    });
  }

  // Singleton — lazy-create with sensible defaults.
  await prisma.preferences.create({
    data: {
      timezone: 'Australia/Perth',
      financialYearStart: 7, // July (Australian FY)
    },
  });

  // ── AccountType lookup (Banking Phase A) ─────────────────────────────────
  const accountTypes = [
    'Everyday',
    'Savings',
    'Credit Card',
    'Loan',
    'Cash',
    'Offset',
  ];
  for (const name of accountTypes) {
    await prisma.accountType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // Two sample accounts so empty-state isn't the first impression.
  const everyday = await prisma.accountType.findUniqueOrThrow({ where: { name: 'Everyday' } });
  const savings = await prisma.accountType.findUniqueOrThrow({ where: { name: 'Savings' } });
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  await prisma.account.create({
    data: {
      name: 'CBA Smart Access',
      bank: 'Commonwealth Bank',
      accountTypeId: everyday.id,
      openingBalance: 0,
      openingDate: today,
    },
  });
  await prisma.account.create({
    data: {
      name: 'CBA Goal Saver',
      bank: 'Commonwealth Bank',
      accountTypeId: savings.id,
      openingBalance: 0,
      openingDate: today,
    },
  });

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

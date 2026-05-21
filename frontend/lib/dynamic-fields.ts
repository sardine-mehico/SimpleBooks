// Display-only placeholders that users can drop into Item descriptions (and
// other templated text). Resolved at the point of use — for example when an
// item is picked into a line on an invoice, with that invoice's invoice/due
// dates as context. Kept centrally so the Settings reference page and the
// substitution function stay in sync.

export type DynamicField = {
  token: string;
  label: string;
  description: string;
  example: string;
};

function currentMonthYear(now: Date = new Date()): string {
  // Format "Month-YYYY", e.g. "June-2026". `en-US` long month + 4-digit year.
  const month = now.toLocaleString("en-US", { month: "long" });
  return `${month}-${now.getFullYear()}`;
}

function formatDdMmYyyy(iso?: string | null): string {
  if (!iso) return "";
  // Accept `yyyy-mm-dd` straight from the date inputs without round-tripping
  // through `new Date()` — that round-trip can land in the previous day for
  // users east of UTC.
  const ymd = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export const DYNAMIC_FIELDS: DynamicField[] = [
  {
    token: "{{month-year}}",
    label: "Month-Year",
    description: "The current month and year at the time the field resolves.",
    example: `e.g. ${currentMonthYear()}`,
  },
  {
    token: "{{invoice date}}",
    label: "Invoice Date",
    description: "The Invoice Date of the invoice the line item is added to.",
    example: "e.g. 01/05/2026",
  },
  {
    token: "{{due date}}",
    label: "Due Date",
    description: "The Due Date of the invoice the line item is added to.",
    example: "e.g. 28/05/2026",
  },
  {
    token: "{{invoice number}}",
    label: "Invoice Number",
    description:
      "The invoice number of the host invoice. Use in email templates (subject/body). When typed into an Item description at edit time, the token is preserved as-is because the invoice number isn't assigned until save — it resolves later when the email template renders.",
    example: "e.g. INV-1024",
  },
  {
    token: "{{customer name}}",
    label: "Customer Name",
    description:
      "The name of the customer the invoice is addressed to. Same deferred-resolution rule as Invoice Number: kept literal until the email template renders.",
    example: "e.g. Alex Kurm",
  },
  {
    token: "{{billing company}}",
    label: "Billing Company",
    description:
      "The name of the Billing Company that issued the invoice. Use in email subject lines and bodies. Same deferred-resolution rule as Invoice Number / Customer Name: kept literal until the email template renders.",
    example: "e.g. SimpleBooks Pty Ltd",
  },
  {
    token: "{{accounts email}}",
    label: "Accounts Email",
    description:
      "The Billing Company's accounts email (the address invoices are sent from). Same deferred-resolution rule as Billing Company.",
    example: "e.g. accounts@simplebooks.dev",
  },
  {
    token: "{{invoice link}}",
    label: "Invoice Link (URL)",
    description:
      "The customer-facing public URL for viewing the invoice as a web page. Use when you need the raw URL string (e.g. inside an HTML anchor's href attribute).",
    example: "e.g. https://books.example.com/i/abc123…",
  },
  {
    token: "{{invoice link button}}",
    label: "Invoice Link (Button)",
    description:
      "Same URL as {{invoice link}} but wrapped in an inline-styled HTML button — drop into the HTML email body as a clearly clickable call-to-action.",
    example: "e.g. View Invoice button",
  },
];

export type DynamicFieldsContext = {
  invoiceDate?: string | null;
  dueDate?: string | null;
  // The four below are typically populated only by the email-template render
  // path (not by the invoice form's item-pick), since the invoice's number,
  // final customer name, billing company name, and accounts email aren't
  // necessarily known at edit time.
  invoiceNumber?: string | number | null;
  customerName?: string | null;
  billingCompany?: string | null;
  accountsEmail?: string | null;
  invoiceLink?: string | null;
};

// Replace `token` (regex) with `value` when `value` is a non-empty string;
// otherwise leave the token literal. This pass-through behavior lets
// `{{invoice_number}}` and `{{customer_name}}` survive intermediate steps
// (e.g. being picked into a line at edit time) and resolve later when the
// email template actually has those values in hand.
function replaceIf(text: string, pattern: RegExp, value: string): string {
  if (!value) return text;
  return text.replace(pattern, value);
}

function buttonHtml(url: string): string {
  return (
    `<a href="${url}" ` +
    'style="display:inline-block;padding:12px 24px;background-color:#1849a6;' +
    "color:#ffffff;text-decoration:none;font-weight:600;border-radius:6px;" +
    'font-family:Arial,Helvetica,sans-serif;font-size:15px;">' +
    "View Invoice" +
    "</a>"
  );
}

export function applyDynamicFields(text: string, ctx: DynamicFieldsContext = {}): string {
  if (!text) return text;
  const monthYear = currentMonthYear();
  const invoiceDate = formatDdMmYyyy(ctx.invoiceDate ?? undefined);
  const dueDate = formatDdMmYyyy(ctx.dueDate ?? undefined);
  const invoiceNumber = ctx.invoiceNumber != null ? String(ctx.invoiceNumber) : "";
  const customerName = ctx.customerName ?? "";
  const billingCompany = ctx.billingCompany ?? "";
  const accountsEmail = ctx.accountsEmail ?? "";
  const invoiceLink = ctx.invoiceLink ?? "";
  let out = text;
  // {{month-year}} always resolves — there's always a "now".
  out = out.replace(/\{\{\s*month-year\s*\}\}/gi, monthYear);
  // The remaining tokens use the pass-through helper so missing values keep
  // the token literal instead of substituting an empty string.
  out = replaceIf(out, /\{\{\s*invoice\s*date\s*\}\}/gi, invoiceDate);
  out = replaceIf(out, /\{\{\s*due\s*date\s*\}\}/gi, dueDate);
  // Match both the new spaced form (`{{invoice number}}`, `{{customer name}}`)
  // and the legacy underscore form so any pre-existing template content keeps
  // resolving after the token rename.
  out = replaceIf(out, /\{\{\s*invoice[_\s]+number\s*\}\}/gi, invoiceNumber);
  out = replaceIf(out, /\{\{\s*customer[_\s]+name\s*\}\}/gi, customerName);
  out = replaceIf(out, /\{\{\s*billing\s*company\s*\}\}/gi, billingCompany);
  out = replaceIf(out, /\{\{\s*accounts\s*email\s*\}\}/gi, accountsEmail);
  // Resolve the button variant before the bare URL so {{invoice link}} doesn't
  // accidentally match inside the rendered <a href="...">.
  if (invoiceLink) {
    out = out.replace(/\{\{\s*invoice\s*link\s*button\s*\}\}/gi, buttonHtml(invoiceLink));
    out = out.replace(/\{\{\s*invoice\s*link\s*\}\}/gi, invoiceLink);
  }
  return out;
}

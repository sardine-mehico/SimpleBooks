// Server-side mirror of frontend/lib/dynamic-fields.ts. Templates loaded
// from EmailTemplate (subject/body) and rendered to PDF run through this
// substitution at send/render time. Keep the token vocabulary in lockstep
// with the frontend file — both lists feed the Send dialog's "Insert Fields"
// picker via /email-templates and the Settings/Dynamic Fields reference page.

export type DynamicFieldsContext = {
  invoiceDate?: Date | string | null;
  dueDate?: Date | string | null;
  invoiceNumber?: string | number | null;
  customerName?: string | null;
  billingCompany?: string | null;
  accountsEmail?: string | null;
  invoiceLink?: string | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Format `yyyy-mm-dd` / Date as `dd/mm/yyyy` using calendar parts so we don't
// drift across the UTC boundary for users east of Greenwich.
function formatDdMmYyyy(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  return `${pad2(value.getDate())}/${pad2(value.getMonth() + 1)}/${value.getFullYear()}`;
}

function currentMonthYear(now: Date = new Date()): string {
  const month = now.toLocaleString('en-US', { month: 'long' });
  return `${month}-${now.getFullYear()}`;
}

// Pass-through helper: when the value is empty leave the token literal so an
// upstream layer can still resolve it later. Matches the frontend behaviour.
function replaceIf(text: string, pattern: RegExp, value: string): string {
  if (!value) return text;
  return text.replace(pattern, value);
}

// Inline-styled <a> for HTML email bodies. Inline styles only — class names
// and external CSS are stripped by many mail clients.
function buttonHtml(url: string): string {
  return (
    `<a href="${url}" ` +
    'style="display:inline-block;padding:12px 24px;background-color:#1849a6;' +
    'color:#ffffff;text-decoration:none;font-weight:600;border-radius:6px;' +
    'font-family:Arial,Helvetica,sans-serif;font-size:15px;">' +
    'View Invoice' +
    '</a>'
  );
}

export function applyDynamicFields(
  text: string | null | undefined,
  ctx: DynamicFieldsContext = {},
): string {
  if (!text) return '';
  const invoiceDate = formatDdMmYyyy(ctx.invoiceDate);
  const dueDate = formatDdMmYyyy(ctx.dueDate);
  const invoiceNumber = ctx.invoiceNumber != null ? String(ctx.invoiceNumber) : '';
  const customerName = ctx.customerName ?? '';
  const billingCompany = ctx.billingCompany ?? '';
  const accountsEmail = ctx.accountsEmail ?? '';
  const invoiceLink = ctx.invoiceLink ?? '';

  let out = text;
  out = out.replace(/\{\{\s*month-year\s*\}\}/gi, currentMonthYear());
  out = replaceIf(out, /\{\{\s*invoice\s*date\s*\}\}/gi, invoiceDate);
  out = replaceIf(out, /\{\{\s*due\s*date\s*\}\}/gi, dueDate);
  // Match both the new spaced form and the legacy underscore form — see
  // the matching comment in frontend/lib/dynamic-fields.ts.
  out = replaceIf(out, /\{\{\s*invoice[_\s]+number\s*\}\}/gi, invoiceNumber);
  out = replaceIf(out, /\{\{\s*customer[_\s]+name\s*\}\}/gi, customerName);
  out = replaceIf(out, /\{\{\s*billing\s*company\s*\}\}/gi, billingCompany);
  out = replaceIf(out, /\{\{\s*accounts\s*email\s*\}\}/gi, accountsEmail);
  // The button variant is resolved before the plain link so {{invoice link}}
  // doesn't accidentally substitute inside the rendered <a href="...">.
  if (invoiceLink) {
    out = out.replace(/\{\{\s*invoice\s*link\s*button\s*\}\}/gi, buttonHtml(invoiceLink));
    out = out.replace(/\{\{\s*invoice\s*link\s*\}\}/gi, invoiceLink);
  }
  return out;
}

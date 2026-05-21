// Backend twin of frontend `lib/dynamic-fields.ts`. The recurring processor
// calls this on every line item description at generation time, with the
// generated invoice's actual dates as context. Token resolution is one-shot
// here too — the resulting string is frozen onto the InvoiceItem.

export type DynamicFieldsContext = {
  invoiceDate?: Date | null;
  dueDate?: Date | null;
  invoiceNumber?: string | number | null;
  customerName?: string | null;
};

function monthYearOf(d: Date): string {
  return `${d.toLocaleString('en-US', { month: 'long' })}-${d.getFullYear()}`;
}

function ddmmyyyyOf(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// Replace when value is non-empty; leave token literal otherwise. Keeps
// unresolved tokens alive so a later stage (email template render) can finish
// the job.
function replaceIf(text: string, pattern: RegExp, value: string): string {
  if (!value) return text;
  return text.replace(pattern, value);
}

export function applyDynamicFields(text: string, ctx: DynamicFieldsContext = {}): string {
  if (!text) return text;
  const monthYear = monthYearOf(ctx.invoiceDate ?? new Date());
  const invoiceDate = ctx.invoiceDate ? ddmmyyyyOf(ctx.invoiceDate) : '';
  const dueDate = ctx.dueDate ? ddmmyyyyOf(ctx.dueDate) : '';
  const invoiceNumber = ctx.invoiceNumber != null ? String(ctx.invoiceNumber) : '';
  const customerName = ctx.customerName ?? '';
  let out = text;
  out = out.replace(/\{\{\s*month-year\s*\}\}/gi, monthYear);
  out = replaceIf(out, /\{\{\s*invoice\s*date\s*\}\}/gi, invoiceDate);
  out = replaceIf(out, /\{\{\s*due\s*date\s*\}\}/gi, dueDate);
  out = replaceIf(out, /\{\{\s*invoice_number\s*\}\}/gi, invoiceNumber);
  out = replaceIf(out, /\{\{\s*customer_name\s*\}\}/gi, customerName);
  return out;
}

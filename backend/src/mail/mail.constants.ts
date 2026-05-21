export const INVOICE_MAIL_QUEUE = 'invoice-mail';

// One sync attempt at click time + this many queued retries = 4 tries total.
// Backoff between retries is fixed at 10 minutes per spec.
export const INVOICE_MAIL_RETRY_ATTEMPTS = 3;
export const INVOICE_MAIL_RETRY_DELAY_MS = 10 * 60 * 1000;

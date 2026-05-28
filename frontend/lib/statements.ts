import { api, apiClient, browserApiBase } from './api';
import type { StatementResponse, StatementSendContext } from './types';

export type StatementParams = {
  customerId: string;
  billingCompanyId: string;
  dateFrom?: string | null;
  dateTo?: string | null;
};

function toQuery(p: StatementParams): string {
  const qs = new URLSearchParams({
    customerId: p.customerId,
    billingCompanyId: p.billingCompanyId,
  });
  if (p.dateFrom) qs.set('dateFrom', p.dateFrom);
  if (p.dateTo) qs.set('dateTo', p.dateTo);
  return qs.toString();
}

export function getStatement(p: StatementParams): Promise<StatementResponse> {
  return api<StatementResponse>(`/statements?${toQuery(p)}`);
}

export function getStatementSendContext(p: StatementParams): Promise<StatementSendContext> {
  return api<StatementSendContext>(`/statements/send-context?${toQuery(p)}`);
}

// Browser-followed URL (window.open / anchor href). Uses browserApiBase
// because the backend hostname differs between SSR (`http://backend:4000`)
// and the browser (`http://localhost:4000`); statements PDFs are only ever
// opened in the user's browser.
export function statementPdfUrl(p: StatementParams): string {
  return `${browserApiBase()}/statements/pdf?${toQuery(p)}`;
}

export function sendStatement(p: StatementParams & {
  fromEmail: string;
  toEmail: string;
  ccEmail?: string;
  bccEmail?: string;
  subject: string;
  html: string;
}): Promise<{ messageId: string }> {
  return apiClient.post<{ messageId: string }>('/statements/send', {
    customerId: p.customerId,
    billingCompanyId: p.billingCompanyId,
    dateFrom: p.dateFrom ?? undefined,
    dateTo: p.dateTo ?? undefined,
    fromEmail: p.fromEmail,
    toEmail: p.toEmail,
    ccEmail: p.ccEmail || undefined,
    bccEmail: p.bccEmail || undefined,
    subject: p.subject,
    html: p.html,
  });
}

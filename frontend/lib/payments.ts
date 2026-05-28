import { api } from "./api";
import type {
  ApplyPaymentResponse,
  CandidatesResponse,
  CustomerCredit,
  Invoice,
  PaymentQueueItem,
} from "./types";

export function listOpenInvoices(search = ""): Promise<Invoice[]> {
  const qs = new URLSearchParams({ openOnly: "true" });
  if (search) qs.set("search", search);
  return api<Invoice[]>(`/invoices?${qs.toString()}`);
}

export function listPaymentsQueue(showAll = false): Promise<PaymentQueueItem[]> {
  return api<PaymentQueueItem[]>(`/payments/queue${showAll ? "?showAll=true" : ""}`);
}

export function paymentsQueueCount(showAll = false): Promise<{ count: number }> {
  return api<{ count: number }>(`/payments/queue/count${showAll ? "?showAll=true" : ""}`);
}

export function getCandidates(transactionId: string): Promise<CandidatesResponse> {
  return api<CandidatesResponse>(`/payments/candidates/${transactionId}`);
}

export function applyPayment(body: {
  transactionId: string;
  allocations: Array<{ invoiceId: string; amount: string }>;
}): Promise<ApplyPaymentResponse> {
  return api<ApplyPaymentResponse>("/payments/apply", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

export function deleteAllocation(id: string): Promise<void> {
  return api<void>(`/payments/allocations/${id}`, { method: "DELETE" });
}

export function dismissPayment(transactionId: string): Promise<void> {
  return api<void>(`/payments/dismiss/${transactionId}`, { method: "POST" });
}

export function undismissPayment(transactionId: string): Promise<void> {
  return api<void>(`/payments/undismiss/${transactionId}`, { method: "POST" });
}

export function getCustomerCredit(customerId: string): Promise<CustomerCredit> {
  return api<CustomerCredit>(`/customers/${customerId}/credit`);
}

import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import type { BillingCompany, Customer, Invoice, Item, TaxType } from "@/lib/types";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let invoice: Invoice;
  let customers: Customer[] = [];
  let companies: BillingCompany[] = [];
  let items: Item[] = [];
  let taxTypes: TaxType[] = [];
  try {
    [invoice, customers, companies, items, taxTypes] = await Promise.all([
      api<Invoice>(`/invoices/${id}`),
      api<Customer[]>("/customers"),
      api<BillingCompany[]>("/companies"),
      api<Item[]>("/items"),
      api<TaxType[]>("/tax-types"),
    ]);
  } catch {
    notFound();
  }
  // The invoice form renders its own page chrome (back/title/save/menu) —
  // wrapping it in `PageShell` would duplicate the title row.
  return (
    <InvoiceForm
      initial={invoice!}
      customers={customers}
      companies={companies}
      items={items}
      taxTypes={taxTypes}
    />
  );
}

import { api } from "@/lib/api";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import type { BillingCompany, Customer, Item, TaxType } from "@/lib/types";

export default async function Page() {
  let customers: Customer[] = [];
  let companies: BillingCompany[] = [];
  let items: Item[] = [];
  let taxTypes: TaxType[] = [];
  try {
    [customers, companies, items, taxTypes] = await Promise.all([
      api<Customer[]>("/customers"),
      api<BillingCompany[]>("/companies"),
      api<Item[]>("/items"),
      api<TaxType[]>("/tax-types"),
    ]);
  } catch {}
  return <InvoiceForm customers={customers} companies={companies} items={items} taxTypes={taxTypes} />;
}

import { api } from "@/lib/api";
import { InvoicesList } from "@/components/invoices/invoices-list";
import type { Invoice, BillingCompany, Customer } from "@/lib/types";

async function load() {
  // Pull active + trash in parallel. The trash list is small (recent 30 days)
  // so loading it on every visit is cheap; the list component hides trash rows
  // by default and only surfaces them when the user picks "Deleted" in the
  // status filter.
  const [invoices, trash, companies, customers] = await Promise.all([
    api<Invoice[]>("/invoices").catch(() => [] as Invoice[]),
    api<Invoice[]>("/invoices/trash").catch(() => [] as Invoice[]),
    api<BillingCompany[]>("/companies").catch(() => [] as BillingCompany[]),
    api<Customer[]>("/customers").catch(() => [] as Customer[]),
  ]);
  return { invoices: [...invoices, ...trash], companies, customers };
}

export default async function Page() {
  const { invoices, companies, customers } = await load();
  return <InvoicesList initial={invoices} companies={companies} customers={customers} />;
}

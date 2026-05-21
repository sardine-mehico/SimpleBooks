import { api } from "@/lib/api";
import { InvoicesList } from "@/components/invoices/invoices-list";
import type { Invoice, BillingCompany } from "@/lib/types";

async function load() {
  const [invoices, companies] = await Promise.all([
    api<Invoice[]>("/invoices").catch(() => [] as Invoice[]),
    api<BillingCompany[]>("/companies").catch(() => [] as BillingCompany[]),
  ]);
  return { invoices, companies };
}

export default async function Page() {
  const { invoices, companies } = await load();
  return <InvoicesList initial={invoices} companies={companies} />;
}

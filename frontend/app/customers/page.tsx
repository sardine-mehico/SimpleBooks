import { api } from "@/lib/api";
import { CustomersList } from "@/components/customers/customers-list";
import type { BillingCompany, Customer } from "@/lib/types";

async function load(): Promise<{ rows: Customer[]; companies: BillingCompany[] }> {
  try {
    const [rows, companies] = await Promise.all([
      api<Customer[]>("/customers"),
      api<BillingCompany[]>("/companies"),
    ]);
    return { rows, companies };
  } catch {
    return { rows: [], companies: [] };
  }
}

export default async function Page() {
  const { rows, companies } = await load();
  return <CustomersList initial={rows} companies={companies} />;
}

import { api } from "@/lib/api";
import { StatementsPage } from "@/components/statements/statements-page";
import type { BillingCompany, Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

async function load(): Promise<{ customers: Customer[]; companies: BillingCompany[] }> {
  try {
    const [customers, companies] = await Promise.all([
      api<Customer[]>("/customers"),
      api<BillingCompany[]>("/companies"),
    ]);
    return { customers, companies };
  } catch {
    return { customers: [], companies: [] };
  }
}

export default async function Page() {
  const { customers, companies } = await load();
  return <StatementsPage customers={customers} companies={companies} />;
}

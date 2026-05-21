import { api } from "@/lib/api";
import { CompaniesList } from "@/components/companies/companies-list";
import type { BillingCompany } from "@/lib/types";

async function load() {
  try { return await api<BillingCompany[]>("/companies"); } catch { return []; }
}

export default async function Page() {
  const rows = await load();
  return <CompaniesList initial={rows} />;
}

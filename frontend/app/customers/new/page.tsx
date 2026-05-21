import { api } from "@/lib/api";
import { CustomerForm } from "@/components/customers/customer-form";
import type { BillingCompany } from "@/lib/types";

export default async function Page() {
  let companies: BillingCompany[] = [];
  try { companies = await api<BillingCompany[]>("/companies"); } catch {}
  return <CustomerForm companies={companies} />;
}

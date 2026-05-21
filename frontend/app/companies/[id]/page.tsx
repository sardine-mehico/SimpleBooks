import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { CompanyForm } from "@/components/companies/company-form";
import type { BillingCompany } from "@/lib/types";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let row: BillingCompany;
  try { row = await api<BillingCompany>(`/companies/${id}`); } catch { notFound(); }
  return <CompanyForm initial={row!} />;
}

import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { CustomerForm } from "@/components/customers/customer-form";
import type { BillingCompany, Customer } from "@/lib/types";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let row: Customer;
  let companies: BillingCompany[] = [];
  try {
    [row, companies] = await Promise.all([
      api<Customer>(`/customers/${id}`),
      api<BillingCompany[]>("/companies"),
    ]);
  } catch {
    notFound();
  }
  return <CustomerForm initial={row!} companies={companies} />;
}

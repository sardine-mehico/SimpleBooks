import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { RecurringForm } from "@/components/recurring/recurring-form";
import type {
  BillingCompany, Customer, Item, RecurringRule, RecurringSchedule, TaxType,
} from "@/lib/types";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let rule: RecurringRule;
  let customers: Customer[] = [];
  let companies: BillingCompany[] = [];
  let items: Item[] = [];
  let taxTypes: TaxType[] = [];
  let schedules: RecurringSchedule[] = [];
  try {
    [rule, customers, companies, items, taxTypes, schedules] = await Promise.all([
      api<RecurringRule>(`/recurring/${id}`),
      api<Customer[]>("/customers"),
      api<BillingCompany[]>("/companies"),
      api<Item[]>("/items"),
      api<TaxType[]>("/tax-types"),
      api<RecurringSchedule[]>("/recurring-schedules"),
    ]);
  } catch {
    notFound();
  }
  return (
    <RecurringForm
      initial={rule!}
      customers={customers}
      companies={companies}
      items={items}
      taxTypes={taxTypes}
      schedules={schedules}
    />
  );
}

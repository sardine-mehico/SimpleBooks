import { api } from "@/lib/api";
import { RecurringForm } from "@/components/recurring/recurring-form";
import type {
  BillingCompany, Customer, Item, RecurringSchedule, TaxType,
} from "@/lib/types";

export default async function Page() {
  let customers: Customer[] = [];
  let companies: BillingCompany[] = [];
  let items: Item[] = [];
  let taxTypes: TaxType[] = [];
  let schedules: RecurringSchedule[] = [];
  try {
    [customers, companies, items, taxTypes, schedules] = await Promise.all([
      api<Customer[]>("/customers"),
      api<BillingCompany[]>("/companies"),
      api<Item[]>("/items"),
      api<TaxType[]>("/tax-types"),
      api<RecurringSchedule[]>("/recurring-schedules"),
    ]);
  } catch {}
  return (
    <RecurringForm
      customers={customers}
      companies={companies}
      items={items}
      taxTypes={taxTypes}
      schedules={schedules}
    />
  );
}

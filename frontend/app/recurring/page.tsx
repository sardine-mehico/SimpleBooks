import { api } from "@/lib/api";
import { RecurringList } from "@/components/recurring/recurring-list";
import type { BillingCompany, Customer, RecurringRule, RecurringSchedule } from "@/lib/types";

async function load() {
  const [rules, schedules, customers, companies] = await Promise.all([
    api<RecurringRule[]>("/recurring").catch(() => [] as RecurringRule[]),
    api<RecurringSchedule[]>("/recurring-schedules").catch(() => [] as RecurringSchedule[]),
    api<Customer[]>("/customers").catch(() => [] as Customer[]),
    api<BillingCompany[]>("/companies").catch(() => [] as BillingCompany[]),
  ]);
  return { rules, schedules, customers, companies };
}

export default async function Page() {
  const { rules, schedules, customers, companies } = await load();
  return <RecurringList initial={rules} schedules={schedules} customers={customers} companies={companies} />;
}

import { api } from "@/lib/api";
import { RecurringList } from "@/components/recurring/recurring-list";
import type { RecurringRule, RecurringSchedule } from "@/lib/types";

async function load() {
  const [rules, schedules] = await Promise.all([
    api<RecurringRule[]>("/recurring").catch(() => [] as RecurringRule[]),
    api<RecurringSchedule[]>("/recurring-schedules").catch(() => [] as RecurringSchedule[]),
  ]);
  return { rules, schedules };
}

export default async function Page() {
  const { rules, schedules } = await load();
  return <RecurringList initial={rules} schedules={schedules} />;
}

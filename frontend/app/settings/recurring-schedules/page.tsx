import { api } from "@/lib/api";
import { RecurringSchedulesManager } from "@/components/settings/recurring-schedules-manager";
import type { RecurringSchedule } from "@/lib/types";

export default async function Page() {
  let rows: RecurringSchedule[] = [];
  try { rows = await api<RecurringSchedule[]>("/recurring-schedules"); } catch {}
  return <RecurringSchedulesManager initial={rows} />;
}

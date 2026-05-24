import { api } from "@/lib/api";
import { listPaymentsQueue } from "@/lib/payments";
import type { Customer } from "@/lib/types";
import { PaymentsQueue } from "@/components/payments/payments-queue";

export const dynamic = "force-dynamic";

export default async function PaymentsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ showAll?: string }>;
}) {
  const sp = await searchParams;
  const showAll = sp.showAll === "true";
  const [items, customers] = await Promise.all([
    listPaymentsQueue(showAll),
    api<Customer[]>("/customers").catch(() => [] as Customer[]),
  ]);
  return <PaymentsQueue initialItems={items} initialShowAll={showAll} customers={customers} />;
}

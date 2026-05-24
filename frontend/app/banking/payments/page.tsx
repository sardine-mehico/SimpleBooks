import { listPaymentsQueue } from "@/lib/payments";
import { PaymentsQueue } from "@/components/payments/payments-queue";

export const dynamic = "force-dynamic";

export default async function PaymentsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ showAll?: string }>;
}) {
  const sp = await searchParams;
  const showAll = sp.showAll === "true";
  const items = await listPaymentsQueue(showAll);
  return <PaymentsQueue initialItems={items} initialShowAll={showAll} />;
}

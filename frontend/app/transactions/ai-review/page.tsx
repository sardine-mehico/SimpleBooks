import { Suspense } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { AiReviewList } from "@/components/transactions/ai-review-list";
import { listCategories, listVendors } from "@/lib/banking-rules";

export default async function Page() {
  const [categories, vendors] = await Promise.all([listCategories(), listVendors(true)]);
  return (
    <PageShell title="AI Review">
      <Suspense>
        <AiReviewList categories={categories} vendors={vendors} />
      </Suspense>
    </PageShell>
  );
}

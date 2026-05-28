import { Suspense } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { AiReviewList } from "@/components/transactions/ai-review-list";
import { listCategories, listTags } from "@/lib/banking-rules";

export default async function Page() {
  const [categories, tags] = await Promise.all([listCategories(), listTags(true)]);
  return (
    <PageShell title="AI Review">
      <Suspense>
        <AiReviewList categories={categories} tags={tags} />
      </Suspense>
    </PageShell>
  );
}

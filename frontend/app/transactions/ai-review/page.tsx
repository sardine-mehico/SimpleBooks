import { PageShell } from "@/components/layout/page-shell";
import { AiReviewList } from "@/components/transactions/ai-review-list";

export default async function Page() {
  return (
    <PageShell title="AI Review">
      <AiReviewList />
    </PageShell>
  );
}

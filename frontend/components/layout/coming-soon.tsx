import { PageShell } from "./page-shell";
import { Card } from "@/components/ui/card";

export function ComingSoon({ title }: { title: string }) {
  return (
    <PageShell title={title}>
      <Card className="grid place-items-center px-6 py-20 text-center">
        <div className="max-w-md">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
            Boilerplate
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            {title} module coming soon
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            The data model and API for this section are scaffolded. The interface is the next thing to build —
            keep the patterns from the Dashboard and Tasks pages for consistency.
          </p>
        </div>
      </Card>
    </PageShell>
  );
}

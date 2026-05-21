import { Card } from "@/components/ui/card";
import { SectionHeader } from "./section-header";

export function SectionPlaceholder({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <SectionHeader title={title} description={description} />
      <Card className="grid place-items-center px-6 py-16 text-center">
        <div className="max-w-md">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">Boilerplate</div>
          <h3 className="text-sm font-semibold text-slate-900">{title} module coming soon</h3>
          <p className="mt-2 text-sm text-slate-500">
            This section is scaffolded in the nav. Build it following the patterns from Tax Types or Mail Configuration.
          </p>
        </div>
      </Card>
    </div>
  );
}

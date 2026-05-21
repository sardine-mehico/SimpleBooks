import { PageShell } from "@/components/layout/page-shell";
import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell title="Settings">
      <div className="flex flex-col gap-4 md:flex-row">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </PageShell>
  );
}

import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/settings/section-header";
import { DYNAMIC_FIELDS } from "@/lib/dynamic-fields";

export default function Page() {
  return (
    <div>
      <SectionHeader
        title="Dynamic Fields"
        description="Placeholders you can drop into templated text (e.g. an Item's description). They resolve to live values at the point of use — for example, when an item is picked into a line on an invoice the placeholders are replaced using that invoice's dates."
      />
      <Card className="p-5">
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Field</th>
                <th className="px-4 py-2.5 text-left">Description</th>
                <th className="px-4 py-2.5 text-left">Resolved example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DYNAMIC_FIELDS.map((f) => (
                <tr key={f.token}>
                  <td className="w-px whitespace-nowrap px-4 py-3 align-top">
                    <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-800">
                      {f.token}
                    </code>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">{f.description}</td>
                  <td className="px-4 py-3 align-top text-slate-500">{f.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          These tokens are case-insensitive and tolerant of inner whitespace. Type them
          verbatim into an Item description (or any field that supports them) and they will
          be replaced when the value is consumed.
        </p>
      </Card>
    </div>
  );
}

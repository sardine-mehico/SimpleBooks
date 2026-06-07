import { Fragment } from "react";
import type { ReportResponse } from "@/lib/types";

function fmt(n: string | number) {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function TotalsTable({ report }: { report: ReportResponse }) {
  return (
    <div className="max-h-[60vh] overflow-y-auto rounded-md border border-slate-100">
    <table className="w-full border-separate border-spacing-0 text-sm">
      <thead className="sticky top-0 z-10 bg-white">
        <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
          <th className="border-b border-slate-200 bg-white py-2 px-2 font-medium">Category</th>
          <th className="border-b border-slate-200 bg-white py-2 px-2 text-right font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {report.parents.map((p) => (
          <Fragment key={p.id}>
            <tr className="font-semibold text-slate-900">
              <td className="py-1.5 px-2">{p.name}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">${fmt(p.total)}</td>
            </tr>
            {p.children.map((c) => (
              <tr key={c.id} className="text-slate-700">
                <td className="py-1 pl-8 pr-2 text-slate-600 before:mr-2 before:text-slate-300 before:content-['↳']">
                  {c.name}
                </td>
                <td className="py-1 px-2 text-right tabular-nums">${fmt(c.total)}</td>
              </tr>
            ))}
          </Fragment>
        ))}
        {Number(report.uncategorised) > 0 && (
          <tr className="italic text-slate-500">
            <td className="py-1.5 px-2">Uncategorised</td>
            <td className="py-1.5 px-2 text-right tabular-nums">${fmt(report.uncategorised)}</td>
          </tr>
        )}
        <tr className="border-t border-slate-300 font-bold text-slate-900">
          <td className="pt-2.5 px-2">Total</td>
          <td className="pt-2.5 px-2 text-right tabular-nums">${fmt(report.grandTotal)}</td>
        </tr>
      </tbody>
    </table>
    </div>
  );
}

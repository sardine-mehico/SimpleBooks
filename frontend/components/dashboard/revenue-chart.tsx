"use client";

import { ChevronDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function RevenueChart({ data }: { data: { month: number; revenue: number; expense: number }[] }) {
  const width = 720;
  const height = 240;
  const padding = { top: 16, right: 16, bottom: 28, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.expense)));
  const niceMax = Math.ceil(max / 500) * 500 || 500;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * niceMax);

  const xStep = innerW / data.length;
  const barW = Math.max(8, xStep * 0.45);

  const expensePoints = data
    .map((d, i) => {
      const x = padding.left + xStep * i + xStep / 2;
      const y = padding.top + innerH - (d.expense / niceMax) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue vs Expense</CardTitle>
        <button className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
          Current year
          <ChevronDown className="h-3 w-3" />
        </button>
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Revenue vs Expense">
          {yTicks.map((tick, i) => {
            const y = padding.top + innerH - (tick / niceMax) * innerH;
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeDasharray={i === 0 ? "0" : "3 3"}
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="#94A3B8"
                  fontFamily="ui-monospace, monospace"
                >
                  ${tick.toLocaleString()}
                </text>
              </g>
            );
          })}

          {data.map((d, i) => {
            const x = padding.left + xStep * i + (xStep - barW) / 2;
            const h = (d.revenue / niceMax) * innerH;
            const y = padding.top + innerH - h;
            return (
              <g key={i}>
                <rect x={x} y={y} width={barW} height={h} rx={3} fill="#6366F1" opacity={0.85} />
                <text
                  x={x + barW / 2}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#94A3B8"
                >
                  {MONTHS[d.month]}
                </text>
              </g>
            );
          })}

          <polyline
            fill="none"
            stroke="#0F172A"
            strokeWidth={1.6}
            points={expensePoints}
          />
          {data.map((d, i) => {
            const x = padding.left + xStep * i + xStep / 2;
            const y = padding.top + innerH - (d.expense / niceMax) * innerH;
            return <circle key={i} cx={x} cy={y} r={2.5} fill="#0F172A" />;
          })}
        </svg>
      </CardContent>
    </Card>
  );
}

"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

// Cycling palette of 8 distinct hues — picked from the project's accent palette
// (indigo, slate, emerald, amber, rose, sky, violet, teal).
const PALETTE = ['#4F46E5', '#475569', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#8B5CF6', '#14B8A6'];

// Lighter variants for the drill-down (subcategory) pie — derived shades stepping
// from 90% toward 50% opacity of the base color so the visual nesting is preserved.
function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lerp = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[lerp(r), lerp(g), lerp(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export type PieSlice = { id: string; name: string; total: number };

export function CategoryPie({
  title,
  data,
  centerTotal,
  baseColor,
  onSelect,
}: {
  title: string;
  data: PieSlice[];
  centerTotal: string;
  baseColor?: string;
  onSelect?: (id: string) => void;
}) {
  const sliceColors = useMemo(() => {
    if (baseColor) {
      const n = Math.max(1, data.length - 1);
      return data.map((_, i) => lighten(baseColor, 0.1 + (i / n) * 0.4));
    }
    // Uncategorised gets a fixed slate-300 so it's visually distinct from the
    // first palette colour even when there are 9+ slices (palette is length 8).
    let paletteIdx = 0;
    return data.map((d) => {
      if (d.id === '__uncategorised__') return '#CBD5E1'; // slate-300
      return PALETTE[paletteIdx++ % PALETTE.length];
    });
  }, [data, baseColor]);

  if (data.length === 0) {
    return (
      <div className="flex h-72 flex-col items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-500">
        <div className="font-medium text-slate-700">{title}</div>
        <div className="mt-1 italic">no data for this selection</div>
      </div>
    );
  }

  return (
    <div className="flex h-72 flex-col">
      <div className="mb-2 text-sm font-medium text-slate-700">{title}</div>
      <div className="relative flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="name"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={1}
              onClick={onSelect ? (entry: any) => onSelect(entry.id) : undefined}
              cursor={onSelect ? 'pointer' : 'default'}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={sliceColors[i]} stroke="white" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any, name: any) => [`$${Number(value).toFixed(2)}`, name]}
              contentStyle={{ borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xs uppercase tracking-wider text-slate-400">Total</div>
          <div className="text-xl font-semibold text-slate-900">${centerTotal}</div>
        </div>
      </div>
    </div>
  );
}

export const PIE_PALETTE = PALETTE;

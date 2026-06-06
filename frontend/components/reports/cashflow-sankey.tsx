"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import type { CashflowResponse } from "@/lib/types";

type SankeyNodeIn = {
  id: string;
  name: string;
  tier: number;
  amount: number;
  hasChildren?: boolean;
  side: "income" | "expense" | "centre";
  color: string;
};
type SankeyLinkIn = { source: string; target: string; value: number };

const TIER_CUSTOMER = 0;
const TIER_SOURCE = 1;
const TIER_CENTRE = 2;
const TIER_CATEGORY = 3;
const TIER_SUB = 4;

const TOTAL_NODE_ID = "__total_income__";
const SURPLUS_ID = "__surplus__";
const SHORTFALL_ID = "__shortfall__";

const INCOME_BC_PALETTE = ["#16a34a", "#15803d", "#22c55e", "#4ade80", "#65a30d", "#10b981"];
const OTHER_INCOME_COLOR = "#0d9488";
const EXPENSE_PALETTE = ["#dc2626", "#ea580c", "#d97706", "#ca8a04", "#b91c1c", "#f97316", "#c2410c", "#92400e"];
const SURPLUS_COLOR = "#16a34a";
const SHORTFALL_COLOR = "#dc2626";
const TOTAL_INCOME_COLOR = "#15803d";
const TOTAL_INCOME_DEFICIT_COLOR = "#b91c1c";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number) {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function lighten(hex: string, mix = 0.35): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * mix, g + (255 - g) * mix, b + (255 - b) * mix);
}
function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function topNWithOther<T extends { amount: number }>(items: T[], n: number): { kept: T[]; otherSum: number; otherCount: number } {
  if (items.length <= n) return { kept: items, otherSum: 0, otherCount: 0 };
  const sorted = items.slice().sort((a, b) => b.amount - a.amount);
  const kept = sorted.slice(0, n - 1);
  const rest = sorted.slice(n - 1);
  return { kept, otherSum: rest.reduce((acc, r) => acc + r.amount, 0), otherCount: rest.length };
}

interface CashflowSankeyProps {
  data: CashflowResponse | null;
  loading?: boolean;
  maxNodesPerLevel?: number;
  onNodeClick?: (node: { id: string; name: string; side: "income" | "expense"; amount: number }) => void;
}

export function CashflowSankey({ data, loading, maxNodesPerLevel = 12, onNodeClick }: CashflowSankeyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ kind: "node" | "link"; id: string; x: number; y: number; html: string } | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(320, Math.floor(e.contentRect.width)));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const built = useMemo(() => (data ? build(data, expanded, maxNodesPerLevel) : null), [data, expanded, maxNodesPerLevel]);

  const layout = useMemo(() => {
    if (!built || built.nodes.length === 0) return null;
    const usedTiers = Array.from(new Set(built.nodes.map((n) => n.tier))).sort((a, b) => a - b);
    const tierToCol = new Map(usedTiers.map((t, i) => [t, i] as const));
    const height = Math.max(420, Math.min(720, 80 + built.nodes.length * 18));

    const sankeyNodes = built.nodes.map((n) => ({ ...n }));
    const sankeyLinks = built.links.map((l) => ({ ...l }));

    const gen = sankey<SankeyNodeIn, SankeyLinkIn>()
      .nodeId((d: any) => d.id)
      .nodeAlign((node: any) => tierToCol.get(node.tier) ?? 0)
      .nodeWidth(14)
      .nodePadding(14)
      .nodeSort((a: any, b: any) => {
        const aBal = a.id === SURPLUS_ID || a.id === SHORTFALL_ID;
        const bBal = b.id === SURPLUS_ID || b.id === SHORTFALL_ID;
        if (aBal !== bBal) return aBal ? 1 : -1;
        return b.amount - a.amount;
      })
      .extent([
        [8, 8],
        [width - 8, height - 8],
      ]);

    const graph = gen({ nodes: sankeyNodes as any, links: sankeyLinks as any });
    return { graph, height, tierToCol, centreCol: tierToCol.get(TIER_CENTRE) ?? 1 };
  }, [built, width]);

  if (loading && !data) {
    return <div ref={containerRef} className="flex h-72 items-center justify-center text-sm text-slate-400">Loading…</div>;
  }
  if (data && data.income.sources.length === 0 && data.expenses.categories.length === 0) {
    return <div ref={containerRef} className="flex h-72 items-center justify-center text-sm text-slate-400">No cashflow in this period.</div>;
  }
  if (!layout || !built) {
    return <div ref={containerRef} className="h-72" />;
  }

  const { graph, height, tierToCol, centreCol } = layout;
  const allNodes = graph.nodes as Array<SankeyNodeIn & { x0: number; x1: number; y0: number; y1: number }>;
  const allLinks = graph.links as Array<{ source: any; target: any; value: number; width: number }>;
  const totalIncome = built.totalIncome;
  const linkPath = sankeyLinkHorizontal();

  // Build hover highlight sets.
  let activeNodes: Set<string> | null = null;
  let activeLinks: Set<number> | null = null;
  if (hover) {
    activeNodes = new Set();
    activeLinks = new Set();
    if (hover.kind === "node") {
      activeNodes.add(hover.id);
      allLinks.forEach((l, i) => {
        const sId = (l.source as any).id;
        const tId = (l.target as any).id;
        if (sId === hover.id || tId === hover.id) {
          activeLinks!.add(i);
          activeNodes!.add(sId);
          activeNodes!.add(tId);
        }
      });
    } else {
      const idx = Number(hover.id);
      const l = allLinks[idx];
      if (l) {
        activeLinks.add(idx);
        activeNodes.add((l.source as any).id);
        activeNodes.add((l.target as any).id);
      }
    }
  }

  const positionTip = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: rect ? clientX - rect.left : clientX, y: rect ? clientY - rect.top : clientY };
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <svg width={width} height={height} className="block">
        <defs>
          {allLinks.map((l, i) => {
            const s = l.source as any;
            const t = l.target as any;
            return (
              <linearGradient key={`g-${i}`} id={`cflink-${i}`} gradientUnits="userSpaceOnUse" x1={s.x1} x2={t.x0} y1={0} y2={0}>
                <stop offset="0%" stopColor={s.color} />
                <stop offset="100%" stopColor={t.color} />
              </linearGradient>
            );
          })}
        </defs>

        {allLinks.map((l, i) => {
          const dim = activeLinks ? !activeLinks.has(i) : false;
          const opacity = dim ? 0.06 : 0.45;
          const s = l.source as any;
          const t = l.target as any;
          const pct = totalIncome > 0 ? Math.round((l.value / totalIncome) * 100) : 0;
          return (
            <path
              key={`l-${i}`}
              d={linkPath(l as any) ?? ""}
              fill="none"
              stroke={`url(#cflink-${i})`}
              strokeWidth={Math.max(1, l.width)}
              opacity={opacity}
              className="cursor-pointer transition-opacity duration-150"
              onMouseMove={(e) => {
                const { x, y } = positionTip(e.clientX, e.clientY);
                setHover({
                  kind: "link",
                  id: String(i),
                  x,
                  y,
                  html: `${s.name} → ${t.name}\n${fmtMoney(l.value)} (${pct}%)`,
                });
              }}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}

        {allNodes.map((n) => {
          const dim = activeNodes ? !activeNodes.has(n.id) : false;
          const isCentre = n.id === TOTAL_NODE_ID;
          const isExpandable = !!n.hasChildren;
          const chev = isExpandable ? (expanded.has(n.id) ? " ▾" : " ▸") : "";
          const pct = totalIncome > 0 ? Math.round((n.amount / totalIncome) * 100) : 0;
          const col = tierToCol.get(n.tier) ?? 0;
          const labelOnRight = !isCentre && col < centreCol;
          const labelX = isCentre ? (n.x0 + n.x1) / 2 : labelOnRight ? n.x1 + 6 : n.x0 - 6;
          const textAnchor: "start" | "end" | "middle" = isCentre ? "middle" : labelOnRight ? "start" : "end";

          return (
            <g
              key={n.id}
              opacity={dim ? 0.3 : 1}
              className="cursor-pointer transition-opacity duration-150"
              onClick={() => {
                if (isExpandable) {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(n.id)) next.delete(n.id);
                    else next.add(n.id);
                    return next;
                  });
                } else if (onNodeClick && (n.side === "income" || n.side === "expense") && !n.id.endsWith("__other__") && n.id !== SURPLUS_ID && n.id !== SHORTFALL_ID) {
                  onNodeClick({ id: n.id, name: n.name, side: n.side, amount: n.amount });
                }
              }}
              onMouseMove={(e) => {
                const { x, y } = positionTip(e.clientX, e.clientY);
                setHover({
                  kind: "node",
                  id: n.id,
                  x,
                  y,
                  html: `${n.name}\n${fmtMoney(n.amount)} (${pct}%)`,
                });
              }}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                x={n.x0}
                y={n.y0}
                width={Math.max(2, n.x1 - n.x0)}
                height={Math.max(1, n.y1 - n.y0)}
                fill={n.color}
                rx={2}
              />
              {isCentre ? (
                <>
                  <text x={labelX} y={n.y0 - 6} textAnchor={textAnchor} className="fill-slate-800 text-[12px] font-semibold">
                    {n.name}
                  </text>
                  <text x={labelX} y={n.y1 + 14} textAnchor={textAnchor} className="fill-slate-500 text-[11px]">
                    {fmtMoney(n.amount)}
                  </text>
                </>
              ) : (
                <>
                  <text
                    x={labelX}
                    y={(n.y0 + n.y1) / 2 - 2}
                    textAnchor={textAnchor}
                    dominantBaseline="middle"
                    className="fill-slate-800 text-[11px] font-semibold"
                  >
                    {n.name}
                    {chev}
                  </text>
                  <text
                    x={labelX}
                    y={(n.y0 + n.y1) / 2 + 11}
                    textAnchor={textAnchor}
                    dominantBaseline="middle"
                    className="fill-slate-500 text-[10px]"
                  >
                    {fmtMoney(n.amount)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-[280px] whitespace-pre-line rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] leading-snug text-slate-700 shadow"
          style={{ left: Math.min(hover.x + 12, width - 220), top: hover.y + 12 }}
        >
          {hover.html}
        </div>
      )}

      <table className="sr-only" aria-label="Cashflow figures">
        <thead>
          <tr><th>Direction</th><th>Name</th><th>Amount</th></tr>
        </thead>
        <tbody>
          {data!.income.sources.map((s) => (
            <tr key={`i-${s.id}`}><td>Income</td><td>{s.name}</td><td>{s.amount}</td></tr>
          ))}
          {data!.expenses.categories.map((c) => (
            <tr key={`e-${c.id}`}><td>Expense</td><td>{c.name}</td><td>{c.amount}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function build(data: CashflowResponse, expanded: Set<string>, n: number): {
  nodes: SankeyNodeIn[];
  links: SankeyLinkIn[];
  totalIncome: number;
} {
  const nodes: SankeyNodeIn[] = [];
  const links: SankeyLinkIn[] = [];

  const totalIncome = data.income.sources.reduce((acc, s) => acc + Number(s.amount), 0);
  const totalExpense = data.expenses.categories.reduce((acc, c) => acc + Number(c.amount), 0);
  const net = totalIncome - totalExpense;
  const isDeficit = net < 0;
  const centreAmount = isDeficit ? totalExpense : totalIncome;

  nodes.push({
    id: TOTAL_NODE_ID,
    name: "Total Income",
    tier: TIER_CENTRE,
    amount: centreAmount,
    side: "centre",
    color: isDeficit ? TOTAL_INCOME_DEFICIT_COLOR : TOTAL_INCOME_COLOR,
  });

  const incomeItems = data.income.sources.map((s) => ({ src: s, amount: Number(s.amount) }));
  const { kept: keptIncome, otherSum: incomeOtherSum, otherCount: incomeOtherCount } = topNWithOther(incomeItems, n);

  let bcColorIdx = 0;
  for (const item of keptIncome) {
    const src = item.src;
    const isBc = src.kind === "billing_company";
    const baseColor = isBc ? INCOME_BC_PALETTE[bcColorIdx++ % INCOME_BC_PALETTE.length] : OTHER_INCOME_COLOR;
    const hasChildren = src.children.length > 0;
    nodes.push({
      id: src.id,
      name: src.name,
      tier: TIER_SOURCE,
      amount: item.amount,
      hasChildren,
      side: "income",
      color: baseColor,
    });
    links.push({ source: src.id, target: TOTAL_NODE_ID, value: item.amount });

    if (hasChildren && expanded.has(src.id)) {
      const childItems = src.children.map((c) => ({ id: c.id, name: c.name, amount: Number(c.amount) }));
      const { kept: keptC, otherSum, otherCount } = topNWithOther(childItems, n);
      for (const c of keptC) {
        nodes.push({
          id: c.id,
          name: c.name,
          tier: TIER_CUSTOMER,
          amount: c.amount,
          side: "income",
          color: lighten(baseColor, 0.3),
        });
        links.push({ source: c.id, target: src.id, value: c.amount });
      }
      if (otherSum > 0) {
        const oid = `${src.id}__other__`;
        nodes.push({
          id: oid,
          name: `Other (${otherCount} items)`,
          tier: TIER_CUSTOMER,
          amount: otherSum,
          side: "income",
          color: lighten(baseColor, 0.5),
        });
        links.push({ source: oid, target: src.id, value: otherSum });
      }
    }
  }
  if (incomeOtherSum > 0) {
    const oid = `oi__other__`;
    nodes.push({
      id: oid,
      name: `Other (${incomeOtherCount} items)`,
      tier: TIER_SOURCE,
      amount: incomeOtherSum,
      side: "income",
      color: OTHER_INCOME_COLOR,
    });
    links.push({ source: oid, target: TOTAL_NODE_ID, value: incomeOtherSum });
  }

  if (isDeficit) {
    nodes.push({
      id: SHORTFALL_ID,
      name: "Shortfall",
      tier: TIER_SOURCE,
      amount: -net,
      side: "income",
      color: SHORTFALL_COLOR,
    });
    links.push({ source: SHORTFALL_ID, target: TOTAL_NODE_ID, value: -net });
  }

  const expItems = data.expenses.categories.map((c) => ({ src: c, amount: Number(c.amount) }));
  const { kept: keptExp, otherSum: expOtherSum, otherCount: expOtherCount } = topNWithOther(expItems, n);

  let expColorIdx = 0;
  for (const item of keptExp) {
    const src = item.src;
    const baseColor = EXPENSE_PALETTE[expColorIdx++ % EXPENSE_PALETTE.length];
    const hasChildren = src.children.length > 0;
    nodes.push({
      id: src.id,
      name: src.name,
      tier: TIER_CATEGORY,
      amount: item.amount,
      hasChildren,
      side: "expense",
      color: baseColor,
    });
    links.push({ source: TOTAL_NODE_ID, target: src.id, value: item.amount });

    if (hasChildren && expanded.has(src.id)) {
      const childItems = src.children.map((c) => ({ id: c.id, name: c.name, amount: Number(c.amount) }));
      const { kept: keptC, otherSum, otherCount } = topNWithOther(childItems, n);
      for (const c of keptC) {
        nodes.push({
          id: c.id,
          name: c.name,
          tier: TIER_SUB,
          amount: c.amount,
          side: "expense",
          color: lighten(baseColor, 0.3),
        });
        links.push({ source: src.id, target: c.id, value: c.amount });
      }
      if (otherSum > 0) {
        const oid = `${src.id}__other__`;
        nodes.push({
          id: oid,
          name: `Other (${otherCount} items)`,
          tier: TIER_SUB,
          amount: otherSum,
          side: "expense",
          color: lighten(baseColor, 0.5),
        });
        links.push({ source: src.id, target: oid, value: otherSum });
      }
    }
  }
  if (expOtherSum > 0) {
    const oid = `cat__other__`;
    nodes.push({
      id: oid,
      name: `Other (${expOtherCount} items)`,
      tier: TIER_CATEGORY,
      amount: expOtherSum,
      side: "expense",
      color: EXPENSE_PALETTE[expColorIdx++ % EXPENSE_PALETTE.length],
    });
    links.push({ source: TOTAL_NODE_ID, target: oid, value: expOtherSum });
  }

  if (!isDeficit && net > 0) {
    nodes.push({
      id: SURPLUS_ID,
      name: "Surplus",
      tier: TIER_CATEGORY,
      amount: net,
      side: "expense",
      color: SURPLUS_COLOR,
    });
    links.push({ source: TOTAL_NODE_ID, target: SURPLUS_ID, value: net });
  }

  return { nodes, links, totalIncome };
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SquaresFour,
  Buildings,
  Users,
  ClipboardText,
  Receipt,
  Invoice,
  ArrowsClockwise,
  Package,
  Wallet,
  Bank,
  ArrowsLeftRight,
  Scales,
  Tag,
  Hash,
  ChartBar,
  FileText,
  GearSix,
  CaretDown,
  Sparkle,
  Coins,
} from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import { reviewQueueCount } from "@/lib/ai";
import { paymentsQueueCount } from "@/lib/payments";
import { cn } from "@/lib/utils";

type Item = { label: string; href: string; icon?: any; badgeKey?: string };
type Group =
  | (Item & { kind: "link" })
  | { kind: "group"; label: string; icon: any; items: Item[]; defaultOpen?: boolean };

const nav: Group[] = [
  { kind: "link", label: "Dashboard", href: "/", icon: SquaresFour },
  { kind: "link", label: "Billing Companies", href: "/companies", icon: Buildings },
  { kind: "link", label: "Customers", href: "/customers", icon: Users },
  { kind: "link", label: "Tasks", href: "/tasks", icon: ClipboardText },
  {
    kind: "group",
    label: "Sales",
    icon: Receipt,
    defaultOpen: true,
    items: [
      { label: "Invoices", href: "/invoices" },
      { label: "Recurring Invoices", href: "/recurring" },
      { label: "Items", href: "/items" },
    ],
  },
  {
    kind: "group",
    label: "Banking",
    icon: Bank,
    defaultOpen: true,
    items: [
      { label: "Accounts", href: "/accounts" },
      { label: "Transactions", href: "/transactions" },
      { label: "Payments", href: "/banking/payments", badgeKey: "paymentsCount" },
      { label: "AI Review", href: "/transactions/ai-review", badgeKey: "aiReviewCount" },
      { label: "Categories", href: "/categories" },
      { label: "Tags", href: "/tags" },
      { label: "Rules", href: "/rules" },
    ],
  },
  {
    kind: "group",
    label: "Reports",
    icon: ChartBar,
    defaultOpen: true,
    items: [
      { label: "Expense Report", href: "/reports/expense" },
      { label: "Income Report", href: "/reports/income" },
      { label: "Tags Report", href: "/reports/tags" },
      { label: "Statements", href: "/statements" },
    ],
  },
  { kind: "link", label: "Settings", href: "/settings", icon: GearSix },
];

const subIcons: Record<string, any> = {
  "/invoices": Invoice,
  "/recurring": ArrowsClockwise,
  "/items": Package,
  "/accounts": Wallet,
  "/transactions": ArrowsLeftRight,
  "/banking/payments": Coins,
  "/transactions/ai-review": Sparkle,
  "/categories": Tag,
  "/tags": Hash,
  "/rules": Scales,
  "/statements": FileText,
  "/reports/expense": ChartBar,
  "/reports/income": ChartBar,
  "/reports/tags": Hash,
};

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-[240px] md:flex-col bg-[#323D59] text-slate-100">
      <SidebarBody />
    </aside>
  );
}

export function SidebarBody({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  const [aiReviewCount, setAiReviewCount] = useState<number>(0);
  const [paymentsCount, setPaymentsCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void reviewQueueCount().then((r) => { if (!cancelled) setAiReviewCount(r.count); }).catch(() => {});
      void paymentsQueueCount().then((r) => { if (!cancelled) setPaymentsCount(r.count); }).catch(() => {});
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <>
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <img
          src="/simplebooks-wordmark.svg"
          alt="$impleBooks"
          className="select-none"
          style={{ height: 28, width: "auto" }}
          draggable={false}
        />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm">
        {nav.map((entry, i) =>
          entry.kind === "link" ? (
            <NavLink key={i} item={entry} active={pathname === entry.href} onNavigate={onNavigate} />
          ) : (
            <NavGroup key={i} group={entry} pathname={pathname} onNavigate={onNavigate} aiReviewCount={aiReviewCount} paymentsCount={paymentsCount} />
          )
        )}
      </nav>
    </>
  );
}

function NavLink({ item, active, onNavigate }: { item: Item & { icon?: any }; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium transition-colors",
        active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
      )}
    >
      {Icon ? <Icon weight="fill" className={cn("h-4 w-4", active ? "text-white" : "text-slate-400")} /> : null}
      <span>{item.label}</span>
    </Link>
  );
}

function NavGroup({ group, pathname, onNavigate, aiReviewCount, paymentsCount }: { group: Extract<Group, { kind: "group" }>; pathname: string; onNavigate?: () => void; aiReviewCount?: number; paymentsCount?: number }) {
  const isOpenByDefault = group.defaultOpen || group.items.some((i) => i.href === pathname);
  const [open, setOpen] = useState(isOpenByDefault);
  const Icon = group.icon;
  return (
    <div className="mt-0.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2 font-medium text-slate-300 hover:bg-white/[0.06] hover:text-white"
      >
        <span className="flex items-center gap-2.5">
          <Icon weight="fill" className="h-4 w-4 text-slate-400" />
          {group.label}
        </span>
        <CaretDown
          weight="fill"
          className={cn("h-3 w-3 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="ml-3 mt-0.5 border-l border-white/10 pl-3">
          {group.items.map((item) => {
            const SubIcon = subIcons[item.href];
            const active = pathname === item.href;
            const badgeCount =
              item.badgeKey === "aiReviewCount"
                ? (aiReviewCount ?? 0)
                : item.badgeKey === "paymentsCount"
                ? (paymentsCount ?? 0)
                : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[15px] text-slate-300 transition-colors",
                  active ? "bg-white/10" : "hover:bg-white/[0.04]"
                )}
              >
                {SubIcon ? <SubIcon weight="fill" className={cn("h-3.5 w-3.5", active ? "text-white" : "text-slate-300/80")} /> : null}
                <span>{item.label}</span>
                {badgeCount > 0 && (
                  <span className="ml-auto rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}


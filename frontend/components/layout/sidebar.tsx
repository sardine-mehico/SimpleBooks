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
  Storefront,
  ChartBar,
  FileText,
  GearSix,
  CaretDown,
  Sparkle,
} from "@phosphor-icons/react";
import { useState, useEffect } from "react";
import { reviewQueueCount } from "@/lib/ai";
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
      { label: "AI Review", href: "/transactions/ai-review", badgeKey: "aiReviewCount" },
      { label: "Categories", href: "/categories" },
      { label: "Vendors", href: "/vendors" },
      { label: "Rules", href: "/rules" },
    ],
  },
  {
    kind: "group",
    label: "Reports",
    icon: ChartBar,
    items: [{ label: "Statements", href: "/statements" }],
  },
  { kind: "link", label: "Settings", href: "/settings", icon: GearSix },
];

const subIcons: Record<string, any> = {
  "/invoices": Invoice,
  "/recurring": ArrowsClockwise,
  "/items": Package,
  "/accounts": Wallet,
  "/transactions": ArrowsLeftRight,
  "/transactions/ai-review": Sparkle,
  "/categories": Tag,
  "/vendors": Storefront,
  "/rules": Scales,
  "/statements": FileText,
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

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void reviewQueueCount().then((r) => { if (!cancelled) setAiReviewCount(r.count); }).catch(() => {});
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <>
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
        <AppLogo />
        <div className="leading-none">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300/70">SIMPLE</div>
          <div className="text-sm font-semibold tracking-tight text-white">BOOKS</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm">
        {nav.map((entry, i) =>
          entry.kind === "link" ? (
            <NavLink key={i} item={entry} active={pathname === entry.href} onNavigate={onNavigate} />
          ) : (
            <NavGroup key={i} group={entry} pathname={pathname} onNavigate={onNavigate} aiReviewCount={aiReviewCount} />
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

function NavGroup({ group, pathname, onNavigate, aiReviewCount }: { group: Extract<Group, { kind: "group" }>; pathname: string; onNavigate?: () => void; aiReviewCount?: number }) {
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
            const badgeCount = item.badgeKey === "aiReviewCount" ? (aiReviewCount ?? 0) : 0;
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

function AppLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 300 300"
      className="h-8 w-8"
      aria-label="SimpleBooks"
    >
      <path
        fill="#616a7f"
        d="M247.47 300H52.53C23.52 300 0 276.48 0 247.47V52.53C0 23.52 23.52 0 52.53 0h194.94C276.48 0 300 23.52 300 52.53v194.94c0 29.01-23.52 52.53-52.53 52.53z"
      />
      <path
        fill="#465069"
        d="M247.47 283.78H52.53C23.52 283.78 0 260.26 0 231.25V52.53C0 23.52 23.52 0 52.53 0h194.94C276.48 0 300 23.52 300 52.53v178.72c0 29.01-23.52 52.53-52.53 52.53z"
      />
      <path
        fill="#ffffff"
        d="M85.92 213.11c-1.18-4.72 11.8-42.96 14.63-42.01 4.96 1.65 24.31 14.63 43.66 14.63 10.62 0 15.81-2.6 15.81-7.79 0-4.72-2.83-8.73-24.31-12.75-30.45-5.67-48.86-19.83-48.86-54.05 0-28.09 22.89-52.16 65.38-52.16 25.73 0 48.86 6.14 58.06 13.22 3.54 2.6-12.98 40.36-15.58 40.6-1.65.47-20.53-9.21-41.54-9.21-10.39 0-14.63 2.83-14.63 6.84 0 5.9 3.78 7.08 23.84 11.33 27.62 5.9 53.34 17.47 53.34 53.11 0 23.37-18.41 53.1-69.39 53.1-26.42.01-50.97-8.96-60.41-14.86z"
      />
    </svg>
  );
}

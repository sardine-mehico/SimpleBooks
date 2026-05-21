"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GearSix,
  ShieldCheck,
  Percent,
  EnvelopeSimple,
  Users,
  PaperPlaneTilt,
  BracketsCurly,
  Repeat,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type SettingsSection = {
  href: string;
  label: string;
  icon: any;
};

export const sections: SettingsSection[] = [
  { href: "/settings/preferences", label: "Preferences", icon: GearSix },
  { href: "/settings/roles", label: "Roles", icon: ShieldCheck },
  { href: "/settings/tax-types", label: "Tax Types", icon: Percent },
  { href: "/settings/recurring-schedules", label: "Recurring Schedules", icon: Repeat },
  { href: "/settings/dynamic-fields", label: "Dynamic Fields", icon: BracketsCurly },
  { href: "/settings/mail-configuration", label: "Mail Configuration", icon: EnvelopeSimple },
  { href: "/settings/users", label: "Users", icon: Users },
  { href: "/settings/telegram", label: "Telegram", icon: PaperPlaneTilt },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="w-[184px] shrink-0">
      <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {sections.map((s) => {
          const Icon = s.icon;
          const active = pathname === s.href || pathname.startsWith(s.href + "/");
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                className={cn(
                  "flex items-center gap-2.5 border-l-2 px-3.5 py-2.5 text-sm transition-colors",
                  active
                    ? "border-indigo-600 bg-indigo-50/60 font-medium text-indigo-700"
                    : "border-transparent text-slate-600 hover:bg-slate-50"
                )}
              >
                <Icon
                  weight="fill"
                  className={cn("h-4 w-4", active ? "text-indigo-600" : "text-slate-400")}
                />
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

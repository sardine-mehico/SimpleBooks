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
  Bank,
  FileText,
  Robot,
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
  { href: "/settings/account-types", label: "Account Types", icon: Bank },
  { href: "/settings/import-logs", label: "Import Logs", icon: FileText },
  { href: "/settings/ai-setup", label: "AI Setup", icon: Robot },
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
    <nav className="w-full shrink-0 md:w-[184px]">
      <ul className="overflow-hidden rounded-lg bg-[#323D59] p-2 text-sm text-slate-100">
        {sections.map((s) => {
          const Icon = s.icon;
          const active = pathname === s.href || pathname.startsWith(s.href + "/");
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 font-medium transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                )}
              >
                <Icon
                  weight="fill"
                  className={cn("h-4 w-4", active ? "text-white" : "text-slate-400")}
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

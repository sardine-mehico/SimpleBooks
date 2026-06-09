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
  Key,
  ListMagnifyingGlass,
  Broom,
  TextAlignLeft,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useCapabilities } from "@/lib/use-current-user";
import type { Capability } from "@/lib/capabilities";

export type SettingsSection = {
  href: string;
  label: string;
  icon: any;
  cap?: Capability;
};

export const sections: SettingsSection[] = [
  { href: "/settings/preferences", label: "Preferences", icon: GearSix, cap: "settings.preferences" },
  { href: "/settings/roles", label: "Roles", icon: ShieldCheck, cap: "settings.roles" },
  { href: "/settings/account-types", label: "Account Types", icon: Bank },
  { href: "/settings/import-logs", label: "Import Logs", icon: FileText },
  { href: "/settings/ai-setup", label: "AI Setup", icon: Robot, cap: "settings.ai_setup" },
  { href: "/settings/tax-types", label: "Tax Types", icon: Percent, cap: "settings.tax_types" },
  { href: "/settings/recurring-schedules", label: "Recurring Schedules", icon: Repeat },
  { href: "/settings/terms", label: "Terms", icon: TextAlignLeft, cap: "settings.terms" },
  { href: "/settings/dynamic-fields", label: "Dynamic Fields", icon: BracketsCurly },
  { href: "/settings/mail-configuration", label: "Mail Configuration", icon: EnvelopeSimple, cap: "settings.mail_config" },
  { href: "/settings/users", label: "Users", icon: Users, cap: "settings.users" },
  { href: "/settings/api-keys", label: "API Keys", icon: Key, cap: "settings.api_keys" },
  { href: "/settings/audit", label: "Audit Log", icon: ListMagnifyingGlass, cap: "settings.audit" },
  { href: "/settings/data-retention", label: "Data Retention", icon: Broom, cap: "settings.data_retention" },
  { href: "/settings/telegram", label: "Telegram", icon: PaperPlaneTilt, cap: "settings.telegram" },
];

export function SettingsNav() {
  const pathname = usePathname();
  const capabilities = useCapabilities();
  const visible = sections.filter(
    (s) => !s.cap || capabilities === null || capabilities[s.cap] === true,
  );
  return (
    <nav className="w-full shrink-0 md:w-[184px]">
      <ul className="overflow-hidden rounded-lg bg-[#323D59] p-2 text-sm text-slate-100">
        {visible.map((s) => {
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

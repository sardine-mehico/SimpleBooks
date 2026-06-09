// Mirror of backend/src/auth/capabilities.ts. Keep in sync when capabilities
// are added or per-role defaults change.

import type { AuthUser } from "./auth";

export type Capability =
  | "nav.dashboard"
  | "nav.cashflow"
  | "nav.income_report"
  | "nav.expense_report"
  | "nav.tags_report"
  | "nav.statements"
  | "nav.invoices"
  | "nav.recurring"
  | "nav.items"
  | "nav.companies"
  | "nav.customers"
  | "nav.tasks"
  | "nav.accounts"
  | "nav.transactions"
  | "nav.payments"
  | "nav.ai_review"
  | "nav.categories"
  | "nav.tags"
  | "nav.rules"
  | "settings.preferences"
  | "settings.email"
  | "settings.invoice_templates"
  | "settings.tax_types"
  | "settings.ai_setup"
  | "settings.mail_config"
  | "settings.telegram"
  | "settings.users"
  | "settings.roles"
  | "settings.api_keys"
  | "settings.audit"
  | "settings.data_retention"
  | "settings.terms"
  | "action.delete"
  | "action.export"
  | "action.docs_access";

export const ALL_CAPABILITIES: Capability[] = [
  "nav.dashboard", "nav.cashflow", "nav.income_report", "nav.expense_report", "nav.tags_report",
  "nav.statements", "nav.invoices", "nav.recurring", "nav.items", "nav.companies", "nav.customers",
  "nav.tasks", "nav.accounts", "nav.transactions", "nav.payments", "nav.ai_review", "nav.categories",
  "nav.tags", "nav.rules",
  "settings.preferences", "settings.email", "settings.invoice_templates", "settings.tax_types",
  "settings.ai_setup", "settings.mail_config", "settings.telegram", "settings.users", "settings.roles",
  "settings.api_keys", "settings.audit", "settings.data_retention", "settings.terms",
  "action.delete", "action.export", "action.docs_access",
];

function adminCaps(): Record<Capability, boolean> {
  const out = {} as Record<Capability, boolean>;
  for (const c of ALL_CAPABILITIES) out[c] = true;
  return out;
}
function accountantCaps(): Record<Capability, boolean> {
  const out = adminCaps();
  out["action.delete"] = false;
  out["settings.ai_setup"] = false;
  out["settings.mail_config"] = false;
  out["settings.telegram"] = false;
  out["settings.users"] = false;
  out["settings.roles"] = false;
  out["settings.api_keys"] = false;
  out["settings.audit"] = false;
  out["settings.data_retention"] = false;
  // Terms denied to accountant only (v0.12.0).
  out["settings.terms"] = false;
  return out;
}
function bookkeeperCaps(): Record<Capability, boolean> {
  const out = adminCaps();
  out["nav.dashboard"] = false;
  out["nav.cashflow"] = false;
  out["nav.income_report"] = false;
  out["action.delete"] = false;
  out["action.export"] = false;
  out["action.docs_access"] = false;
  out["settings.preferences"] = false;
  out["settings.ai_setup"] = false;
  out["settings.mail_config"] = false;
  out["settings.telegram"] = false;
  out["settings.users"] = false;
  out["settings.roles"] = false;
  out["settings.api_keys"] = false;
  out["settings.audit"] = false;
  out["settings.data_retention"] = false;
  return out;
}

function apiUserCaps(): Record<Capability, boolean> {
  // Same posture as accountant except Terms — admins, bookkeepers, AND
  // API users can edit; accountants cannot (v0.12.0).
  const out = accountantCaps();
  out["settings.terms"] = true;
  return out;
}

export function capabilitiesForRole(role: AuthUser["role"]): Record<Capability, boolean> {
  switch (role) {
    case "ADMIN": return adminCaps();
    case "ACCOUNTANT": return accountantCaps();
    case "BOOKKEEPER": return bookkeeperCaps();
    case "API_USER": return apiUserCaps();
  }
}

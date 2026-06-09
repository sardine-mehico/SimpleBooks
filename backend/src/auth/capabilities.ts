// Single source of truth for capability keys + per-role default grants.
// Frontend mirrors this list in lib/capabilities.ts; keep them in sync.
//
// A "capability" is a stable string key that names a slice of behaviour the
// role override matrix can later flip on/off. Backend uses capabilities for
// route guards via @Capability(); frontend uses them for <Can c="..."> gating.

import { UserRole } from '@prisma/client';

export type Capability =
  // Sidebar / page-level access. Backend doesn't typically enforce these
  // (they're navigation hints), but the matrix surfaces them so admins can
  // hide whole sections from a role.
  | 'nav.dashboard'
  | 'nav.cashflow'
  | 'nav.income_report'
  | 'nav.expense_report'
  | 'nav.tags_report'
  | 'nav.statements'
  | 'nav.invoices'
  | 'nav.recurring'
  | 'nav.items'
  | 'nav.companies'
  | 'nav.customers'
  | 'nav.tasks'
  | 'nav.accounts'
  | 'nav.transactions'
  | 'nav.payments'
  | 'nav.ai_review'
  | 'nav.categories'
  | 'nav.tags'
  | 'nav.rules'
  // Settings sub-sections.
  | 'settings.preferences'
  | 'settings.email'
  | 'settings.invoice_templates'
  | 'settings.tax_types'
  | 'settings.ai_setup'
  | 'settings.mail_config'
  | 'settings.telegram'
  | 'settings.users'
  | 'settings.roles'
  | 'settings.api_keys'
  | 'settings.audit'
  | 'settings.data_retention'
  | 'settings.terms'
  // Cross-cutting actions.
  | 'action.delete'        // any DELETE-method endpoint
  | 'action.export'        // CSV / Excel / PDF download buttons
  | 'action.docs_access';  // GET /docs (Swagger UI)

export const ALL_CAPABILITIES: Capability[] = [
  'nav.dashboard', 'nav.cashflow', 'nav.income_report', 'nav.expense_report', 'nav.tags_report',
  'nav.statements', 'nav.invoices', 'nav.recurring', 'nav.items', 'nav.companies', 'nav.customers',
  'nav.tasks', 'nav.accounts', 'nav.transactions', 'nav.payments', 'nav.ai_review', 'nav.categories',
  'nav.tags', 'nav.rules',
  'settings.preferences', 'settings.email', 'settings.invoice_templates', 'settings.tax_types',
  'settings.ai_setup', 'settings.mail_config', 'settings.telegram', 'settings.users', 'settings.roles',
  'settings.api_keys', 'settings.audit', 'settings.data_retention', 'settings.terms',
  'action.delete', 'action.export', 'action.docs_access',
];

// Default capability set per role — applied unless a RoleOverride row says
// otherwise (Phase 4 wires the override matrix).
//
// ADMIN: everything.
// ACCOUNTANT: full nav + export + docs; no delete; no settings.users/roles/
//   telegram/ai_setup/mail_config; admin-only sections (api_keys/audit/
//   data_retention) hidden.
// BOOKKEEPER: tightest UI. No dashboard, no cashflow, no income report; no
//   export; no delete; settings restricted to email/invoice_templates/
//   tax_types only.
// API_USER: same posture as accountant; primarily authenticates programmatically
//   via Bearer key, but the role still produces a sensible UI if they ever
//   log in.

function adminCaps(): Record<Capability, boolean> {
  const out = {} as Record<Capability, boolean>;
  for (const c of ALL_CAPABILITIES) out[c] = true;
  return out;
}

function accountantCaps(): Record<Capability, boolean> {
  const out = adminCaps();
  out['action.delete'] = false;
  out['settings.ai_setup'] = false;
  out['settings.mail_config'] = false;
  out['settings.telegram'] = false;
  out['settings.users'] = false;
  out['settings.roles'] = false;
  out['settings.api_keys'] = false;
  out['settings.audit'] = false;
  out['settings.data_retention'] = false;
  // Terms is deliberately denied to accountants (v0.12.0). Admins,
  // bookkeepers, and API users can edit; accountants cannot.
  out['settings.terms'] = false;
  return out;
}

function bookkeeperCaps(): Record<Capability, boolean> {
  const out = adminCaps();
  out['nav.dashboard'] = false;
  out['nav.cashflow'] = false;
  out['nav.income_report'] = false;
  out['action.delete'] = false;
  out['action.export'] = false;
  out['action.docs_access'] = false;
  out['settings.preferences'] = false;
  out['settings.ai_setup'] = false;
  out['settings.mail_config'] = false;
  out['settings.telegram'] = false;
  out['settings.users'] = false;
  out['settings.roles'] = false;
  out['settings.api_keys'] = false;
  out['settings.audit'] = false;
  out['settings.data_retention'] = false;
  return out;
}

function apiUserCaps(): Record<Capability, boolean> {
  // Identical to accountant — same posture, different authentication path.
  // Exception (v0.12.0): API users CAN edit Terms (admins + bookkeepers +
  // API users are allowed; accountants are not), so flip it back on.
  const out = accountantCaps();
  out['settings.terms'] = true;
  return out;
}

export const DEFAULT_CAPABILITIES_BY_ROLE: Record<UserRole, Record<Capability, boolean>> = {
  ADMIN: adminCaps(),
  ACCOUNTANT: accountantCaps(),
  BOOKKEEPER: bookkeeperCaps(),
  API_USER: apiUserCaps(),
};

// Resolve the effective capability set for a role. Phase 4 will layer
// RoleOverride rows on top of this; for now it just returns the defaults.
export function capabilitiesForRole(role: UserRole): Record<Capability, boolean> {
  return DEFAULT_CAPABILITIES_BY_ROLE[role];
}

export function hasCapability(role: UserRole, capability: Capability): boolean {
  return capabilitiesForRole(role)[capability] === true;
}

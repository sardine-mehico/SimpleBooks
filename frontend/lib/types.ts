export type PaymentTerms = "IN_28_DAYS" | "IN_15_DAYS" | "IN_7_DAYS" | "DUE_ON_RECEIPT";
export const PAYMENT_TERMS: { value: PaymentTerms; label: string }[] = [
  { value: "IN_28_DAYS", label: "Net 28 days" },
  { value: "IN_15_DAYS", label: "Net 15 days" },
  { value: "IN_7_DAYS", label: "Net 7 days" },
  { value: "DUE_ON_RECEIPT", label: "Due on receipt" },
];

export type InvoiceStatus =
  | "DRAFT"
  | "SENT"
  | "VIEWED"
  | "PARTIAL_PAID"
  | "PAID"
  | "VOID"
  | "FAILED_TO_SEND";
export const INVOICE_STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "VIEWED", label: "Viewed" },
  { value: "PARTIAL_PAID", label: "Partial paid" },
  { value: "PAID", label: "Paid" },
  { value: "VOID", label: "Voided" },
  { value: "FAILED_TO_SEND", label: "Failed to send" },
];

export const STATUS_TONE: Record<
  InvoiceStatus,
  "draft" | "pending" | "partial" | "progress" | "completed" | "cancelled" | "overdue"
> = {
  DRAFT: "draft",
  SENT: "pending",
  VIEWED: "progress",
  PARTIAL_PAID: "partial",
  PAID: "completed",
  VOID: "cancelled",
  // Reuses the existing rose-50 / rose-700 "overdue" tone so the failed state
  // is visually loud without introducing a new palette entry.
  FAILED_TO_SEND: "overdue",
};

export type Customer = {
  id: string;
  customerNumber: number;
  name: string;
  billingEmail1?: string | null;
  billingEmail2?: string | null;
  billingCompanyId?: string | null;
  billingCompany?: BillingCompany | null;
  paymentTerms: PaymentTerms;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
};

export type SendVia = "GENERAL_SMTP" | "CUSTOM_SMTP";

export type BillingCompany = {
  id: string;
  name: string;
  abn?: string | null;
  address?: string | null;
  paymentDetails?: string | null;
  accountsEmail?: string | null;
  invoiceBcc: string;
  notes?: string | null;
  isActive: boolean;
  deactivatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  sendVia: SendVia;
  customSmtpServer?: string | null;
  customSmtpPort?: number | null;
  customSmtpEncryption?: EmailEncryption | null;
  customSmtpUser?: string | null;
  customSmtpPassword?: string | null;
  // Rotation-based template assignment (computed at create-time). Read-only.
  creationOrder?: number | null;
  invoiceTemplateId?: string | null;
  emailTemplateId?: string | null;
};

export type Item = {
  id: string;
  name: string;
  unitPrice: string | number;
  description?: string | null;
  isActive: boolean;
};

export type InvoiceLineItem = {
  id?: string;
  itemId?: string | null;
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  lineAmount?: string | number;
  taxTypeId?: string | null;
  taxName?: string | null;
  taxRate?: string | number | null;
  taxAmount?: string | number;
  position?: number;
};

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  dueDate?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceTemplate = {
  id: string;
  name: string;
  templateKey: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  templateKey: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Preferences = {
  id: string;
  timezone: string;
  financialYearStart: number;
  updatedAt: string;
};

export type TaxType = {
  id: string;
  name: string;
  rate: string | number;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RecurringIntervalUnit = "DAYS" | "WEEKS" | "MONTHS" | "YEARS";
export const RECURRING_INTERVAL_UNITS: { value: RecurringIntervalUnit; label: string }[] = [
  { value: "DAYS", label: "Day(s)" },
  { value: "WEEKS", label: "Week(s)" },
  { value: "MONTHS", label: "Month(s)" },
  { value: "YEARS", label: "Year(s)" },
];

export type SendingOption = "REVIEW_BEFORE_SENDING" | "SEND_DIRECTLY";
export const SENDING_OPTIONS: { value: SendingOption; label: string }[] = [
  { value: "REVIEW_BEFORE_SENDING", label: "Review before sending" },
  { value: "SEND_DIRECTLY", label: "Send directly to client" },
];

export type RecurringSchedule = {
  id: string;
  name: string;
  intervalUnit: RecurringIntervalUnit;
  intervalCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RecurringRuleLineItem = {
  id?: string;
  itemId?: string | null;
  description: string;
  unitPrice: string | number;
  taxTypeId?: string | null;
  taxName?: string | null;
  taxRate?: string | number | null;
  position?: number;
};

export type RecurringRule = {
  id: string;
  scheduleName: string;
  startDate: string;
  recurringScheduleId?: string | null;
  recurringSchedule?: RecurringSchedule | null;
  sendingOption: SendingOption;
  active: boolean;
  nextRunAt: string;
  customerId?: string | null;
  customer?: Customer | null;
  billingCompanyId?: string | null;
  billingCompany?: BillingCompany | null;
  poNumber?: string | null;
  paymentDetails?: string | null;
  internalNotes?: string | null;
  terms?: string | null;
  lineItems?: RecurringRuleLineItem[];
  createdAt: string;
  updatedAt: string;
};

export type EmailEncryption = "NONE" | "SSL" | "TLS" | "STARTTLS";
export const EMAIL_ENCRYPTIONS: { value: EmailEncryption; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "SSL", label: "SSL" },
  { value: "TLS", label: "TLS" },
  { value: "STARTTLS", label: "STARTTLS" },
];

export type MailConfiguration = {
  id: string;
  smtpServer: string;
  port: number;
  encryption: EmailEncryption;
  user: string;
  password: string;
  updatedAt: string;
};


export type Invoice = {
  id: string;
  invoiceNumber: number;
  invoiceDate: string;
  dueDate?: string | null;
  customerId?: string | null;
  customer?: Customer | null;
  billingCompanyId?: string | null;
  billingCompany?: BillingCompany | null;
  status: InvoiceStatus;
  subtotal: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  amountPaid: string;
  amountOutstanding: string;
  poNumber?: string | null;
  paymentDetails?: string | null;
  internalNotes?: string | null;
  terms?: string | null;
  lineItems?: InvoiceLineItem[];
  // Template snapshot (copied from the billing company at creation).
  invoiceTemplateId?: string | null;
  emailTemplateId?: string | null;
  sendAttempts?: number;
  sendError?: string | null;
  lastSendAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

// Pre-fill payload for the Send Invoice dialog, returned from
// GET /invoices/:id/send-context. Every value is already token-substituted
// against this invoice's context; the dialog opens these in editable form.
export type InvoiceSendContext = {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  html: string;
  templateName: string | null;
};

// ── Banking ─────────────────────────────────────────────────────────────────

export type AccountType = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Account = {
  id: string;
  name: string;
  bank: string;
  accountNumber?: string | null;
  accountTypeId: string;
  accountType?: AccountType;
  openingBalance: string;
  openingDate: string;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Computed (list + detail include these).
  currentBalance?: string;
  _count?: { transactions: number; imports?: number };
  latestImport?: { id: string; importedAt: string; rowsImported: number } | null;
};

export type Transaction = {
  id: string;
  accountId: string;
  account?: { id: string; name: string };
  date: string;
  amount: string;
  description: string;
  runningBalance?: string | null;
  importHash: string;
  importId?: string | null;
  categoryId?: string | null;
  vendorCustomerId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string; kind: CategoryKind } | null;
  vendor?: { id: string; name: string } | null;
  splits?: Array<{ id: string; categoryId: string; amount: string | number; notes?: string | null }>;
};

export type TransactionListResponse = {
  items: Transaction[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type ColumnRole =
  | 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'balance' | 'ignore';
export const COLUMN_ROLES: { value: ColumnRole; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount (signed)' },
  { value: 'debit', label: 'Debit' },
  { value: 'credit', label: 'Credit' },
  { value: 'balance', label: 'Balance' },
  { value: 'ignore', label: 'Ignore' },
];
export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (AU)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
];

export type ColumnMapping = {
  hasHeader: boolean;
  dateFormat: DateFormat;
  columns: ColumnRole[];
};

export type MappingSuggestion = {
  mapping: ColumnMapping;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string[];
};

export type SniffResponse = {
  previewRows: string[][];
  suggestedMapping: MappingSuggestion;
  fileSha256: string;
  alreadyImportedAs?: string;
  fileSize: number;
  filename: string;
};

export type ImportReport = {
  importId: string;
  accountId: string;
  accountName: string;
  filename: string;
  fileSize: number;
  fileSha256: string;
  importedAt: string;
  mapping: ColumnMapping;
  counts: { total: number; imported: number; duplicates: number; failed: number };
  imported: Array<{ date: string; amount: string; description: string }>;
  duplicates: Array<{
    date: string;
    amount: string;
    description: string;
    existingTransactionId: string;
  }>;
  failed: Array<{ rowIndex: number; reason: string; raw: string[] }>;
  warnings: string[];
  ruleCategorisation?: {
    enabled: boolean;
    vendorMatched: number;
    ruleMatched: number;
    perRule: Array<{ ruleId: string; ruleName: string; categoryName: string; count: number }>;
    ambiguousVendor: number;
  } | null;
};

export type ImportLogSummary = {
  id: string;
  accountId: string;
  account: { id: string; name: string };
  filename: string;
  fileSize: number;
  importedAt: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkippedDup: number;
  rowsFailed: number;
};

export type ImportLogFull = ImportLogSummary & {
  reportJson: ImportReport;
  mappingJson: ColumnMapping;
  fileSha256: string;
};

// ── Banking Phase B ────────────────────────────────────────────────────

export type CategoryKind = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'OTHER';
export const CATEGORY_KINDS: { value: CategoryKind; label: string; tone: string }[] = [
  { value: 'INCOME', label: 'Income', tone: 'bg-emerald-100 text-emerald-900' },
  { value: 'EXPENSE', label: 'Expense', tone: 'bg-red-100 text-red-900' },
  { value: 'TRANSFER', label: 'Transfer', tone: 'bg-blue-100 text-blue-900' },
  { value: 'OTHER', label: 'Other', tone: 'bg-slate-100 text-slate-800' },
];

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count?: { transactions: number; transactionSplits?: number; rules?: number };
};

export type VendorKind = 'MERCHANT' | 'PERSON' | 'CUSTOMER' | 'BANK' | 'OTHER';
export const VENDOR_KINDS: { value: VendorKind; label: string }[] = [
  { value: 'MERCHANT', label: 'Merchant' },
  { value: 'PERSON', label: 'Person' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'BANK', label: 'Bank' },
  { value: 'OTHER', label: 'Other' },
];

export type Vendor = {
  id: string;
  name: string;
  kind: VendorKind;
  aliases: string[];
  notes?: string | null;
  isActive: boolean;
  customerId: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { transactions: number };
};

export type RuleState = 'USER' | 'AI_DRAFTED' | 'APPROVED' | 'DENIED';
export const RULE_STATES: { value: RuleState; label: string }[] = [
  { value: 'USER', label: 'User' },
  { value: 'AI_DRAFTED', label: 'AI Drafts' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'DENIED', label: 'Denied' },
];

export type RuleField = 'DESCRIPTION' | 'AMOUNT' | 'VENDOR' | 'ACCOUNT';
export const RULE_FIELDS: { value: RuleField; label: string }[] = [
  { value: 'DESCRIPTION', label: 'Description' },
  { value: 'AMOUNT', label: 'Amount' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'ACCOUNT', label: 'Account' },
];

export type RuleOperator = 'CONTAINS' | 'EQUALS' | 'STARTS_WITH' | 'ENDS_WITH' | 'GT' | 'LT' | 'BETWEEN' | 'IN';
export const OPERATORS_BY_FIELD: Record<RuleField, { value: RuleOperator; label: string }[]> = {
  DESCRIPTION: [
    { value: 'CONTAINS', label: 'contains' },
    { value: 'EQUALS', label: 'equals' },
    { value: 'STARTS_WITH', label: 'starts with' },
    { value: 'ENDS_WITH', label: 'ends with' },
  ],
  AMOUNT: [
    { value: 'EQUALS', label: '=' },
    { value: 'GT', label: '>' },
    { value: 'LT', label: '<' },
    { value: 'BETWEEN', label: 'between' },
  ],
  VENDOR: [
    { value: 'EQUALS', label: 'is' },
    { value: 'IN', label: 'is one of' },
  ],
  ACCOUNT: [
    { value: 'EQUALS', label: 'is' },
    { value: 'IN', label: 'is one of' },
  ],
};

export type RuleCondition = {
  field: RuleField;
  operator: RuleOperator;
  value: string;
  value2?: string | null;
  valueList?: string[];
  position?: number;
};

export type Rule = {
  id: string;
  name: string;
  state: RuleState;
  isActive: boolean;
  priority: number;
  categoryId: string;
  category?: { id: string; name: string; kind: CategoryKind };
  vendorId?: string | null;
  vendor?: { id: string; name: string } | null;
  noteOnApply?: string | null;
  hitCount: number;
  lastFiredAt?: string | null;
  conditions: RuleCondition[];
  createdAt: string;
  updatedAt: string;
};

export type VendorExtractionCandidate = {
  suggestedName: string;
  aliases: string[];
  matchCount: number;
  sampleDescriptions: string[];
  existsAs: string | null;
  suggestedKind: VendorKind;
};

export type EngineRowResult = {
  transactionId: string;
  date: string;
  amount: string;
  description: string;
  vendorMatch: { vendorId: string; vendorName: string } | null;
  vendorMatchAmbiguous: boolean;
  ruleMatch: { ruleId: string; ruleName: string; priority: number; categoryId: string; categoryName: string } | null;
  allMatchingRules: Array<{ ruleId: string; ruleName: string; priority: number }>;
  skipped: 'has-splits' | 'no-rule-match' | null;
};

export type EngineOutput = {
  rows: EngineRowResult[];
  stats: {
    total: number;
    vendorMatched: number;
    ruleMatched: number;
    preservedSplits: number;
    unchanged: number;
    perRule: Array<{ ruleId: string; ruleName: string; count: number }>;
  };
};

export type TransactionSplit = {
  id?: string;
  categoryId: string;
  category?: Category;
  amount: string | number;
  notes?: string | null;
  position?: number;
};

export type CategorisationEvent = {
  id: string;
  transactionId: string;
  source: 'USER' | 'RULE' | 'VENDOR_MATCH' | 'AI_DRAFT' | 'AI_APPLIED';
  ruleId?: string | null;
  rule?: { id: string; name: string } | null;
  oldCategoryId?: string | null;
  newCategoryId?: string | null;
  oldVendorId?: string | null;
  newVendorId?: string | null;
  acceptedAiSuggestion?: boolean | null;
  createdAt: string;
};

export type AiProvider = {
  id: string;
  name: string;
  model: string;
  apiBaseUrl: string;
  apiKey: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AiConfidence = 'high' | 'med' | 'low';

export interface AiDraftView {
  eventId: string;
  categoryId: string | null;
  categoryName: string | null;
  vendorId: string | null;
  vendorName: string | null;
  confidence: AiConfidence;
  reasoning: string;
  providerId: string | null;
  createdAt: string;
}

export type SuggestResult =
  | { kind: 'fresh'; draft: AiDraftView }
  | { kind: 'cached'; draft: AiDraftView }
  | { kind: 'failed'; error: string };

export interface BulkRunStatus {
  runId: string; totalQueued: number; done: number;
  ok: number; cached: number; failed: number; cancelled: boolean;
  lastError: string | null;
}

export interface MineRulesResult {
  drafted: number; skippedSuppressed: number; clustersConsidered: number; failed: number;
}

// === Payments (Phase D) ===

export type Allocation = {
  id: string;
  transactionId: string;
  invoiceId: string;
  amount: string;        // Decimal as string
  createdAt: string;
};

export type AllocationEvent = {
  id: string;
  eventType: 'CREATED' | 'DELETED';
  transactionId: string;
  invoiceId: string;
  amount: string;
  invoiceStatusBefore: InvoiceStatus;
  invoiceStatusAfter: InvoiceStatus;
  source: 'USER';
  createdAt: string;
};

export type ScoredInvoice = {
  id: string;
  invoiceNumber: number;
  invoiceDate: string;
  totalAmount: string;
  amountOutstanding: string;
  status: InvoiceStatus;
  customerId: string | null;
  customerName: string | null;
  score: number;
  signals: {
    invoiceNumber: boolean;
    exactAmount: boolean;
    customerToken: boolean;
    datePlausible: boolean;
    partialBonus: boolean;
  };
};

export type BundleSuggestion = {
  invoiceIds: string[];
  invoices: Array<{ id: string; invoiceNumber: number; amountOutstanding: string }>;
  total: string;
};

export type CandidatesResponse = {
  candidates: ScoredInvoice[];
  bundleSuggestion: BundleSuggestion | null;
};

export type CustomerCredit = {
  credit: string;
  transactions: Array<{
    id: string;
    date: string;
    amount: string;
    remaining: string;
    description: string;
  }>;
};

export type PaymentQueueItem = {
  id: string;
  date: string;
  amount: string;
  description: string;
  accountId: string;
  accountName: string;
  vendorId: string | null;
  vendorName: string | null;
  vendorCustomerId: string | null;
  vendorCustomerName: string | null;
  unallocated: string;
};

export type ApplyPaymentResponse = {
  transaction: { id: string; amount: string; unallocated: string };
  invoices: Array<{
    id: string;
    status: InvoiceStatus;
    amountPaid: string;
    amountOutstanding: string;
  }>;
};

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
  "draft" | "pending" | "progress" | "completed" | "cancelled" | "overdue"
> = {
  DRAFT: "draft",
  SENT: "pending",
  VIEWED: "progress",
  PARTIAL_PAID: "progress",
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

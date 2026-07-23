// Finance module — shared types. See docs/FINANCES_DESIGN.md.

import { convertToUah, type FxCurrency, type FxRates } from "@/lib/fxRates";

export type LegalEntityKind = "llc" | "sole_prop" | "individual";

export type FinanceLegalEntity = {
  id: string;
  teamId: string;
  name: string;
  kind: LegalEntityKind;
  vatPayer: boolean;
  taxGroup: string | null;
  edrpou: string | null;
  ipn: string | null;
  iban: string | null;
  requisites: Record<string, unknown>;
  isActive: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type FinanceAccountKind = "bank" | "cash" | "crypto" | "personal_card";
export type FinanceBankProvider = "raiffeisen" | "mono" | "manual";

export type FinanceAccount = {
  id: string;
  teamId: string;
  legalEntityId: string | null;
  name: string;
  kind: FinanceAccountKind;
  currency: string;
  bankProvider: FinanceBankProvider | null;
  isSensitive: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export const LEGAL_ENTITY_KIND_LABELS: Record<LegalEntityKind, string> = {
  llc: "ТОВ",
  sole_prop: "ФОП",
  individual: "Фізособа",
};

/**
 * Display name for a legal entity. If the saved name already starts with
 * the kind label (e.g. user named the entity «ТОВ «АВАНПРІНТ»»), don't
 * prepend the label a second time. Otherwise show "{kind} {name}".
 */
export const formatLegalEntityLabel = (
  entity: { kind: LegalEntityKind; name: string } | null | undefined
): string => {
  if (!entity) return "";
  const kindLabel = LEGAL_ENTITY_KIND_LABELS[entity.kind] ?? "";
  const name = (entity.name ?? "").trim();
  if (!name) return kindLabel;
  if (!kindLabel) return name;
  const lowered = name.toLowerCase();
  const kindLower = kindLabel.toLowerCase();
  if (lowered === kindLower || lowered.startsWith(`${kindLower} `)) return name;
  return `${kindLabel} ${name}`;
};

export const ACCOUNT_KIND_LABELS: Record<FinanceAccountKind, string> = {
  bank: "Банк",
  cash: "Готівка (каса)",
  crypto: "Крипта",
  personal_card: "Особиста картка",
};

export const BANK_PROVIDER_LABELS: Record<FinanceBankProvider, string> = {
  raiffeisen: "Райфайзен",
  mono: "Mono / Універсал",
  manual: "Вручну",
};

/** Account kinds that are off-books and visible only to top roles. */
export const SENSITIVE_ACCOUNT_KINDS: ReadonlySet<FinanceAccountKind> = new Set([
  "cash",
  "crypto",
  "personal_card",
]);

export type FinancePaymentSource = "manual" | "raiffeisen" | "mono" | "csv";

export type FinancePayment = {
  id: string;
  teamId: string;
  accountId: string | null;
  quoteId: string;
  invoiceId: string | null;
  amount: number;
  currency: string;
  fxRate: number | null;
  uahEquivalent: number | null;
  paidAt: string; // date (YYYY-MM-DD)
  source: FinancePaymentSource;
  bankTxnRef: string | null;
  notes: string | null;
  enteredBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export const PAYMENT_SOURCE_LABELS: Record<FinancePaymentSource, string> = {
  manual: "Вручну",
  raiffeisen: "Райфайзен",
  mono: "Mono",
  csv: "CSV-імпорт",
};

/** Lightweight order reference for finance pickers (payments, invoices). */
export type FinanceOrderRef = {
  quoteId: string;
  number: string;
  customerId: string | null;
  customerName: string;
  total: number;
  currency: string;
};

export type FinanceInvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";

export type FinanceInvoice = {
  id: string;
  teamId: string;
  number: string | null;
  legalEntityId: string | null;
  customerId: string | null;
  quoteId: string | null;
  issueDate: string | null;
  dueDate: string | null;
  amount: number;
  vatRate: number | null;
  vatAmount: number;
  prepaymentAmount: number | null;
  balanceAmount: number | null;
  status: FinanceInvoiceStatus;
  filePdf: string | null;
  fileXlsx: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export const INVOICE_STATUS_LABELS: Record<FinanceInvoiceStatus, string> = {
  draft: "Чернетка",
  sent: "Надіслано",
  partial: "Частково оплачено",
  paid: "Оплачено",
  overdue: "Прострочено",
  cancelled: "Скасовано",
};

/** Badge tone= для статусу рахунку — та сама семантика, що всі бейджі апки. */
export const INVOICE_STATUS_BADGE_TONE: Record<
  FinanceInvoiceStatus,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  draft: "neutral",
  sent: "info",
  partial: "warning",
  paid: "success",
  overdue: "danger",
  cancelled: "neutral",
};

/** Invoice counts toward receivables unless cancelled. */
export const invoiceIsReceivable = (status: FinanceInvoiceStatus) => status !== "cancelled";

// --- Order classification (finance_order_meta) -----------------------------

export type OrderType = "goods" | "services";

export type FinanceOrderMeta = {
  quoteId: string;
  teamId: string;
  orderType: OrderType | null;
  legalEntityId: string | null;
  intendedAccountId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  goods: "Товари",
  services: "Послуги",
};

// --- Expenses (Фаза 2) ------------------------------------------------------

export type ExpenseCategoryKind = "variable" | "fixed" | "tax" | "payroll";

export type FinanceExpenseCategory = {
  id: string;
  teamId: string;
  name: string;
  kind: ExpenseCategoryKind;
  isActive: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export const EXPENSE_CATEGORY_KIND_LABELS: Record<ExpenseCategoryKind, string> = {
  fixed: "Сталі (щомісячні)",
  variable: "Змінні (під замовлення)",
  tax: "Податки",
  payroll: "Виплати команді",
};

export type FinanceExpenseAllocation = {
  id: string;
  expenseId: string;
  quoteId: string;
  amount: number;
};

/** Період білінгу сталої витрати / підписки. */
export type BillingPeriod = "monthly" | "quarterly" | "semiannual" | "yearly";

export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: "Раз на місяць",
  quarterly: "Раз на квартал",
  semiannual: "Раз на півроку",
  yearly: "Раз на рік",
};

/** На скільки місяців розтягується один платіж — база для розбиття річної оплати. */
export const BILLING_PERIOD_MONTHS: Record<BillingPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

/** Порядок для селектів (від найчастішого до найрідшого). */
export const BILLING_PERIOD_ORDER: BillingPeriod[] = ["monthly", "quarterly", "semiannual", "yearly"];

export const isBillingPeriod = (value: unknown): value is BillingPeriod =>
  value === "monthly" || value === "quarterly" || value === "semiannual" || value === "yearly";

export const billingPeriodOf = (expense: { recurrence: string | null }): BillingPeriod =>
  isBillingPeriod(expense.recurrence) ? expense.recurrence : "monthly";

export type FinanceExpense = {
  id: string;
  teamId: string;
  legalEntityId: string | null;
  accountId: string | null;
  categoryId: string | null;
  supplierName: string | null;
  amount: number;
  currency: FxCurrency;
  fxRate: number | null;
  vatAmount: number;
  expenseDate: string;
  isRecurring: boolean;
  recurrence: string | null;
  /** true = регулярний платіж зі змінною сумою (комуналка): факт вводиться по місяцях. */
  amountVaries: boolean;
  /** Обʼєкт/адреса (напр. «Богданівська 7») для групування оренди+комуналки одного офісу. */
  objectGroup: string | null;
  nextChargeDate: string | null;
  vendorKey: string | null;
  logoUrl: string | null;
  notes: string | null;
  file: string | null;
  enteredBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  allocations: FinanceExpenseAllocation[];
};

/**
 * Гривнева вартість витрати. Валютні суми — за зафіксованим курсом операції,
 * а якщо його нема (план на майбутнє) — за поточним курсом Мінфіну з шапки.
 * null означає «курс невідомий» — рахувати не можна, показуємо суму як є.
 */
export const expenseUahAmount = (expense: FinanceExpense, rates: FxRates): number | null =>
  convertToUah(expense.amount, expense.currency, rates, expense.fxRate);

/**
 * Скільки ця стала витрата коштує на місяць у гривні.
 * Річний платіж ділиться на 12, квартальний — на 3 (див. п.9 побажань CEO).
 */
export const expenseMonthlyUah = (expense: FinanceExpense, rates: FxRates): number | null => {
  const uah = expenseUahAmount(expense, rates);
  if (uah === null) return null;
  return uah / BILLING_PERIOD_MONTHS[billingPeriodOf(expense)];
};

// --- Змінні регулярні платежі (комуналка/прибирання): журнал датованих записів --

/**
 * Один запис журналу регулярного платежу зі змінною сумою: конкретна подія
 * (напр. одне прибирання офісу) — дата + сума + коментар. За місяць їх може бути
 * кілька; місячна вартість = сума записів цього місяця.
 */
export type ExpenseEntry = {
  id: string;
  expenseId: string;
  entryDate: string; // YYYY-MM-DD — коли фактично сталося
  amount: number;
  note: string | null;
};

// --- Team payouts overlay (finance_payout_meta) ----------------------------

export type PayoutStatus = "pending" | "paid";

export type FinancePayoutMeta = {
  userId: string;
  period: string; // YYYY-MM-01
  legalEntityId: string | null;
  accountId: string | null;
  status: PayoutStatus;
  paidAt: string | null;
  note: string | null;
};

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  pending: "До виплати",
  paid: "Виплачено",
};

// --- Taxes (Податки) --------------------------------------------------------

export type TaxType = "vat" | "single_tax" | "esv" | "military";
export type TaxStatus = "pending" | "paid";

export type FinanceTax = {
  id: string;
  teamId: string;
  legalEntityId: string | null;
  taxType: TaxType;
  period: string; // YYYY-MM-01
  baseAmount: number | null;
  rate: number | null;
  amount: number;
  dueDate: string | null;
  status: TaxStatus;
  paidAt: string | null;
  note: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  vat: "ПДВ",
  single_tax: "Єдиний податок",
  esv: "ЄСВ",
  military: "Військовий збір",
};

/** Default rate hint per tax type (ЄСВ is a fixed sum → no %). */
export const TAX_TYPE_DEFAULT_RATE: Record<TaxType, number | null> = {
  vat: 20,
  single_tax: 5,
  esv: null,
  military: 1,
};

export const TAX_STATUS_LABELS: Record<TaxStatus, string> = {
  pending: "До сплати",
  paid: "Сплачено",
};

/** UAH value of a payment: explicit equivalent, else amount when already UAH. */
export const paymentUahValue = (payment: Pick<FinancePayment, "amount" | "currency" | "uahEquivalent">): number => {
  if (typeof payment.uahEquivalent === "number" && Number.isFinite(payment.uahEquivalent)) {
    return payment.uahEquivalent;
  }
  return (payment.currency || "UAH").toUpperCase() === "UAH" ? payment.amount : 0;
};

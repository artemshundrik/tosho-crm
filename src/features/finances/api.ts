// Finance module — Supabase data access (tosho schema). See docs/FINANCES_DESIGN.md.

import { supabase } from "@/lib/supabaseClient";
import type { Json } from "@/lib/database.types";
import { loadDerivedOrders } from "@/features/orders/orderRecords";
import { isFxCurrency, type FxCurrency } from "@/lib/fxRates";
import type {
  BillingPeriod,
  ExpenseCategoryKind,
  FinanceAccount,
  FinanceAccountKind,
  FinanceBankProvider,
  ExpenseEntry,
  FinanceExpense,
  FinanceExpenseAllocation,
  FinanceExpenseCategory,
  FinanceInvoice,
  FinanceInvoiceStatus,
  FinanceLegalEntity,
  FinanceOrderMeta,
  FinanceOrderRef,
  FinancePayment,
  FinancePaymentSource,
  FinancePayoutMeta,
  FinanceTax,
  LegalEntityKind,
  OrderType,
  PayoutStatus,
  TaxStatus,
  TaxType,
} from "./types";

const LEGAL_ENTITY_COLUMNS =
  "id,team_id,name,kind,vat_payer,tax_group,edrpou,ipn,iban,requisites,is_active,sort_order,created_at,updated_at";

const ACCOUNT_COLUMNS =
  "id,team_id,legal_entity_id,name,kind,currency,bank_provider,is_sensitive,is_active,sort_order,created_at,updated_at";

type LegalEntityRow = {
  id: string;
  team_id: string;
  name: string | null;
  kind: string | null;
  vat_payer: boolean | null;
  tax_group: string | null;
  edrpou: string | null;
  ipn: string | null;
  iban: string | null;
  requisites: unknown;
  is_active: boolean | null;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type AccountRow = {
  id: string;
  team_id: string;
  legal_entity_id: string | null;
  name: string | null;
  kind: string | null;
  currency: string | null;
  bank_provider: string | null;
  is_sensitive: boolean | null;
  is_active: boolean | null;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
};

const normalizeLegalEntity = (row: LegalEntityRow): FinanceLegalEntity => ({
  id: row.id,
  teamId: row.team_id,
  name: row.name ?? "",
  kind: (row.kind as LegalEntityKind) || "sole_prop",
  vatPayer: Boolean(row.vat_payer),
  taxGroup: row.tax_group ?? null,
  edrpou: row.edrpou ?? null,
  ipn: row.ipn ?? null,
  iban: row.iban ?? null,
  requisites: row.requisites && typeof row.requisites === "object" ? (row.requisites as Record<string, unknown>) : {},
  isActive: row.is_active ?? true,
  sortOrder: row.sort_order ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const normalizeAccount = (row: AccountRow): FinanceAccount => ({
  id: row.id,
  teamId: row.team_id,
  legalEntityId: row.legal_entity_id ?? null,
  name: row.name ?? "",
  kind: (row.kind as FinanceAccountKind) || "bank",
  currency: row.currency ?? "UAH",
  bankProvider: (row.bank_provider as FinanceBankProvider) || null,
  isSensitive: Boolean(row.is_sensitive),
  isActive: row.is_active ?? true,
  sortOrder: row.sort_order ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ---------------------------------------------------------------------------
// Legal entities (юрособи)
// ---------------------------------------------------------------------------

export async function listLegalEntities(teamId: string): Promise<FinanceLegalEntity[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_legal_entities")
    .select(LEGAL_ENTITY_COLUMNS)
    .eq("team_id", teamId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as unknown as LegalEntityRow[]) ?? []).map(normalizeLegalEntity);
}

export type LegalEntityInput = {
  name: string;
  kind: LegalEntityKind;
  vatPayer: boolean;
  taxGroup?: string | null;
  edrpou?: string | null;
  ipn?: string | null;
  iban?: string | null;
  requisites?: Record<string, unknown>;
  isActive?: boolean;
  sortOrder?: number;
};

const serializeLegalEntity = (input: LegalEntityInput) => ({
  name: input.name.trim(),
  kind: input.kind,
  vat_payer: input.vatPayer,
  tax_group: input.taxGroup?.trim() || null,
  edrpou: input.edrpou?.trim() || null,
  ipn: input.ipn?.trim() || null,
  iban: input.iban?.trim() || null,
  requisites: (input.requisites ?? {}) as Json,
  is_active: input.isActive ?? true,
  ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
});

export async function createLegalEntity(teamId: string, input: LegalEntityInput): Promise<FinanceLegalEntity> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_legal_entities")
    .insert({ team_id: teamId, ...serializeLegalEntity(input) })
    .select(LEGAL_ENTITY_COLUMNS)
    .single();
  if (error) throw error;
  return normalizeLegalEntity(data as unknown as LegalEntityRow);
}

export async function updateLegalEntity(
  teamId: string,
  id: string,
  input: LegalEntityInput
): Promise<FinanceLegalEntity> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_legal_entities")
    .update(serializeLegalEntity(input))
    .eq("team_id", teamId)
    .eq("id", id)
    .select(LEGAL_ENTITY_COLUMNS)
    .single();
  if (error) throw error;
  return normalizeLegalEntity(data as unknown as LegalEntityRow);
}

export async function deleteLegalEntity(teamId: string, id: string): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("finance_legal_entities")
    .delete()
    .eq("team_id", teamId)
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Accounts (каси / гаманці)
// ---------------------------------------------------------------------------

export async function listAccounts(teamId: string): Promise<FinanceAccount[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("team_id", teamId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data as unknown as AccountRow[]) ?? []).map(normalizeAccount);
}

export type AccountInput = {
  legalEntityId?: string | null;
  name: string;
  kind: FinanceAccountKind;
  currency?: string;
  bankProvider?: FinanceBankProvider | null;
  isSensitive: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

const serializeAccount = (input: AccountInput) => ({
  legal_entity_id: input.legalEntityId || null,
  name: input.name.trim(),
  kind: input.kind,
  currency: (input.currency || "UAH").trim().toUpperCase(),
  bank_provider: input.bankProvider || null,
  is_sensitive: input.isSensitive,
  is_active: input.isActive ?? true,
  ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
});

export async function createAccount(teamId: string, input: AccountInput): Promise<FinanceAccount> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_accounts")
    .insert({ team_id: teamId, ...serializeAccount(input) })
    .select(ACCOUNT_COLUMNS)
    .single();
  if (error) throw error;
  return normalizeAccount(data as unknown as AccountRow);
}

export async function updateAccount(teamId: string, id: string, input: AccountInput): Promise<FinanceAccount> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_accounts")
    .update(serializeAccount(input))
    .eq("team_id", teamId)
    .eq("id", id)
    .select(ACCOUNT_COLUMNS)
    .single();
  if (error) throw error;
  return normalizeAccount(data as unknown as AccountRow);
}

export async function deleteAccount(teamId: string, id: string): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("finance_accounts")
    .delete()
    .eq("team_id", teamId)
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Orders lookup (for payment/invoice pickers)
// ---------------------------------------------------------------------------

/**
 * Lightweight list of orders to bind payments/invoices to. Reuses the canonical
 * derived-order builder; payments attach to `quoteId` (the order's stable id).
 */
export async function listOrdersForFinance(teamId: string, userId?: string | null): Promise<FinanceOrderRef[]> {
  const records = await loadDerivedOrders(teamId, userId);
  return records.map((record) => ({
    quoteId: record.quoteId,
    number: record.quoteNumber,
    customerId: record.customerId,
    customerName: record.customerName,
    total: record.total,
    currency: record.currency,
  }));
}

// ---------------------------------------------------------------------------
// Payments (оплати) — факт надходження, тільки до замовлення (quote_id)
// ---------------------------------------------------------------------------

const PAYMENT_COLUMNS =
  "id,team_id,account_id,quote_id,invoice_id,amount,currency,fx_rate,uah_equivalent,paid_at,source,bank_txn_ref,notes,entered_by,created_at,updated_at";

type PaymentRow = {
  id: string;
  team_id: string;
  account_id: string | null;
  quote_id: string;
  invoice_id: string | null;
  amount: number | string | null;
  currency: string | null;
  fx_rate: number | string | null;
  uah_equivalent: number | string | null;
  paid_at: string;
  source: string | null;
  bank_txn_ref: string | null;
  notes: string | null;
  entered_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const toNumber = (value: number | string | null): number => {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNullableNumber = (value: number | string | null): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePayment = (row: PaymentRow): FinancePayment => ({
  id: row.id,
  teamId: row.team_id,
  accountId: row.account_id ?? null,
  quoteId: row.quote_id,
  invoiceId: row.invoice_id ?? null,
  amount: toNumber(row.amount),
  currency: row.currency ?? "UAH",
  fxRate: toNullableNumber(row.fx_rate),
  uahEquivalent: toNullableNumber(row.uah_equivalent),
  paidAt: row.paid_at,
  source: (row.source as FinancePaymentSource) || "manual",
  bankTxnRef: row.bank_txn_ref ?? null,
  notes: row.notes ?? null,
  enteredBy: row.entered_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function listPayments(teamId: string): Promise<FinancePayment[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_payments")
    .select(PAYMENT_COLUMNS)
    .eq("team_id", teamId)
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as unknown as PaymentRow[]) ?? []).map(normalizePayment);
}

export type PaymentInput = {
  accountId: string | null;
  quoteId: string;
  invoiceId?: string | null;
  amount: number;
  currency: string;
  fxRate?: number | null;
  uahEquivalent?: number | null;
  paidAt: string;
  source: FinancePaymentSource;
  bankTxnRef?: string | null;
  notes?: string | null;
  enteredBy?: string | null;
};

const serializePayment = (input: PaymentInput) => {
  const currency = (input.currency || "UAH").trim().toUpperCase();
  const fxRate = input.fxRate ?? null;
  const uahEquivalent =
    input.uahEquivalent ?? (currency === "UAH" ? input.amount : fxRate ? input.amount * fxRate : null);
  return {
    account_id: input.accountId || null,
    quote_id: input.quoteId,
    invoice_id: input.invoiceId || null,
    amount: input.amount,
    currency,
    fx_rate: fxRate,
    uah_equivalent: uahEquivalent,
    paid_at: input.paidAt,
    source: input.source,
    bank_txn_ref: input.bankTxnRef?.trim() || null,
    notes: input.notes?.trim() || null,
  };
};

export async function createPayment(teamId: string, input: PaymentInput): Promise<FinancePayment> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_payments")
    .insert({ team_id: teamId, entered_by: input.enteredBy || null, ...serializePayment(input) })
    .select(PAYMENT_COLUMNS)
    .single();
  if (error) throw error;
  return normalizePayment(data as unknown as PaymentRow);
}

export async function updatePayment(teamId: string, id: string, input: PaymentInput): Promise<FinancePayment> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_payments")
    .update(serializePayment(input))
    .eq("team_id", teamId)
    .eq("id", id)
    .select(PAYMENT_COLUMNS)
    .single();
  if (error) throw error;
  return normalizePayment(data as unknown as PaymentRow);
}

export async function deletePayment(teamId: string, id: string): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("finance_payments")
    .delete()
    .eq("team_id", teamId)
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Invoices (рахунки клієнтам)
// ---------------------------------------------------------------------------

const INVOICE_COLUMNS =
  "id,team_id,number,legal_entity_id,customer_id,quote_id,issue_date,due_date,amount,vat_rate,vat_amount,prepayment_amount,balance_amount,status,file_pdf,file_xlsx,notes,created_by,created_at,updated_at";

type InvoiceRow = {
  id: string;
  team_id: string;
  number: string | null;
  legal_entity_id: string | null;
  customer_id: string | null;
  quote_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount: number | string | null;
  vat_rate: number | string | null;
  vat_amount: number | string | null;
  prepayment_amount: number | string | null;
  balance_amount: number | string | null;
  status: string | null;
  file_pdf: string | null;
  file_xlsx: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const normalizeInvoice = (row: InvoiceRow): FinanceInvoice => ({
  id: row.id,
  teamId: row.team_id,
  number: row.number ?? null,
  legalEntityId: row.legal_entity_id ?? null,
  customerId: row.customer_id ?? null,
  quoteId: row.quote_id ?? null,
  issueDate: row.issue_date ?? null,
  dueDate: row.due_date ?? null,
  amount: toNumber(row.amount),
  vatRate: toNullableNumber(row.vat_rate),
  vatAmount: toNumber(row.vat_amount),
  prepaymentAmount: toNullableNumber(row.prepayment_amount),
  balanceAmount: toNullableNumber(row.balance_amount),
  status: (row.status as FinanceInvoiceStatus) || "draft",
  filePdf: row.file_pdf ?? null,
  fileXlsx: row.file_xlsx ?? null,
  notes: row.notes ?? null,
  createdBy: row.created_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function listInvoices(teamId: string): Promise<FinanceInvoice[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_invoices")
    .select(INVOICE_COLUMNS)
    .eq("team_id", teamId)
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as unknown as InvoiceRow[]) ?? []).map(normalizeInvoice);
}

export type InvoiceInput = {
  number?: string | null;
  legalEntityId: string | null;
  customerId?: string | null;
  quoteId: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  amount: number;
  vatRate?: number | null;
  status: FinanceInvoiceStatus;
  notes?: string | null;
  createdBy?: string | null;
};

/** ПДВ у складі суми (Ukraine default: amount includes VAT). */
const computeVatAmount = (amount: number, vatRate: number | null | undefined): number => {
  if (!vatRate || vatRate <= 0) return 0;
  return Math.round(((amount * vatRate) / (100 + vatRate)) * 100) / 100;
};

const serializeInvoice = (input: InvoiceInput) => ({
  number: input.number?.trim() || null,
  legal_entity_id: input.legalEntityId || null,
  customer_id: input.customerId || null,
  quote_id: input.quoteId || null,
  issue_date: input.issueDate || null,
  due_date: input.dueDate || null,
  amount: input.amount,
  vat_rate: input.vatRate ?? null,
  vat_amount: computeVatAmount(input.amount, input.vatRate),
  status: input.status,
  notes: input.notes?.trim() || null,
});

export async function createInvoice(teamId: string, input: InvoiceInput): Promise<FinanceInvoice> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_invoices")
    .insert({ team_id: teamId, created_by: input.createdBy || null, ...serializeInvoice(input) })
    .select(INVOICE_COLUMNS)
    .single();
  if (error) throw error;
  return normalizeInvoice(data as unknown as InvoiceRow);
}

export async function updateInvoice(teamId: string, id: string, input: InvoiceInput): Promise<FinanceInvoice> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_invoices")
    .update(serializeInvoice(input))
    .eq("team_id", teamId)
    .eq("id", id)
    .select(INVOICE_COLUMNS)
    .single();
  if (error) throw error;
  return normalizeInvoice(data as unknown as InvoiceRow);
}

export async function deleteInvoice(teamId: string, id: string): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("finance_invoices")
    .delete()
    .eq("team_id", teamId)
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Order meta (класифікація замовлення: тип + юрособа)
// ---------------------------------------------------------------------------

type OrderMetaRow = {
  quote_id: string;
  team_id: string;
  order_type: string | null;
  legal_entity_id: string | null;
  intended_account_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const normalizeOrderMeta = (row: OrderMetaRow): FinanceOrderMeta => ({
  quoteId: row.quote_id,
  teamId: row.team_id,
  orderType: (row.order_type as OrderType) || null,
  legalEntityId: row.legal_entity_id ?? null,
  intendedAccountId: row.intended_account_id ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function listOrderMeta(teamId: string): Promise<Map<string, FinanceOrderMeta>> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_order_meta")
    .select("quote_id,team_id,order_type,legal_entity_id,intended_account_id,created_at,updated_at")
    .eq("team_id", teamId);
  if (error) throw error;
  const map = new Map<string, FinanceOrderMeta>();
  for (const row of (data as unknown as OrderMetaRow[]) ?? []) {
    map.set(row.quote_id, normalizeOrderMeta(row));
  }
  return map;
}

export type OrderMetaInput = {
  orderType?: OrderType | null;
  legalEntityId?: string | null;
  intendedAccountId?: string | null;
};

export async function upsertOrderMeta(teamId: string, quoteId: string, input: OrderMetaInput): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("finance_order_meta")
    .upsert(
      {
        quote_id: quoteId,
        team_id: teamId,
        order_type: input.orderType ?? null,
        legal_entity_id: input.legalEntityId ?? null,
        intended_account_id: input.intendedAccountId ?? null,
      },
      { onConflict: "quote_id" }
    );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Expense categories (статті витрат)
// ---------------------------------------------------------------------------

type ExpenseCategoryRow = {
  id: string;
  team_id: string;
  name: string | null;
  kind: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
};

const normalizeExpenseCategory = (row: ExpenseCategoryRow): FinanceExpenseCategory => ({
  id: row.id,
  teamId: row.team_id,
  name: row.name ?? "",
  kind: (row.kind as ExpenseCategoryKind) || "variable",
  isActive: row.is_active ?? true,
  sortOrder: row.sort_order ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function listExpenseCategories(teamId: string): Promise<FinanceExpenseCategory[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_expense_categories")
    .select("id,team_id,name,kind,is_active,sort_order,created_at,updated_at")
    .eq("team_id", teamId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data as unknown as ExpenseCategoryRow[]) ?? []).map(normalizeExpenseCategory);
}

export async function createExpenseCategory(
  teamId: string,
  input: { name: string; kind: ExpenseCategoryKind }
): Promise<FinanceExpenseCategory> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_expense_categories")
    .insert({ team_id: teamId, name: input.name.trim(), kind: input.kind })
    .select("id,team_id,name,kind,is_active,sort_order,created_at,updated_at")
    .single();
  if (error) throw error;
  return normalizeExpenseCategory(data as unknown as ExpenseCategoryRow);
}

export async function deleteExpenseCategory(teamId: string, id: string): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("finance_expense_categories")
    .delete()
    .eq("team_id", teamId)
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Expenses (витрати) + allocations (розподіл на замовлення)
// ---------------------------------------------------------------------------

const EXPENSE_COLUMNS =
  "id,team_id,legal_entity_id,account_id,category_id,supplier_name,amount,currency,fx_rate,vat_amount,expense_date,is_recurring,recurrence,amount_varies,object_group,next_charge_date,vendor_key,logo_url,notes,file,entered_by,created_at,updated_at";

type ExpenseRow = {
  id: string;
  team_id: string;
  legal_entity_id: string | null;
  account_id: string | null;
  category_id: string | null;
  supplier_name: string | null;
  amount: number | string | null;
  currency: string | null;
  fx_rate: number | string | null;
  vat_amount: number | string | null;
  expense_date: string;
  is_recurring: boolean | null;
  recurrence: string | null;
  amount_varies: boolean | null;
  object_group: string | null;
  next_charge_date: string | null;
  vendor_key: string | null;
  logo_url: string | null;
  notes: string | null;
  file: string | null;
  entered_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AllocationRow = {
  id: string;
  expense_id: string;
  quote_id: string;
  amount: number | string | null;
};

const normalizeAllocation = (row: AllocationRow): FinanceExpenseAllocation => ({
  id: row.id,
  expenseId: row.expense_id,
  quoteId: row.quote_id,
  amount: toNumber(row.amount),
});

const normalizeExpense = (row: ExpenseRow, allocations: FinanceExpenseAllocation[]): FinanceExpense => ({
  id: row.id,
  teamId: row.team_id,
  legalEntityId: row.legal_entity_id ?? null,
  accountId: row.account_id ?? null,
  categoryId: row.category_id ?? null,
  supplierName: row.supplier_name ?? null,
  amount: toNumber(row.amount),
  currency: isFxCurrency(row.currency) ? row.currency : "UAH",
  fxRate: toNullableNumber(row.fx_rate),
  vatAmount: toNumber(row.vat_amount),
  expenseDate: row.expense_date,
  isRecurring: Boolean(row.is_recurring),
  recurrence: row.recurrence ?? null,
  amountVaries: Boolean(row.amount_varies),
  objectGroup: row.object_group ?? null,
  nextChargeDate: row.next_charge_date ?? null,
  vendorKey: row.vendor_key ?? null,
  logoUrl: row.logo_url ?? null,
  notes: row.notes ?? null,
  file: row.file ?? null,
  enteredBy: row.entered_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  allocations,
});

export async function listExpenses(teamId: string): Promise<FinanceExpense[]> {
  const [{ data: expenseData, error: expenseError }, allocResult] = await Promise.all([
    supabase
      .schema("tosho")
      .from("finance_expenses")
      .select(EXPENSE_COLUMNS)
      .eq("team_id", teamId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .schema("tosho")
      .from("finance_expense_allocations")
      .select("id,expense_id,quote_id,amount")
      .eq("team_id", teamId),
  ]);
  if (expenseError) throw expenseError;
  if (allocResult.error) {
    console.error("[finance] expense_allocations load failed", allocResult.error);
  }
  const allocData = allocResult.error ? [] : allocResult.data;

  const allocByExpense = new Map<string, FinanceExpenseAllocation[]>();
  for (const row of (allocData as unknown as AllocationRow[]) ?? []) {
    const alloc = normalizeAllocation(row);
    const list = allocByExpense.get(alloc.expenseId) ?? [];
    list.push(alloc);
    allocByExpense.set(alloc.expenseId, list);
  }

  return ((expenseData as unknown as ExpenseRow[]) ?? []).map((row) =>
    normalizeExpense(row, allocByExpense.get(row.id) ?? [])
  );
}

export type ExpenseAllocationInput = { quoteId: string; amount: number };

export type ExpenseInput = {
  legalEntityId?: string | null;
  accountId?: string | null;
  categoryId?: string | null;
  supplierName?: string | null;
  amount: number;
  currency?: FxCurrency;
  fxRate?: number | null;
  vatAmount?: number;
  expenseDate: string;
  isRecurring: boolean;
  recurrence?: BillingPeriod | null;
  amountVaries?: boolean;
  objectGroup?: string | null;
  nextChargeDate?: string | null;
  vendorKey?: string | null;
  logoUrl?: string | null;
  notes?: string | null;
  enteredBy?: string | null;
  allocations: ExpenseAllocationInput[];
};

const serializeExpense = (input: ExpenseInput) => ({
  legal_entity_id: input.legalEntityId || null,
  account_id: input.accountId || null,
  category_id: input.categoryId || null,
  supplier_name: input.supplierName?.trim() || null,
  amount: input.amount,
  currency: input.currency ?? "UAH",
  fx_rate: input.fxRate ?? null,
  vat_amount: input.vatAmount ?? 0,
  expense_date: input.expenseDate,
  is_recurring: input.isRecurring,
  recurrence: input.isRecurring ? input.recurrence || "monthly" : null,
  // Змінна сума — лише для регулярних; для решти завжди false.
  amount_varies: input.isRecurring ? Boolean(input.amountVaries) : false,
  // Обʼєкт/адреса — тільки для регулярних (групування офісних платежів).
  object_group: input.isRecurring ? input.objectGroup?.trim() || null : null,
  // Дата наступного списання має сенс лише для сталої витрати/підписки.
  next_charge_date: input.isRecurring ? input.nextChargeDate || null : null,
  vendor_key: input.vendorKey || null,
  logo_url: input.logoUrl?.trim() || null,
  notes: input.notes?.trim() || null,
});

async function replaceAllocations(
  teamId: string,
  expenseId: string,
  allocations: ExpenseAllocationInput[]
): Promise<void> {
  const { error: delError } = await supabase
    .schema("tosho")
    .from("finance_expense_allocations")
    .delete()
    .eq("team_id", teamId)
    .eq("expense_id", expenseId);
  if (delError) throw delError;

  const valid = allocations.filter((a) => a.quoteId && a.amount > 0);
  if (valid.length === 0) return;

  const { error: insError } = await supabase
    .schema("tosho")
    .from("finance_expense_allocations")
    .insert(valid.map((a) => ({ team_id: teamId, expense_id: expenseId, quote_id: a.quoteId, amount: a.amount })));
  if (insError) throw insError;
}

export async function createExpense(teamId: string, input: ExpenseInput): Promise<string> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_expenses")
    .insert({ team_id: teamId, entered_by: input.enteredBy || null, ...serializeExpense(input) })
    .select("id")
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  await replaceAllocations(teamId, id, input.allocations);
  return id;
}

export async function updateExpense(teamId: string, id: string, input: ExpenseInput): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("finance_expenses")
    .update(serializeExpense(input))
    .eq("team_id", teamId)
    .eq("id", id);
  if (error) throw error;
  await replaceAllocations(teamId, id, input.allocations);
}

export async function deleteExpense(teamId: string, id: string): Promise<void> {
  // allocations + monthly amounts cascade-delete via FK
  const { error } = await supabase
    .schema("tosho")
    .from("finance_expenses")
    .delete()
    .eq("team_id", teamId)
    .eq("id", id);
  if (error) throw error;
}

// --- Журнал датованих записів для регулярних платежів зі змінною сумою --------
// Одна витрата «сума змінна» (напр. прибирання офісу) тримає багато записів:
// кожен = дата + сума + коментар. Місячна вартість = сума записів того місяця.

type ExpenseEntryRow = {
  id: string;
  expense_id: string;
  entry_date: string;
  amount: number | string | null;
  note: string | null;
};

const mapExpenseEntry = (row: ExpenseEntryRow): ExpenseEntry => ({
  id: row.id,
  expenseId: row.expense_id,
  entryDate: row.entry_date,
  amount: toNumber(row.amount),
  note: row.note,
});

// period лишається місячним бакетом — тримаємо в синхроні з датою запису.
const periodOf = (entryDate: string) => `${entryDate.slice(0, 7)}-01`;

/** Усі записи журналу команди: expenseId → записи (від найновішого до найстарішого). */
export async function listExpenseEntries(teamId: string): Promise<Map<string, ExpenseEntry[]>> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_expense_monthly_amounts")
    .select("id,expense_id,entry_date,amount,note")
    .eq("team_id", teamId)
    .order("entry_date", { ascending: false });
  if (error) throw error;
  const byExpense = new Map<string, ExpenseEntry[]>();
  for (const row of (data as unknown as ExpenseEntryRow[]) ?? []) {
    const entry = mapExpenseEntry(row);
    const list = byExpense.get(entry.expenseId);
    if (list) list.push(entry);
    else byExpense.set(entry.expenseId, [entry]);
  }
  return byExpense;
}

/** Додати запис журналу. Повертає створений рядок (з реальним id). */
export async function createExpenseEntry(
  teamId: string,
  input: { expenseId: string; entryDate: string; amount: number; note?: string | null; enteredBy?: string | null }
): Promise<ExpenseEntry> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_expense_monthly_amounts")
    .insert({
      team_id: teamId,
      expense_id: input.expenseId,
      period: periodOf(input.entryDate),
      entry_date: input.entryDate,
      amount: input.amount,
      note: input.note?.trim() || null,
      entered_by: input.enteredBy || null,
    })
    .select("id,expense_id,entry_date,amount,note")
    .single();
  if (error) throw error;
  return mapExpenseEntry(data as unknown as ExpenseEntryRow);
}

/** Оновити запис журналу (дата/сума/коментар). period тримаємо в синхроні з датою. */
export async function updateExpenseEntry(
  teamId: string,
  entryId: string,
  patch: { entryDate?: string; amount?: number; note?: string | null }
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.entryDate !== undefined) {
    update.entry_date = patch.entryDate;
    update.period = periodOf(patch.entryDate);
  }
  if (patch.amount !== undefined) update.amount = patch.amount;
  if (patch.note !== undefined) update.note = patch.note?.trim() || null;
  const { error } = await supabase
    .schema("tosho")
    .from("finance_expense_monthly_amounts")
    .update(update)
    .eq("team_id", teamId)
    .eq("id", entryId);
  if (error) throw error;
}

/** Видалити запис журналу. */
export async function deleteExpenseEntry(teamId: string, entryId: string): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("finance_expense_monthly_amounts")
    .delete()
    .eq("team_id", teamId)
    .eq("id", entryId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Payout meta (фінансовий оверлей над зарплатною відомістю)
// Amounts live in tosho.payroll_entries (see src/lib/payroll.ts). This adds
// яка юрособа платить / з якої каси / статус виплати, keyed by user_id + period.
// ---------------------------------------------------------------------------

type PayoutMetaRow = {
  user_id: string;
  period: string;
  legal_entity_id: string | null;
  account_id: string | null;
  status: string | null;
  paid_at: string | null;
  note: string | null;
};

const normalizePayoutMeta = (row: PayoutMetaRow): FinancePayoutMeta => ({
  userId: row.user_id,
  period: row.period,
  legalEntityId: row.legal_entity_id ?? null,
  accountId: row.account_id ?? null,
  status: (row.status as PayoutStatus) || "pending",
  paidAt: row.paid_at ?? null,
  note: row.note ?? null,
});

export async function listPayoutMeta(teamId: string, period: string): Promise<Map<string, FinancePayoutMeta>> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_payout_meta")
    .select("user_id,period,legal_entity_id,account_id,status,paid_at,note")
    .eq("team_id", teamId)
    .eq("period", period);
  if (error) throw error;
  const map = new Map<string, FinancePayoutMeta>();
  for (const row of (data as unknown as PayoutMetaRow[]) ?? []) {
    map.set(row.user_id, normalizePayoutMeta(row));
  }
  return map;
}

export type PayoutMetaInput = {
  legalEntityId?: string | null;
  accountId?: string | null;
  status?: PayoutStatus;
  paidAt?: string | null;
  note?: string | null;
};

export async function upsertPayoutMeta(
  teamId: string,
  userId: string,
  period: string,
  input: PayoutMetaInput
): Promise<void> {
  const status = input.status ?? "pending";
  const { error } = await supabase
    .schema("tosho")
    .from("finance_payout_meta")
    .upsert(
      {
        team_id: teamId,
        user_id: userId,
        period,
        legal_entity_id: input.legalEntityId ?? null,
        account_id: input.accountId ?? null,
        status,
        paid_at: status === "paid" ? input.paidAt ?? new Date().toISOString().slice(0, 10) : null,
        note: input.note?.trim() || null,
      },
      { onConflict: "team_id,user_id,period" }
    );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Taxes (податки)
// ---------------------------------------------------------------------------

const TAX_COLUMNS =
  "id,team_id,legal_entity_id,tax_type,period,base_amount,rate,amount,due_date,status,paid_at,note,created_at,updated_at";

type TaxRow = {
  id: string;
  team_id: string;
  legal_entity_id: string | null;
  tax_type: string;
  period: string;
  base_amount: number | string | null;
  rate: number | string | null;
  amount: number | string | null;
  due_date: string | null;
  status: string | null;
  paid_at: string | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const normalizeTax = (row: TaxRow): FinanceTax => ({
  id: row.id,
  teamId: row.team_id,
  legalEntityId: row.legal_entity_id ?? null,
  taxType: (row.tax_type as TaxType) || "vat",
  period: row.period,
  baseAmount: toNullableNumber(row.base_amount),
  rate: toNullableNumber(row.rate),
  amount: toNumber(row.amount),
  dueDate: row.due_date ?? null,
  status: (row.status as TaxStatus) || "pending",
  paidAt: row.paid_at ?? null,
  note: row.note ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function listTaxes(teamId: string): Promise<FinanceTax[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_taxes")
    .select(TAX_COLUMNS)
    .eq("team_id", teamId)
    .order("period", { ascending: false })
    .order("tax_type", { ascending: true });
  if (error) throw error;
  return ((data as unknown as TaxRow[]) ?? []).map(normalizeTax);
}

export type TaxInput = {
  legalEntityId?: string | null;
  taxType: TaxType;
  period: string;
  baseAmount?: number | null;
  rate?: number | null;
  amount: number;
  dueDate?: string | null;
  status: TaxStatus;
  paidAt?: string | null;
  note?: string | null;
};

const serializeTax = (input: TaxInput) => ({
  legal_entity_id: input.legalEntityId || null,
  tax_type: input.taxType,
  period: input.period,
  base_amount: input.baseAmount ?? null,
  rate: input.rate ?? null,
  amount: input.amount,
  due_date: input.dueDate || null,
  status: input.status,
  paid_at: input.status === "paid" ? input.paidAt ?? new Date().toISOString().slice(0, 10) : null,
  note: input.note?.trim() || null,
});

export async function createTax(teamId: string, input: TaxInput): Promise<FinanceTax> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_taxes")
    .insert({ team_id: teamId, ...serializeTax(input) })
    .select(TAX_COLUMNS)
    .single();
  if (error) throw error;
  return normalizeTax(data as unknown as TaxRow);
}

export async function updateTax(teamId: string, id: string, input: TaxInput): Promise<FinanceTax> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_taxes")
    .update(serializeTax(input))
    .eq("team_id", teamId)
    .eq("id", id)
    .select(TAX_COLUMNS)
    .single();
  if (error) throw error;
  return normalizeTax(data as unknown as TaxRow);
}

export async function deleteTax(teamId: string, id: string): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("finance_taxes")
    .delete()
    .eq("team_id", teamId)
    .eq("id", id);
  if (error) throw error;
}

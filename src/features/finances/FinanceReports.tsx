import * as React from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { useFxRates } from "@/lib/fxRates";
import { FinanceStickyBar } from "./FinanceMonthBar";
import { expenseRowsForMonths } from "./expenseMonth";
import { shiftMonthKey } from "./monthClose";
import {
  useFinanceAccounts,
  useFinanceExpenseCategories,
  useFinanceExpenseEntries,
  useFinanceExpenses,
  useFinanceInvoices,
  useFinanceLegalEntities,
  useFinancePayments,
  useFinanceTaxes,
} from "./queries";
import type { ExpenseEntry } from "./types";
import {
  invoiceIsReceivable,
  formatLegalEntityLabel,
  paymentUahValue,
  TAX_TYPE_LABELS,
  type FinanceAccount,
  type FinanceExpense,
  type FinanceExpenseCategory,
  type FinanceInvoice,
  type FinanceLegalEntity,
  type FinancePayment,
  type FinanceTax,
} from "./types";
import { FinanceSkeleton } from "./FinanceSkeleton";

type FinanceReportsProps = { teamId: string | null; canSeeSensitive: boolean };

type RangeKey = "month" | "year" | "all";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const uah = (value: number) => formatOrderMoney(value, "UAH");

const rangeStart = (range: RangeKey): string => {
  const now = new Date();
  if (range === "month") return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  if (range === "year") return `${now.getFullYear()}-01-01`;
  return "0000-01-01";
};

const EMPTY_PAYMENTS: FinancePayment[] = [];
const EMPTY_INVOICES: FinanceInvoice[] = [];
const EMPTY_EXPENSES: FinanceExpense[] = [];
const EMPTY_TAXES: FinanceTax[] = [];
const EMPTY_ACCOUNTS: FinanceAccount[] = [];
const EMPTY_ENTITIES: FinanceLegalEntity[] = [];
const EMPTY_CATEGORIES: FinanceExpenseCategory[] = [];
const EMPTY_ENTRIES = new Map<string, ExpenseEntry[]>();

export function FinanceReports({ teamId, canSeeSensitive }: FinanceReportsProps) {
  const [range, setRange] = React.useState<RangeKey>("month");
  // Спільні finance-хуки (див. queries.ts): звіти — чисте читання, всі сім
  // ресурсів уже в кеші після відвідин сусідніх вкладок.
  const paymentsQuery = useFinancePayments(teamId);
  const invoicesQuery = useFinanceInvoices(teamId);
  const expensesQuery = useFinanceExpenses(teamId);
  const taxesQuery = useFinanceTaxes(teamId);
  const accountsQuery = useFinanceAccounts(teamId);
  const entitiesQuery = useFinanceLegalEntities(teamId);
  const categoriesQuery = useFinanceExpenseCategories(teamId);
  const entriesQuery = useFinanceExpenseEntries(teamId);
  // Курс той самий, що в шапці: без нього валютні підписки рахувались як гривневі.
  const rates = useFxRates();

  const payments = paymentsQuery.data ?? EMPTY_PAYMENTS;
  const invoices = invoicesQuery.data ?? EMPTY_INVOICES;
  const expenses = expensesQuery.data ?? EMPTY_EXPENSES;
  const taxes = taxesQuery.data ?? EMPTY_TAXES;
  const accounts = accountsQuery.data ?? EMPTY_ACCOUNTS;
  const entities = entitiesQuery.data ?? EMPTY_ENTITIES;
  const categories = categoriesQuery.data ?? EMPTY_CATEGORIES;
  const entriesByExpense = entriesQuery.data ?? EMPTY_ENTRIES;
  const loading =
    paymentsQuery.isPending ||
    invoicesQuery.isPending ||
    expensesQuery.isPending ||
    taxesQuery.isPending ||
    accountsQuery.isPending ||
    entitiesQuery.isPending ||
    categoriesQuery.isPending ||
    entriesQuery.isPending;

  const loadError =
    paymentsQuery.error ??
    invoicesQuery.error ??
    expensesQuery.error ??
    taxesQuery.error ??
    accountsQuery.error ??
    entitiesQuery.error ??
    null;
  React.useEffect(() => {
    if (loadError) {
      toast.error("Не вдалося завантажити звіти", { description: getErrorMessage(loadError, "") });
    }
  }, [loadError]);

  const accountById = React.useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const start = rangeStart(range);

  const visiblePayments = React.useMemo(() => {
    const inRange = payments.filter((p) => p.paidAt >= start);
    if (canSeeSensitive) return inRange;
    return inRange.filter((p) => !(p.accountId && accountById.get(p.accountId)?.isSensitive));
  }, [payments, start, canSeeSensitive, accountById]);

  // Витрати в звіті рахуємо тим самим правилом, що й у розділі «Витрати»
  // (./expenseMonth): регулярна — щомісяця, поки її ведуть, журнальна — фактом
  // своїх записів, разова — у місяці своєї дати. До REQ-190 тут була власна
  // арифметика («усе з датою в діапазоні»), і два екрани показували різні суми.
  const currentMonth = React.useMemo(() => new Date().toISOString().slice(0, 7), []);
  const visibleExpenses = React.useMemo(() => {
    if (canSeeSensitive) return expenses;
    return expenses.filter((e) => !(e.accountId && accountById.get(e.accountId)?.isSensitive));
  }, [expenses, canSeeSensitive, accountById]);

  const monthKeys = React.useMemo(() => {
    const earliest = visibleExpenses.reduce(
      (min, e) => {
        const key = (e.expenseDate ?? "").slice(0, 7);
        return key && key < min ? key : min;
      },
      currentMonth
    );
    const from = range === "all" ? earliest : start.slice(0, 7);
    const keys: string[] = [];
    for (let key = from; key <= currentMonth; key = shiftMonthKey(key, 1)) keys.push(key);
    return keys;
  }, [visibleExpenses, range, start, currentMonth]);

  const expenseRows = React.useMemo(
    () => expenseRowsForMonths(visibleExpenses, entriesByExpense, monthKeys, rates, currentMonth),
    [visibleExpenses, entriesByExpense, monthKeys, rates, currentMonth]
  );

  const received = React.useMemo(() => visiblePayments.reduce((s, p) => s + paymentUahValue(p), 0), [visiblePayments]);
  const spent = React.useMemo(() => expenseRows.reduce((s, row) => s + row.uah, 0), [expenseRows]);
  const profit = received - spent;

  const receivable = React.useMemo(() => {
    const paidByQuote = new Map<string, number>();
    for (const p of payments) paidByQuote.set(p.quoteId, (paidByQuote.get(p.quoteId) ?? 0) + paymentUahValue(p));
    let total = 0;
    for (const inv of invoices) {
      if (!invoiceIsReceivable(inv.status)) continue;
      const paid = inv.quoteId ? paidByQuote.get(inv.quoteId) ?? 0 : 0;
      const outstanding = inv.amount - paid;
      if (outstanding > 0.005) total += outstanding;
    }
    return total;
  }, [invoices, payments]);

  const byEntity = React.useMemo(() => {
    const map = new Map<string | null, number>();
    for (const p of visiblePayments) {
      const entityId = p.accountId ? accountById.get(p.accountId)?.legalEntityId ?? null : null;
      map.set(entityId, (map.get(entityId) ?? 0) + paymentUahValue(p));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [visiblePayments, accountById]);

  const categoryName = React.useCallback(
    (id: string) => (id === "none" ? "Без статті" : categories.find((c) => c.id === id)?.name ?? "Стаття"),
    [categories]
  );

  const expensesByCategory = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const row of expenseRows) {
      if (row.uah === 0) continue;
      const key = row.expense.categoryId ?? "none";
      map.set(key, (map.get(key) ?? 0) + row.uah);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenseRows]);

  const taxSummary = React.useMemo(() => {
    const inRange = taxes.filter((t) => t.period >= start || range === "all");
    const due = inRange.filter((t) => t.status === "pending").reduce((s, t) => s + t.amount, 0);
    const paid = inRange.filter((t) => t.status === "paid").reduce((s, t) => s + t.amount, 0);
    const byType = new Map<string, number>();
    for (const t of inRange) byType.set(t.taxType, (byType.get(t.taxType) ?? 0) + t.amount);
    return { due, paid, byType: Array.from(byType.entries()) };
  }, [taxes, start, range]);

  const entityName = (id: string | null) => {
    if (!id) return "Без юрособи";
    const e = entities.find((x) => x.id === id);
    return e ? formatLegalEntityLabel(e) : "Невідома";
  };

  if (loading) {
    return (
      <FinanceSkeleton variant="stats" />
    );
  }

  return (
    <div className="space-y-5">
      {/* Період — у липкому барі, як перемикачі в решті розділів Фінансів. */}
      <FinanceStickyBar>
        <SegmentedGroup className={cn("inline-flex", SEGMENTED_GROUP_SM)}>
          {(["month", "year", "all"] as RangeKey[]).map((r) => (
            <button
              key={r}
              type="button"
              className={cn(SEGMENTED_TRIGGER_SM)}
              data-state={range === r ? "active" : "inactive"}
              onClick={() => setRange(r)}
            >
              {r === "month" ? "Цей місяць" : r === "year" ? "Цей рік" : "Весь час"}
            </button>
          ))}
        </SegmentedGroup>
      </FinanceStickyBar>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Отримано" value={uah(received)} />
        <Stat label="Витрати" value={uah(spent)} />
        <Stat label="Прибуток" value={uah(profit)} tone={profit < 0 ? "danger" : "success"} />
        <Stat label="Дебіторка (відкрита)" value={uah(receivable)} tone={receivable > 0 ? "warning" : undefined} />
      </div>

      {canSeeSensitive ? (
        <Section title="Отримано по контурах">
          <Rows rows={byEntity.map(([id, v]) => ({ label: entityName(id), value: uah(v) }))} empty="Немає надходжень" />
        </Section>
      ) : null}

      <Section title="Витрати по статтях">
        <Rows
          rows={expensesByCategory.map(([id, v]) => ({ label: categoryName(id), value: uah(v) }))}
          empty="Немає витрат"
        />
      </Section>

      <Section title="Податки">
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="До сплати" value={uah(taxSummary.due)} tone={taxSummary.due > 0 ? "warning" : undefined} />
          <Stat label="Сплачено" value={uah(taxSummary.paid)} />
        </div>
        {taxSummary.byType.length > 0 ? (
          <div className="mt-2">
            <Rows
              rows={taxSummary.byType.map(([t, v]) => ({
                label: TAX_TYPE_LABELS[t as keyof typeof TAX_TYPE_LABELS] ?? t,
                value: uah(v),
              }))}
              empty=""
            />
          </div>
        ) : null}
      </Section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" | "warning" }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/40 bg-card p-4",
        tone === "danger" && "border-destructive/40 bg-destructive/5",
        tone === "success" && "flag-success",
        tone === "warning" && "flag-warning"
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="figure mt-1.5 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Rows({ rows, empty }: { rows: { label: string; value: string }[]; empty: string }) {
  if (rows.length === 0) {
    return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  }
  return (
    <div className="grid gap-2">
      {rows.map((row, i) => (
        <div
          key={`${row.label}-${i}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card px-4 py-2.5"
        >
          <span className="truncate text-sm text-foreground">{row.label}</span>
          <span className="shrink-0 text-sm font-semibold text-foreground">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadDerivedOrders } from "@/features/orders/orderRecords";
import { loadPayrollEntries, periodKey } from "@/lib/payroll";
import { resolveWorkspaceId } from "@/lib/workspace";
import {
  listAccounts,
  listExpenseCategories,
  listExpenseEntries,
  listExpenses,
  listInvoices,
  listLegalEntities,
  listOrderMeta,
  listOrdersForFinance,
  listPayments,
  listPayoutMeta,
  listTaxes,
} from "./api";
import type {
  ExpenseEntry,
  FinanceAccount,
  FinanceExpense,
  FinanceExpenseCategory,
  FinanceInvoice,
  FinanceLegalEntity,
  FinanceOrderMeta,
  FinanceOrderRef,
  FinancePayment,
  FinanceTax,
} from "./types";

/**
 * React Query-шар для довідників Фінансів.
 *
 * НАВІЩО: вкладки Фінансів тягнуть ті самі списки (рахунки, юрособи, платежі,
 * інвойси…) кожна собі через useEffect — перемикання вкладки означало холодний
 * фетч і скелетон, навіть якщо дані щойно були на сусідній вкладці.
 * Гарячі сторінки (Quotes/Design/…) мають ручний session-кеш; Фінанси були
 * єдиним щоденним модулем зовсім без кешу.
 *
 * СТРАТЕГІЯ СВІЖОСТІ — refetchOnMount: "always":
 * кеш дає миттєвий перший рендер (isPending=false, коли дані вже є), а фоновий
 * рефетч ЗАВЖДИ звіряє з сервером. Тобто свіжість рівно та сама, що була з
 * useEffect, плюс зникає скелетон між вкладками. Обрано навмисно замість
 * staleTime-кешування: мутації розкидані по вкладках (створення витрати,
 * оплата інвойсу…) і НЕ інвалідують ключі — покладатись на staleTime означало б
 * показувати стухлі числа після запису на сусідній вкладці. Коли всі мутації
 * перейдуть на invalidateFinance(), можна буде підняти staleTime і прибрати
 * "always".
 *
 * staleTime: 15s все ж стоїть — він дедуплікує ЗАПАРАЛЕЛЕНІ запити одного
 * ресурсу під час одного заходу (кілька компонентів однієї вкладки просять
 * accounts одночасно → один мережевий виклик), не впливаючи на між-вкладкову
 * свіжість (refetchOnMount "always" сильніший за staleTime при монтуванні).
 */
const FINANCE_SHARED_OPTIONS = {
  refetchOnMount: "always",
  staleTime: 15_000,
  gcTime: 30 * 60_000,
} as const;

export const financeKeys = {
  all: (teamId: string) => ["finances", teamId] as const,
  payments: (teamId: string) => ["finances", teamId, "payments"] as const,
  accounts: (teamId: string) => ["finances", teamId, "accounts"] as const,
  legalEntities: (teamId: string) => ["finances", teamId, "legal-entities"] as const,
  invoices: (teamId: string) => ["finances", teamId, "invoices"] as const,
  expenses: (teamId: string) => ["finances", teamId, "expenses"] as const,
  taxes: (teamId: string) => ["finances", teamId, "taxes"] as const,
  derivedOrders: (teamId: string, userId: string | null) =>
    ["finances", teamId, "derived-orders", userId ?? ""] as const,
  pendingPayout: (teamId: string, userId: string | null, period: string) =>
    ["finances", teamId, "pending-payout", userId ?? "", period] as const,
  orderMeta: (teamId: string) => ["finances", teamId, "order-meta"] as const,
  orderRefs: (teamId: string, userId: string | null) =>
    ["finances", teamId, "order-refs", userId ?? ""] as const,
  expenseCategories: (teamId: string) => ["finances", teamId, "expense-categories"] as const,
  expenseEntries: (teamId: string) => ["finances", teamId, "expense-entries"] as const,
};

export function useFinancePayments(teamId: string | null) {
  return useQuery<FinancePayment[]>({
    queryKey: financeKeys.payments(teamId ?? ""),
    queryFn: () => listPayments(teamId as string),
    enabled: !!teamId,
    ...FINANCE_SHARED_OPTIONS,
  });
}

export function useFinanceAccounts(teamId: string | null) {
  return useQuery<FinanceAccount[]>({
    queryKey: financeKeys.accounts(teamId ?? ""),
    queryFn: () => listAccounts(teamId as string),
    enabled: !!teamId,
    ...FINANCE_SHARED_OPTIONS,
  });
}

export function useFinanceLegalEntities(teamId: string | null) {
  return useQuery<FinanceLegalEntity[]>({
    queryKey: financeKeys.legalEntities(teamId ?? ""),
    queryFn: () => listLegalEntities(teamId as string),
    enabled: !!teamId,
    ...FINANCE_SHARED_OPTIONS,
  });
}

export function useFinanceInvoices(teamId: string | null) {
  return useQuery<FinanceInvoice[]>({
    queryKey: financeKeys.invoices(teamId ?? ""),
    queryFn: () => listInvoices(teamId as string),
    enabled: !!teamId,
    ...FINANCE_SHARED_OPTIONS,
  });
}

export function useFinanceExpenses(teamId: string | null) {
  return useQuery<FinanceExpense[]>({
    queryKey: financeKeys.expenses(teamId ?? ""),
    queryFn: () => listExpenses(teamId as string),
    enabled: !!teamId,
    ...FINANCE_SHARED_OPTIONS,
  });
}

export function useFinanceTaxes(teamId: string | null) {
  return useQuery<FinanceTax[]>({
    queryKey: financeKeys.taxes(teamId ?? ""),
    queryFn: () => listTaxes(teamId as string),
    enabled: !!teamId,
    ...FINANCE_SHARED_OPTIONS,
  });
}

/** Замовлення для підпису боржників — best-effort: помилка = порожня мапа, дашборд не блокується. */
export function useFinanceDerivedOrderNames(teamId: string | null, userId: string | null) {
  return useQuery({
    queryKey: financeKeys.derivedOrders(teamId ?? "", userId),
    queryFn: async () => {
      try {
        const records = await loadDerivedOrders(teamId as string, userId);
        return new Map(records.map((r) => [r.quoteId, { customerName: r.customerName }]));
      } catch {
        return new Map<string, { customerName: string }>();
      }
    },
    enabled: !!teamId,
    ...FINANCE_SHARED_OPTIONS,
  });
}

/** Категорії витрат. Best-effort: помилка → порожній список (витрати без категорій, не помилка вкладки). */
export function useFinanceExpenseCategories(teamId: string | null) {
  return useQuery<FinanceExpenseCategory[]>({
    queryKey: financeKeys.expenseCategories(teamId ?? ""),
    queryFn: async () => {
      try {
        return await listExpenseCategories(teamId as string);
      } catch (error) {
        console.error("[finance] listExpenseCategories failed", error);
        return [];
      }
    },
    enabled: !!teamId,
    ...FINANCE_SHARED_OPTIONS,
  });
}

/**
 * Журнали датованих записів (expenseId → записи) для регулярних витрат зі
 * змінною сумою. Best-effort → порожня мапа. УВАГА: вкладка Витрат тримає
 * журнал у ЛОКАЛЬНОМУ стані з оптимістичними правками і гідратується звідси
 * з guard-ом — не переводь її сліпо на query.data (див. FinanceExpenses).
 */
export function useFinanceExpenseEntries(teamId: string | null) {
  return useQuery<Map<string, ExpenseEntry[]>>({
    queryKey: financeKeys.expenseEntries(teamId ?? ""),
    queryFn: async () => {
      try {
        return await listExpenseEntries(teamId as string);
      } catch (error) {
        console.error("[finance] listExpenseEntries failed", error);
        return new Map<string, ExpenseEntry[]>();
      }
    },
    enabled: !!teamId,
    ...FINANCE_SHARED_OPTIONS,
  });
}

/** Класифікація замовлень (тип + юрособа) з finance_order_meta. */
export function useFinanceOrderMeta(teamId: string | null) {
  return useQuery<Map<string, FinanceOrderMeta>>({
    queryKey: financeKeys.orderMeta(teamId ?? ""),
    queryFn: () => listOrderMeta(teamId as string),
    enabled: !!teamId,
    ...FINANCE_SHARED_OPTIONS,
  });
}

/** Замовлення для прив'язки рахунків. Best-effort: помилка → порожній список. */
export function useFinanceOrderRefs(teamId: string | null, userId: string | null) {
  return useQuery<FinanceOrderRef[]>({
    queryKey: financeKeys.orderRefs(teamId ?? "", userId),
    queryFn: async () => {
      try {
        return await listOrdersForFinance(teamId as string, userId);
      } catch (error) {
        console.error("[finance] order refs failed", error);
        return [];
      }
    },
    enabled: !!teamId,
    ...FINANCE_SHARED_OPTIONS,
  });
}

/**
 * Незакриті виплати команді за поточний місяць (для календаря платежів).
 * Best-effort: будь-яка помилка → нулі, календар не блокується — та сама
 * поведінка, що була в ручному ефекті. Період входить у ключ, тож зміна
 * місяця посеред сесії дає окремий кеш-запис, а не перезапис минулого.
 */
export function useFinancePendingPayout(teamId: string | null, userId: string | null) {
  const now = new Date();
  const period = periodKey(now.getFullYear(), now.getMonth() + 1);
  return useQuery({
    queryKey: financeKeys.pendingPayout(teamId ?? "", userId, period),
    queryFn: async () => {
      try {
        const wsId = await resolveWorkspaceId(userId as string);
        if (!wsId) return { total: 0, count: 0 };
        const [entries, meta] = await Promise.all([
          loadPayrollEntries(wsId, period),
          listPayoutMeta(teamId as string, period),
        ]);
        let payout = { total: 0, count: 0 };
        entries.forEach((entry, uid) => {
          if (meta.get(uid)?.status !== "paid" && entry.totalAmount > 0) {
            payout = { total: payout.total + entry.totalAmount, count: payout.count + 1 };
          }
        });
        return payout;
      } catch (error) {
        console.error("[finance] pending payout failed", error);
        return { total: 0, count: 0 };
      }
    },
    enabled: !!teamId && !!userId,
    ...FINANCE_SHARED_OPTIONS,
  });
}

/**
 * Інвалідація після мутацій. Поки мутації вкладок її не викликають, свіжість
 * забезпечує refetchOnMount:"always"; хелпер існує, щоб нові мутації одразу
 * писались правильно.
 */
export function useInvalidateFinance(teamId: string | null) {
  const queryClient = useQueryClient();
  return () => {
    if (!teamId) return Promise.resolve();
    return queryClient.invalidateQueries({ queryKey: financeKeys.all(teamId) });
  };
}

import * as React from "react";
import { toast } from "sonner";
import {
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Loader2,
  PiggyBank,
  Pin,
  Plus,
  RefreshCw,
  X,
  type LucideIcon,
} from "lucide-react";
import { EditIconButton, DeleteIconButton } from "./financeRowActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import { SubscriptionLogo } from "./SubscriptionLogo";
import {
  convertToUah,
  formatCurrencyAmount,
  fxRateFor,
  useFxRates,
  type FxCurrency,
  type FxRates,
} from "@/lib/fxRates";
import { OrderPickerInline } from "./OrderPickerInline";
import {
  createExpense,
  deleteExpense,
  listAccounts,
  listExpenseCategories,
  listExpenses,
  listLegalEntities,
  listOrdersForFinance,
  updateExpense,
  type ExpenseAllocationInput,
  type ExpenseInput,
} from "./api";
import {
  BILLING_PERIOD_LABELS,
  BILLING_PERIOD_MONTHS,
  billingPeriodOf,
  EXPENSE_CATEGORY_KIND_LABELS,
  expenseMonthlyUah,
  expenseUahAmount,
  formatLegalEntityLabel,
  type BillingPeriod,
  type FinanceAccount,
  type FinanceExpense,
  type FinanceExpenseCategory,
  type FinanceLegalEntity,
  type FinanceOrderRef,
} from "./types";
import { getExpenseCategoryIcon } from "./expenseCategoryIcons";
import { useFinanceToolbarActions } from "./financeToolbar";
import {
  getSubscriptionBrand,
  guessSubscriptionBrand,
  isServiceExpense,
  resolveSubscriptionLogo,
  SUBSCRIPTION_BRANDS,
} from "./subscriptionBrands";

type FinanceExpensesProps = {
  teamId: string | null;
  userId: string | null;
  canSeeSensitive: boolean;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const MONTHS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

// «YYYY-MM» → «Липень 2026»; empty key → «Без дати».
const monthLabel = (key: string) => {
  if (!key) return "Без дати";
  const [year, month] = key.split("-").map(Number);
  return `${MONTHS[(month || 1) - 1]} ${year}`;
};

// Shift a «YYYY-MM» key by a number of months.
const shiftMonthKey = (key: string, delta: number) => {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, (month || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const formatDate = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("uk-UA");
  } catch {
    return value;
  }
};

const daysUntil = (date: string) => {
  const target = new Date(`${date}T00:00:00`).getTime();
  const today = new Date(`${todayISO()}T00:00:00`).getTime();
  return Math.round((target - today) / 86400000);
};

// «через 12 днів» / «сьогодні» / «прострочено на 3 дні» — коротка підказка біля дати.
const chargeCountdown = (date: string) => {
  const days = daysUntil(date);
  if (days === 0) return "сьогодні";
  if (days === 1) return "завтра";
  if (days > 1) return `через ${days} дн.`;
  return `прострочено на ${Math.abs(days)} дн.`;
};

// «$200» або «200 ₴» — рівно в тій валюті, в якій підписку виставили.
const nativeAmountLabel = (expense: Pick<FinanceExpense, "amount" | "currency">) =>
  expense.currency === "UAH"
    ? formatOrderMoney(expense.amount, "UAH")
    : formatCurrencyAmount(expense.amount, expense.currency);

// «≈ 8 400 ₴» — гривневий еквівалент валютної суми; для гривні не показуємо.
const uahHint = (expense: FinanceExpense, rates: FxRates) => {
  if (expense.currency === "UAH") return null;
  const uah = expenseUahAmount(expense, rates);
  return uah === null ? "курс невідомий" : `≈ ${formatOrderMoney(uah, "UAH")}`;
};

export function FinanceExpenses({ teamId, userId, canSeeSensitive }: FinanceExpensesProps) {
  const [expenses, setExpenses] = React.useState<FinanceExpense[]>([]);
  const [categories, setCategories] = React.useState<FinanceExpenseCategory[]>([]);
  const [accounts, setAccounts] = React.useState<FinanceAccount[]>([]);
  const [entities, setEntities] = React.useState<FinanceLegalEntity[]>([]);
  const [orders, setOrders] = React.useState<FinanceOrderRef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [ordersLoading, setOrdersLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      // Critical path: if expenses fail, show error and bail.
      const nextExpenses = await listExpenses(teamId);
      setExpenses(nextExpenses);
      // Supporting data: failures here are logged but don't wipe the expense list.
      const [nextCategories, nextAccounts, nextEntities] = await Promise.all([
        listExpenseCategories(teamId).catch((e) => {
          console.error("[finance] listExpenseCategories failed", e);
          return [] as FinanceExpenseCategory[];
        }),
        listAccounts(teamId).catch((e) => {
          console.error("[finance] listAccounts failed", e);
          return [] as FinanceAccount[];
        }),
        listLegalEntities(teamId).catch((e) => {
          console.error("[finance] listLegalEntities failed", e);
          return [] as FinanceLegalEntity[];
        }),
      ]);
      setCategories(nextCategories);
      setAccounts(nextAccounts);
      setEntities(nextEntities);
    } catch (error) {
      console.error("[finance] listExpenses failed", error);
      toast.error("Не вдалося завантажити витрати", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  React.useEffect(() => {
    if (!teamId) return;
    let active = true;
    setOrdersLoading(true);
    void listOrdersForFinance(teamId, userId)
      .then((rows) => active && setOrders(rows))
      .catch(() => active && setOrders([]))
      .finally(() => active && setOrdersLoading(false));
    return () => {
      active = false;
    };
  }, [teamId, userId]);

  const categoryById = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const accountById = React.useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const visibleAccounts = React.useMemo(
    () => (canSeeSensitive ? accounts : accounts.filter((a) => !a.isSensitive)),
    [accounts, canSeeSensitive]
  );

  // Hide expenses paid from sensitive accounts from non-top roles.
  const visibleExpenses = React.useMemo(() => {
    if (canSeeSensitive) return expenses;
    return expenses.filter((e) => {
      const account = e.accountId ? accountById.get(e.accountId) : null;
      return !account?.isSensitive;
    });
  }, [expenses, accountById, canSeeSensitive]);

  // Курс той самий, що в шапці застосунку (Мінфін, міжбанк).
  const rates = useFxRates();

  const { fixed, variable } = React.useMemo(() => {
    const fixedList: FinanceExpense[] = [];
    const variableList: FinanceExpense[] = [];
    for (const expense of visibleExpenses) {
      if (expense.isRecurring) fixedList.push(expense);
      else variableList.push(expense);
    }
    // Найдорожче на місяць — зверху, щоб одразу було видно, що з'їдає бюджет.
    fixedList.sort((a, b) => (expenseMonthlyUah(b, rates) ?? 0) - (expenseMonthlyUah(a, rates) ?? 0));
    return { fixed: fixedList, variable: variableList };
  }, [visibleExpenses, rates]);

  // Сталі витрати — місячна база, яка враховується в КОЖНОМУ місяці.
  // Річний платіж ділиться на 12, квартальний — на 3, тож «Разом за місяць»
  // показує рівну щомісячну вартість, а не пік у місяці списання.
  const fixedBaseline = React.useMemo(
    () => fixed.reduce((sum, e) => sum + (expenseMonthlyUah(e, rates) ?? 0), 0),
    [fixed, rates]
  );

  // Дві різні природи витрат в одному блоці читались як каша: підписка на Dropbox
  // і оренда офісу — це різні рішення й різні розмови. Ділимо за наявністю бренду.
  const { services, recurringOther } = React.useMemo(() => {
    const servicesList: FinanceExpense[] = [];
    const otherList: FinanceExpense[] = [];
    for (const expense of fixed) {
      if (isServiceExpense(expense)) servicesList.push(expense);
      else otherList.push(expense);
    }
    return { services: servicesList, recurringOther: otherList };
  }, [fixed]);

  const sumMonthly = React.useCallback(
    (list: FinanceExpense[]) => list.reduce((sum, e) => sum + (expenseMonthlyUah(e, rates) ?? 0), 0),
    [rates]
  );
  const servicesBaseline = React.useMemo(() => sumMonthly(services), [services, sumMonthly]);
  const otherBaseline = React.useMemo(() => sumMonthly(recurringOther), [recurringOther, sumMonthly]);

  // Скільки з місячної бази — це не-щомісячні підписки (річні/квартальні).
  const spreadBaseline = React.useMemo(
    () => sumMonthly(fixed.filter((e) => billingPeriodOf(e) !== "monthly")),
    [fixed, sumMonthly]
  );

  const missingRateCount = React.useMemo(
    () => fixed.filter((e) => expenseMonthlyUah(e, rates) === null).length,
    [fixed, rates]
  );

  // Month-focused view: one month at a time so the page never becomes an endless
  // scroll as data accumulates. The overview strip handles cross-month navigation.
  const currentKey = React.useMemo(() => todayISO().slice(0, 7), []);
  const [selectedMonth, setSelectedMonth] = React.useState(currentKey);
  const [fixedOpen, setFixedOpen] = React.useState(true);

  // Variable expenses bucketed by month key («YYYY-MM»; «» = no date).
  const variableByMonth = React.useMemo(() => {
    const map = new Map<string, FinanceExpense[]>();
    for (const expense of variable) {
      const key = (expense.expenseDate ?? "").slice(0, 7);
      const list = map.get(key);
      if (list) list.push(expense);
      else map.set(key, [expense]);
    }
    return map;
  }, [variable]);

  const monthTotalFor = React.useCallback(
    (key: string) =>
      fixedBaseline +
      (variableByMonth.get(key)?.reduce((sum, e) => sum + (expenseUahAmount(e, rates) ?? 0), 0) ?? 0),
    [fixedBaseline, variableByMonth, rates]
  );

  // Continuous last 12 calendar months (ending at the current month) for the
  // overview trend strip — independent of which months happen to have data.
  const overview = React.useMemo(() => {
    const months: { key: string; total: number }[] = [];
    for (let i = 11; i >= 0; i -= 1) {
      const key = shiftMonthKey(currentKey, -i);
      months.push({ key, total: monthTotalFor(key) });
    }
    return months;
  }, [currentKey, monthTotalFor]);

  const maxOverviewTotal = React.useMemo(
    () => overview.reduce((max, m) => Math.max(max, m.total), 0),
    [overview]
  );

  const selectedItems = React.useMemo(
    () =>
      (variableByMonth.get(selectedMonth) ?? [])
        .slice()
        .sort((a, b) => (b.expenseDate ?? "").localeCompare(a.expenseDate ?? "")),
    [variableByMonth, selectedMonth]
  );
  const selectedVariableSum = React.useMemo(
    () => selectedItems.reduce((sum, e) => sum + (expenseUahAmount(e, rates) ?? 0), 0),
    [selectedItems, rates]
  );
  const undatedItems = React.useMemo(() => variableByMonth.get("") ?? [], [variableByMonth]);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FinanceExpense | null>(null);

  const openCreate = React.useCallback(() => {
    setEditing(null);
    setDialogOpen(true);
  }, []);

  // Кнопка живе в шапці сторінки поруч із «Фінанси» — не з'їдає рядок над списком.
  useFinanceToolbarActions(
    () => (
      <Button type="button" size="sm" className="h-9 gap-1.5" onClick={openCreate}>
        <Plus className="h-4 w-4" /> Додати витрату
      </Button>
    ),
    [openCreate]
  );

  const remove = async (expense: FinanceExpense) => {
    if (!teamId) return;
    if (!window.confirm("Видалити цю витрату?")) return;
    try {
      await deleteExpense(teamId, expense.id);
      await reload();
      toast.success("Витрату видалено");
    } catch (error) {
      toast.error("Не вдалося видалити витрату", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    }
  };

  const rowActions = (expense: FinanceExpense) => (
    <div className="flex shrink-0 items-center gap-1.5">
      <EditIconButton
        onClick={() => {
          setEditing(expense);
          setDialogOpen(true);
        }}
      />
      <DeleteIconButton onClick={() => void remove(expense)} />
    </div>
  );

  const renderRow = (expense: FinanceExpense) => {
    const category = expense.categoryId ? categoryById.get(expense.categoryId) : null;
    const account = expense.accountId ? accountById.get(expense.accountId) : null;
    const allocatedTotal = expense.allocations.reduce((sum, a) => sum + a.amount, 0);
    const uah = uahHint(expense, rates);
    const title = expense.supplierName?.trim() || category?.name || "Витрата";
    return (
      <div
        key={expense.id}
        className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3"
      >
        <div className="flex min-w-0 gap-3">
          <SubscriptionLogo
            logoUrl={resolveSubscriptionLogo(expense)}
            name={title}
            categoryName={category?.name}
            categoryKind={category?.kind}
            size={34}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{nativeAmountLabel(expense)}</span>
              {uah ? <span className="text-xs text-muted-foreground">{uah}</span> : null}
              {category ? (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {category.name}
                </Badge>
              ) : null}
              {expense.allocations.length > 0 ? (
                <Badge variant="outline" className="text-[10px] border-info/40 bg-info/10 text-info-foreground">
                  На {expense.allocations.length} замовл. · {formatOrderMoney(allocatedTotal, "UAH")}
                </Badge>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>{formatDate(expense.expenseDate)}</span>
              {expense.supplierName ? <span>{expense.supplierName}</span> : null}
              {account ? <span>{account.name}</span> : null}
              {expense.notes ? <span className="truncate">{expense.notes}</span> : null}
            </div>
          </div>
        </div>
        {rowActions(expense)}
      </div>
    );
  };

  // Стала витрата / підписка: лого сервісу, сума у своїй валюті + скільки це на місяць у грн.
  const renderSubscriptionRow = (expense: FinanceExpense) => {
    const category = expense.categoryId ? categoryById.get(expense.categoryId) : null;
    const account = expense.accountId ? accountById.get(expense.accountId) : null;
    const period = billingPeriodOf(expense);
    const brand = getSubscriptionBrand(expense.vendorKey) ?? guessSubscriptionBrand(expense.supplierName, expense.notes);
    // Назва сервісу — головне в рядку. Ніяких «стала витрата»: як не вписали руками,
    // беремо бренд, далі статтю витрат, і тільки в найгіршому разі — «Без назви».
    const title = expense.supplierName?.trim() || brand?.label || category?.name || "Без назви";
    const logo = resolveSubscriptionLogo(expense);
    const monthly = expenseMonthlyUah(expense, rates);
    const overdue = expense.nextChargeDate ? daysUntil(expense.nextChargeDate) < 0 : false;

    return (
      <div
        key={expense.id}
        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <SubscriptionLogo
            logoUrl={logo}
            name={title}
            categoryName={category?.name}
            categoryKind={category?.kind}
            size={36}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-sm font-semibold text-foreground">{title}</span>
              <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                {period === "monthly" ? <Pin className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
                {BILLING_PERIOD_LABELS[period]}
              </Badge>
              {category ? (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {category.name}
                </Badge>
              ) : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                {nativeAmountLabel(expense)} / {period === "monthly" ? "міс" : period === "quarterly" ? "квартал" : "рік"}
              </span>
              {expense.nextChargeDate ? (
                <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive")}>
                  <CalendarClock className="h-3 w-3" />
                  {formatDate(expense.nextChargeDate)} · {chargeCountdown(expense.nextChargeDate)}
                </span>
              ) : null}
              {account ? <span>{account.name}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums text-foreground">
              {monthly === null ? "—" : formatOrderMoney(monthly, "UAH")}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {monthly === null ? "курс невідомий" : "на місяць"}
            </div>
          </div>
          {rowActions(expense)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
        </div>
      ) : visibleExpenses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background">
            <PiggyBank className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Ще немає витрат. Підписки (річні платежі розбиваються на місяці, валютні — за курсом) і змінні
            витрати, які можна розподілити між замовленнями.
          </p>
          <Button type="button" size="sm" className="mt-3 gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Додати витрату
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Навігатор місяця + тренд за 12 місяців одним рядком: окремий блок огляду
              з'їдав ~110px висоти заради тієї ж інформації. Бар = клік на місяць. */}
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/10 px-2 py-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Попередній місяць"
              onClick={() => setSelectedMonth((k) => shiftMonthKey(k, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[132px] text-center text-sm font-semibold">{monthLabel(selectedMonth)}</div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Наступний місяць"
              onClick={() => setSelectedMonth((k) => shiftMonthKey(k, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {selectedMonth !== currentKey ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => setSelectedMonth(currentKey)}
              >
                Поточний
              </Button>
            ) : null}

            {/* На вузьких екранах смуга ховається — там важливіші самі витрати. */}
            <div className="ml-auto hidden items-end gap-1 sm:flex">
              {overview.map((mo) => {
                const active = mo.key === selectedMonth;
                const height =
                  maxOverviewTotal > 0 ? Math.max(3, Math.round((mo.total / maxOverviewTotal) * 24)) : 3;
                return (
                  <button
                    key={mo.key}
                    type="button"
                    onClick={() => setSelectedMonth(mo.key)}
                    aria-label={`${monthLabel(mo.key)} · ${formatOrderMoney(mo.total, "UAH")}`}
                    title={`${monthLabel(mo.key)} · ${formatOrderMoney(mo.total, "UAH")}`}
                    className="group flex h-8 w-5 shrink-0 cursor-pointer items-end justify-center rounded-sm pb-0.5 transition-colors hover:bg-muted/60"
                  >
                    <span
                      style={{ height }}
                      className={cn(
                        "w-2.5 rounded-t transition-colors",
                        active ? "bg-primary" : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50"
                      )}
                    />
                  </button>
                );
              })}
              <span className="ml-1 self-center text-[10px] uppercase tracking-wide text-muted-foreground">
                12 міс
              </span>
            </div>
          </div>

          {/* KPI cells for the selected month */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ExpenseKpi
              label="Сервіси та підписки"
              value={formatOrderMoney(servicesBaseline, "UAH")}
              hint={rates.usdUah ? `$ ${rates.usdUah.toFixed(2)}` : undefined}
            />
            <ExpenseKpi label="Інші регулярні" value={formatOrderMoney(otherBaseline, "UAH")} />
            <ExpenseKpi label="Змінні за місяць" value={formatOrderMoney(selectedVariableSum, "UAH")} />
            <ExpenseKpi
              label="Разом за місяць"
              value={formatOrderMoney(fixedBaseline + selectedVariableSum, "UAH")}
              accent
            />
          </div>

          {/* Підписки та сталі витрати — однакова місячна база в кожному місяці */}
          {fixed.length > 0 ? (
            <div className="rounded-xl border border-border/60">
              <button
                type="button"
                onClick={() => setFixedOpen((o) => !o)}
                className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-left"
              >
                <span className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3" /> Регулярні витрати
                  </span>
                  <Badge variant="outline" className="text-[10px] font-semibold text-foreground">
                    {formatOrderMoney(fixedBaseline, "UAH")} / міс
                  </Badge>
                  {spreadBaseline > 0 ? (
                    <span className="text-[10px] font-normal normal-case text-muted-foreground">
                      з них {formatOrderMoney(spreadBaseline, "UAH")} — річні/квартальні, розбиті на місяці
                    </span>
                  ) : null}
                  {missingRateCount > 0 ? (
                    <span className="text-[10px] font-normal normal-case text-destructive">
                      {missingRateCount} у валюті без курсу
                    </span>
                  ) : null}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    fixedOpen && "rotate-180"
                  )}
                />
              </button>
              {fixedOpen ? (
                <div className="space-y-3 px-3 pb-3">
                  <ExpenseGroup
                    storageKey="services"
                    icon={Cloud}
                    label="Сервіси та підписки"
                    count={services.length}
                    total={servicesBaseline}
                    items={services}
                    renderItem={renderSubscriptionRow}
                  />
                  <ExpenseGroup
                    storageKey="other"
                    icon={Building2}
                    label="Інші регулярні платежі"
                    count={recurringOther.length}
                    total={otherBaseline}
                    items={recurringOther}
                    renderItem={renderSubscriptionRow}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Variable expenses for the selected month */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Змінні витрати · {monthLabel(selectedMonth)}
            </h3>
            {selectedItems.length > 0 ? (
              <div className="grid gap-2">{selectedItems.map(renderRow)}</div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
                Немає змінних витрат за {monthLabel(selectedMonth)}.
              </div>
            )}
          </div>

          {/* Variable expenses without a date — surfaced so they aren't lost */}
          {undatedItems.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Без дати ({undatedItems.length})
              </h3>
              <div className="grid gap-2">{undatedItems.map(renderRow)}</div>
            </div>
          ) : null}
        </div>
      )}

      {dialogOpen ? (
        <ExpenseDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          teamId={teamId}
          userId={userId}
          editing={editing}
          categories={categories}
          accounts={visibleAccounts}
          entities={entities}
          orders={orders}
          ordersLoading={ordersLoading}
          onSaved={reload}
        />
      ) : null}
    </div>
  );
}

// Підгрупа всередині регулярних витрат: заголовок з кількістю та місячною сумою.
// Порожню групу не малюємо — краще менше рамок, ніж «0 позицій».
// Згортається окремо від сусідньої: у згорнутому вигляді лишається головне —
// скільки позицій і скільки це на місяць. Вибір запам'ятовується між сесіями.
function ExpenseGroup({
  storageKey,
  icon: Icon,
  label,
  count,
  total,
  items,
  renderItem,
}: {
  storageKey: string;
  icon: LucideIcon;
  label: string;
  count: number;
  total: number;
  items: FinanceExpense[];
  renderItem: (expense: FinanceExpense) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(() => readGroupOpen(storageKey));

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(`${GROUP_OPEN_STORAGE_PREFIX}${storageKey}`, next ? "1" : "0");
      } catch {
        // Приватний режим / переповнене сховище — не критично, просто не запам'ятаємо.
      }
      return next;
    });
  };

  if (count === 0) return null;
  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="mb-1.5 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
          <Icon className="h-3 w-3" />
          {label}
          <span className="font-normal normal-case text-muted-foreground/70">· {count}</span>
        </span>
        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
          {formatOrderMoney(total, "UAH")} / міс
        </span>
      </button>
      {open ? <div className="grid gap-2">{items.map(renderItem)}</div> : null}
    </section>
  );
}

function ExpenseKpi({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card p-3",
        accent && "border-primary/40 bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        {hint ? <span className="text-[10px] text-muted-foreground/80">{hint}</span> : null}
      </div>
      <div
        className={cn(
          "mt-1 text-base font-semibold tabular-nums text-foreground",
          accent && "text-primary"
        )}
      >
        {value}
      </div>
    </div>
  );
}

const GROUP_OPEN_STORAGE_PREFIX = "tosho_finance_expense_group_";

// За замовчуванням група розгорнута: ховати дані мовчки не можна.
const readGroupOpen = (key: string) => {
  try {
    return window.localStorage.getItem(`${GROUP_OPEN_STORAGE_PREFIX}${key}`) !== "0";
  } catch {
    return true;
  }
};

type AllocRow = { quoteId: string; amount: string };

// Три типи витрати в одній формі. Замість чекбокса «стала?» — явний вибір,
// бо від нього залежить і набір полів, і група, в якій витрата опиниться в списку.
type ExpenseFormKind = "one_off" | "service" | "recurring";

const EXPENSE_KIND_OPTIONS: { value: ExpenseFormKind; label: string; hint: string }[] = [
  { value: "one_off", label: "Разова", hint: "Купівля під замовлення" },
  { value: "service", label: "Сервіс", hint: "Dropbox, Adobe, Supabase…" },
  { value: "recurring", label: "Регулярний платіж", hint: "Оренда, комуналка, прибирання" },
];

function ExpenseDialog({
  open,
  onOpenChange,
  teamId,
  userId,
  editing,
  categories,
  accounts,
  entities,
  orders,
  ordersLoading,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string | null;
  userId: string | null;
  editing: FinanceExpense | null;
  categories: FinanceExpenseCategory[];
  accounts: FinanceAccount[];
  entities: FinanceLegalEntity[];
  orders: FinanceOrderRef[];
  ordersLoading: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const rates = useFxRates();
  const [categoryId, setCategoryId] = React.useState(editing?.categoryId ?? "");
  const [amount, setAmount] = React.useState(editing ? String(editing.amount) : "");
  const [currency, setCurrency] = React.useState<FxCurrency>(editing?.currency ?? "UAH");
  const [supplierName, setSupplierName] = React.useState(editing?.supplierName ?? "");
  const [vendorKey, setVendorKey] = React.useState(editing?.vendorKey ?? "");
  const [expenseDate, setExpenseDate] = React.useState(editing?.expenseDate ?? todayISO());
  const [accountId, setAccountId] = React.useState(editing?.accountId ?? "");
  const [legalEntityId, setLegalEntityId] = React.useState(editing?.legalEntityId ?? "");
  const [expenseKind, setExpenseKind] = React.useState<ExpenseFormKind>(() => {
    if (!editing?.isRecurring) return "one_off";
    return isServiceExpense(editing) ? "service" : "recurring";
  });
  const isRecurring = expenseKind !== "one_off";
  const [billingPeriod, setBillingPeriod] = React.useState<BillingPeriod>(
    editing ? billingPeriodOf(editing) : "monthly"
  );
  const [nextChargeDate, setNextChargeDate] = React.useState(editing?.nextChargeDate ?? "");
  const [notes, setNotes] = React.useState(editing?.notes ?? "");
  const [allocations, setAllocations] = React.useState<AllocRow[]>(
    editing?.allocations.map((a) => ({ quoteId: a.quoteId, amount: String(a.amount) })) ?? []
  );
  const [saving, setSaving] = React.useState(false);

  const amountNum = Number(amount.replace(",", ".")) || 0;
  const allocatedNum = allocations.reduce((sum, a) => sum + (Number(a.amount.replace(",", ".")) || 0), 0);
  const remaining = Math.round((amountNum - allocatedNum) * 100) / 100;

  const uahValue = convertToUah(amountNum, currency, rates);
  const monthlyUah = uahValue === null ? null : uahValue / BILLING_PERIOD_MONTHS[billingPeriod];
  const currentRate = fxRateFor(currency, rates);

  // Вибір сервісу підставляє назву й типову валюту. Назву перетираємо тільки тоді,
  // коли вона порожня або лишилась від попереднього бренду — введене руками не чіпаємо.
  const applyBrand = (key: string) => {
    const previous = getSubscriptionBrand(vendorKey);
    const brand = getSubscriptionBrand(key);
    setVendorKey(key);
    if (!brand) return;
    const typedByHand = supplierName.trim() && supplierName.trim() !== previous?.label;
    if (!typedByHand) setSupplierName(brand.label);
    if (!editing) setCurrency(brand.currency);
  };

  const usedQuoteIds = React.useMemo(
    () => new Set(allocations.map((a) => a.quoteId).filter(Boolean)),
    [allocations]
  );

  const addAllocation = () => setAllocations((prev) => [...prev, { quoteId: "", amount: "" }]);
  const updateAllocation = (index: number, patch: Partial<AllocRow>) =>
    setAllocations((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeAllocation = (index: number) =>
    setAllocations((prev) => prev.filter((_, i) => i !== index));

  const submit = async () => {
    if (!teamId) return;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Вкажіть коректну суму витрати.");
      return;
    }
    if (allocatedNum - amountNum > 0.005) {
      toast.error("Розподілено більше, ніж сума витрати.");
      return;
    }
    const allocInput: ExpenseAllocationInput[] = allocations
      .filter((a) => a.quoteId)
      .map((a) => ({ quoteId: a.quoteId, amount: Number(a.amount.replace(",", ".")) || 0 }))
      .filter((a) => a.amount > 0);

    const input: ExpenseInput = {
      categoryId: categoryId || null,
      amount: amountNum,
      currency,
      // Для разової валютної витрати фіксуємо курс дня — щоб історія не «пливла».
      // Для підписки курс не фіксуємо: план має рахуватись за поточним.
      fxRate: !isRecurring && currency !== "UAH" ? currentRate : null,
      supplierName,
      // Бренд і лого лишаються тільки в сервісів — інакше оренда офісу поїхала б
      // у групу «Сервіси та підписки».
      vendorKey: expenseKind === "service" ? vendorKey || null : null,
      logoUrl: expenseKind === "service" ? editing?.logoUrl ?? null : null,
      expenseDate,
      accountId: accountId || null,
      legalEntityId: legalEntityId || null,
      isRecurring,
      recurrence: isRecurring ? billingPeriod : null,
      nextChargeDate: isRecurring ? nextChargeDate || null : null,
      notes,
      enteredBy: userId,
      allocations: allocInput,
    };

    setSaving(true);
    try {
      if (editing) await updateExpense(teamId, editing.id, input);
      else await createExpense(teamId, input);
      onOpenChange(false);
      await onSaved();
      toast.success(editing ? "Витрату оновлено" : "Витрату додано");
    } catch (error) {
      toast.error("Не вдалося зберегти витрату", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Редагувати витрату" : "Нова витрата"}</DialogTitle>
          <DialogDescription>
            {expenseKind === "service"
              ? "Підписка на зовнішній сервіс. Річна оплата розіб'ється по місяцях."
              : expenseKind === "recurring"
                ? "Платіж, який повторюється щомісяця чи щороку: оренда, комуналка, прибирання."
                : "Разова витрата. Її можна розподілити між замовленнями для коректної маржі."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* Тип витрати задає і поля форми, і групу в списку — тому він перший і явний. */}
          <div
            role="radiogroup"
            aria-label="Тип витрати"
            className="grid grid-cols-3 gap-1 rounded-xl border border-border/60 bg-muted/20 p-1"
          >
            {EXPENSE_KIND_OPTIONS.map((option) => {
              const active = expenseKind === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={option.hint}
                  onClick={() => setExpenseKind(option.value)}
                  className={cn(
                    "cursor-pointer rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Сума <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-9"
                />
                <Select value={currency} onValueChange={(v) => setCurrency(v as FxCurrency)}>
                  <SelectTrigger className="h-9 w-[86px] shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UAH">₴ грн</SelectItem>
                    <SelectItem value="USD">$ USD</SelectItem>
                    <SelectItem value="EUR">€ EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {currency !== "UAH" ? (
                <p className="text-[11px] text-muted-foreground">
                  {currentRate
                    ? `≈ ${formatOrderMoney(uahValue ?? 0, "UAH")} за курсом ${currentRate.toFixed(2)}`
                    : "Курс ще не завантажився — гривневий еквівалент з'явиться пізніше."}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>Дата</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Стаття витрат</Label>
              <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Без статті" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без статті</SelectItem>
                  {categories.map((category) => {
                    const Icon = getExpenseCategoryIcon(category.name, category.kind);
                    return (
                      <SelectItem key={category.id} value={category.id}>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          {category.name} · {EXPENSE_CATEGORY_KIND_LABELS[category.kind]}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{expenseKind === "service" ? "Сервіс" : "Постачальник"}</Label>
              <Input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder={expenseKind === "service" ? "Dropbox або dropbox.com" : "Назва постачальника"}
                className="h-9"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Каса / рахунок</Label>
              <Select value={accountId || "none"} onValueChange={(v) => setAccountId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Не вказано" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не вказано</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Юрособа</Label>
              <Select value={legalEntityId || "none"} onValueChange={(v) => setLegalEntityId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Не вказано" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не вказано</SelectItem>
                  {entities.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {formatLegalEntityLabel(entity)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isRecurring ? (
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Періодичність</Label>
                  <Select value={billingPeriod} onValueChange={(v) => setBillingPeriod(v as BillingPeriod)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{BILLING_PERIOD_LABELS.monthly}</SelectItem>
                      <SelectItem value="quarterly">{BILLING_PERIOD_LABELS.quarterly}</SelectItem>
                      <SelectItem value="yearly">{BILLING_PERIOD_LABELS.yearly}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Наступне списання</Label>
                  <Input
                    type="date"
                    value={nextChargeDate}
                    onChange={(e) => setNextChargeDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              {expenseKind === "service" ? (
                <div className="grid gap-2">
                  <Label>Сервіс зі списку (підтягне лого й валюту)</Label>
                  <Select value={vendorKey || "none"} onValueChange={(v) => applyBrand(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Не вказано" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Не вказано</SelectItem>
                      {SUBSCRIPTION_BRANDS.map((brand) => (
                        <SelectItem key={brand.key} value={brand.key}>
                          {brand.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Якщо сервісу нема в списку — впишіть його домен у «Сервіс» (напр. `vercel.com`), лого
                    підтягнеться саме.
                  </p>
                </div>
              ) : null}
              <div className="rounded-lg bg-background px-3 py-2 text-xs">
                {monthlyUah === null ? (
                  <span className="text-muted-foreground">Курс ще не завантажився.</span>
                ) : (
                  <>
                    <span className="text-muted-foreground">У витратах кожного місяця: </span>
                    <span className="font-semibold text-foreground">{formatOrderMoney(monthlyUah, "UAH")}</span>
                    {billingPeriod !== "monthly" ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({nativeAmountLabel({ amount: amountNum, currency })} ÷{" "}
                        {BILLING_PERIOD_MONTHS[billingPeriod]} міс)
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Розподіл на замовлення
              </Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={addAllocation}>
                <Plus className="h-3.5 w-3.5" /> Замовлення
              </Button>
            </div>
            {allocations.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Не обов'язково. Додайте, якщо ця витрата стосується конкретних замовлень (для маржі).
              </p>
            ) : (
              <div className="space-y-2">
                {allocations.map((row, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <OrderPickerInline
                        orders={orders}
                        loading={ordersLoading}
                        value={row.quoteId}
                        onChange={(quoteId) => updateAllocation(index, { quoteId })}
                        excludeQuoteIds={usedQuoteIds}
                        placeholder="Замовлення"
                      />
                    </div>
                    <Input
                      value={row.amount}
                      onChange={(e) => updateAllocation(index, { amount: e.target.value })}
                      inputMode="decimal"
                      placeholder="сума"
                      className="h-9 w-28"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      onClick={() => removeAllocation(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div
                  className={cn(
                    "flex items-center justify-between rounded-lg px-2 py-1 text-xs",
                    remaining < -0.005 ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  <span>Розподілено: {nativeAmountLabel({ amount: allocatedNum, currency })}</span>
                  <span>Залишок (загальні): {nativeAmountLabel({ amount: remaining, currency })}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Коментар</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[50px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Скасувати
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

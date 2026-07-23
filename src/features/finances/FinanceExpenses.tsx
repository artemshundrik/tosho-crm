import * as React from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Cloud,
  Loader2,
  Pencil,
  PiggyBank,
  Pin,
  Plus,
  Receipt,
  RefreshCw,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { EditIconButton, DeleteIconButton } from "./financeRowActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { BENTO_COLORS, FinanceBentoSummary } from "./FinanceBentoSummary";
import { FinanceMonthBar } from "./FinanceMonthBar";
import { OrderPickerInline } from "./OrderPickerInline";
import {
  createExpense,
  createExpenseCategory,
  createExpenseEntry,
  deleteExpense,
  deleteExpenseEntry,
  listAccounts,
  listExpenseCategories,
  listExpenseEntries,
  listExpenses,
  listLegalEntities,
  listOrdersForFinance,
  updateExpense,
  updateExpenseEntry,
  type ExpenseAllocationInput,
  type ExpenseInput,
} from "./api";
import {
  BILLING_PERIOD_LABELS,
  BILLING_PERIOD_MONTHS,
  BILLING_PERIOD_ORDER,
  billingPeriodOf,
  EXPENSE_CATEGORY_KIND_LABELS,
  expenseMonthlyUah,
  expenseUahAmount,
  formatLegalEntityLabel,
  type BillingPeriod,
  type ExpenseEntry,
  type FinanceAccount,
  type FinanceExpense,
  type FinanceExpenseCategory,
  type FinanceLegalEntity,
  type FinanceOrderRef,
} from "./types";
import { getExpenseCategoryIcon } from "./expenseCategoryIcons";
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

// Короткий підпис одиниці періоду для рядка списку («$200 / рік»).
const PERIOD_UNIT_SHORT: Record<BillingPeriod, string> = {
  monthly: "міс",
  quarterly: "квартал",
  semiannual: "півроку",
  yearly: "рік",
};

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

const MONTHS_GENITIVE = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];

// «до червня» (рік дописуємо лише коли він інший, ніж у порівнюваному місяці).
const monthGenitive = (key: string, vsKey: string) => {
  const [year, month] = key.split("-").map(Number);
  const [vsYear] = vsKey.split("-").map(Number);
  const name = MONTHS_GENITIVE[(month || 1) - 1];
  return year === vsYear ? name : `${name} ${year}`;
};

// Секція реєстру витрат — вона ж кошик bento-смуги (спільний ключ, порядок і колір).
type MonthSection = {
  key: string;
  label: string;
  /** Коротка назва для легенди смуги (напр. «Змінні» замість повної). */
  legend: string;
  items: FinanceExpense[];
  total: number;
  /** true — сума «/ міс» (регулярні); false — сума за вибраний місяць (змінні). */
  perMonth: boolean;
};

// Shift a «YYYY-MM» key by a number of months.
const shiftMonthKey = (key: string, delta: number) => {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, (month || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Парсинг суми з «людського» вводу: апостроф/пробіл (і nbsp) — роздільник тисяч,
// останній «,» або «.» — десятковий. «6'238,20» → 6238.2; «12 500» → 12500.
// Повертає null, якщо це не додатне число (для валідації + тосту).
const parseAmountInput = (raw: string): number | null => {
  const s = raw.trim().replace(/[\s'’`]/g, "");
  if (!s) return null;
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  let normalized = s;
  if (lastSep !== -1) {
    const intPart = s.slice(0, lastSep).replace(/[.,]/g, "");
    const frac = s.slice(lastSep + 1).replace(/[.,]/g, "");
    normalized = frac ? `${intPart}.${frac}` : intPart;
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Сума як число для розрахунків (невалідне/порожнє → 0).
const amountNumber = (raw: string): number => parseAmountInput(raw) ?? 0;

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

const CURRENCY_SYMBOL: Record<FxCurrency, string> = { UAH: "₴", USD: "$", EUR: "€" };

// «запис / записи / записів» за українським правилом множини.
const pluralEntries = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "запис";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "записи";
  return "записів";
};

// «05.07» — короткий день+місяць запису (рік зрозумілий із заголовка місяця).
const formatDayShort = (entryDate: string) => {
  const [, m, d] = entryDate.split("-");
  return d && m ? `${d}.${m}` : entryDate;
};

// Дата за замовчуванням для нового запису: сьогодні, якщо додаємо в поточний місяць,
// інакше — перше число вибраного місяця (коли «доганяєш» минулий).
const defaultEntryDate = (monthKey: string, currentKey: string) =>
  monthKey === currentKey ? todayISO() : `${monthKey}-01`;

// Сума запису в рідній валюті + гривневий орієнтир (для не-гривні).
const entryAmountLabel = (amount: number, currency: FxCurrency) =>
  currency === "UAH" ? formatOrderMoney(amount, "UAH") : formatCurrencyAmount(amount, currency);

// Спільний inline-редактор запису журналу: дата + сума + коментар.
// Використовується і для додавання, і для редагування наявного запису.
function EntryEditor({
  currency,
  initialDate,
  initialAmount,
  initialNote,
  submitLabel,
  saving,
  autoFocusAmount,
  onSubmit,
  onCancel,
}: {
  currency: FxCurrency;
  initialDate: string;
  initialAmount: string;
  initialNote: string;
  submitLabel: string;
  saving: boolean;
  autoFocusAmount?: boolean;
  onSubmit: (values: { entryDate: string; amount: number; note: string }) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = React.useState(initialDate);
  const [amount, setAmount] = React.useState(initialAmount);
  const [note, setNote] = React.useState(initialNote);

  const trySubmit = () => {
    if (!date) {
      toast.error("Вкажіть дату запису");
      return;
    }
    const parsed = parseAmountInput(amount);
    if (parsed === null || parsed <= 0) {
      toast.error("Перевірте суму", {
        description: `«${amount.trim() || "порожньо"}» — не схоже на число. Приклад: 6238,20`,
      });
      return;
    }
    onSubmit({ entryDate: date, amount: parsed, note: note.trim() });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      trySubmit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background p-2">
      <Input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Дата запису"
        className="h-8 w-[150px]"
      />
      <div className="flex items-center gap-1">
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={onKeyDown}
          inputMode="decimal"
          placeholder="0.00"
          autoFocus={autoFocusAmount}
          aria-label="Сума"
          className="h-8 w-24 text-right text-sm tabular-nums"
        />
        <span className="w-3 text-xs text-muted-foreground">{CURRENCY_SYMBOL[currency]}</span>
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="коментар (напр. кухня+санвузли)"
        aria-label="Коментар"
        className="h-8 min-w-[140px] flex-1"
      />
      <div className="flex items-center gap-1">
        <Button size="sm" className="h-8 gap-1" onClick={trySubmit} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {submitLabel}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCancel} aria-label="Скасувати">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// Один рядок журналу: показ (дата · сума · коментар) із перемиканням у режим редагування.
function JournalEntryRow({
  entry,
  currency,
  rates,
  busy,
  onUpdate,
  onDelete,
}: {
  entry: ExpenseEntry;
  currency: FxCurrency;
  rates: FxRates;
  busy: boolean;
  onUpdate: (values: { entryDate: string; amount: number; note: string }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const uah = currency === "UAH" ? null : convertToUah(entry.amount, currency, rates, null);

  if (editing) {
    return (
      <EntryEditor
        currency={currency}
        initialDate={entry.entryDate}
        initialAmount={String(entry.amount)}
        initialNote={entry.note ?? ""}
        submitLabel="Зберегти"
        saving={busy}
        onSubmit={(values) => {
          onUpdate(values);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40">
      <span className="w-12 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
        {formatDayShort(entry.entryDate)}
      </span>
      <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
        {entryAmountLabel(entry.amount, currency)}
      </span>
      {uah !== null ? (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">≈ {formatOrderMoney(uah, "UAH")}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{entry.note || "—"}</span>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={() => setEditing(true)}
          aria-label="Редагувати запис"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={busy}
          aria-label="Видалити запис"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// Розгортна панель журналу під рядком змінної витрати: записи вибраного місяця + додавання.
function ExpenseJournalPanel({
  monthKey,
  monthText,
  currentKey,
  currency,
  rates,
  entries,
  busy,
  onAdd,
  onUpdate,
  onDelete,
}: {
  monthKey: string;
  monthText: string;
  currentKey: string;
  currency: FxCurrency;
  rates: FxRates;
  entries: ExpenseEntry[]; // лише за цей місяць
  busy: boolean;
  onAdd: (values: { entryDate: string; amount: number; note: string }) => void;
  onUpdate: (entryId: string, values: { entryDate: string; amount: number; note: string }) => void;
  onDelete: (entryId: string) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  // Після кожного додавання ремаунтимо форму (зміною key), щоб очистити суму/коментар
  // для наступного запису. Дату памʼятаємо (lastDate) — зазвичай додають поспіль близькі дати.
  const [addSeq, setAddSeq] = React.useState(0);
  const [lastDate, setLastDate] = React.useState(() => defaultEntryDate(monthKey, currentKey));
  React.useEffect(() => {
    setLastDate(defaultEntryDate(monthKey, currentKey));
  }, [monthKey, currentKey]);

  // Хронологічно (1-ше → останнє) — читається як журнал подій.
  const ordered = React.useMemo(
    () => entries.slice().sort((a, b) => a.entryDate.localeCompare(b.entryDate)),
    [entries]
  );

  return (
    <div className="border-t border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Журнал · {monthText}
        </span>
        {ordered.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {ordered.length} {pluralEntries(ordered.length)}
          </span>
        ) : null}
      </div>

      {ordered.length > 0 ? (
        <div className="space-y-0.5">
          {ordered.map((entry) => (
            <JournalEntryRow
              key={entry.id}
              entry={entry}
              currency={currency}
              rates={rates}
              busy={busy}
              onUpdate={(values) => onUpdate(entry.id, values)}
              onDelete={() => onDelete(entry.id)}
            />
          ))}
        </div>
      ) : (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          Ще немає записів за цей місяць. Додай перше прибирання нижче.
        </p>
      )}

      <div className="mt-2">
        {adding ? (
          <EntryEditor
            key={addSeq}
            currency={currency}
            initialDate={lastDate}
            initialAmount=""
            initialNote=""
            submitLabel="Додати"
            saving={busy}
            autoFocusAmount
            onSubmit={(values) => {
              onAdd(values);
              // Форма лишається відкритою (нове key) для швидкого вводу кількох прибирань поспіль.
              setLastDate(values.entryDate);
              setAddSeq((n) => n + 1);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            Додати запис
          </Button>
        )}
      </div>
    </div>
  );
}

export function FinanceExpenses({ teamId, userId, canSeeSensitive }: FinanceExpensesProps) {
  const [expenses, setExpenses] = React.useState<FinanceExpense[]>([]);
  const [categories, setCategories] = React.useState<FinanceExpenseCategory[]>([]);
  const [accounts, setAccounts] = React.useState<FinanceAccount[]>([]);
  const [entities, setEntities] = React.useState<FinanceLegalEntity[]>([]);
  const [orders, setOrders] = React.useState<FinanceOrderRef[]>([]);
  // expenseId → журнал датованих записів (для регулярних платежів зі змінною сумою).
  const [entriesByExpense, setEntriesByExpense] = React.useState<Map<string, ExpenseEntry[]>>(() => new Map());
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
      const [nextCategories, nextAccounts, nextEntities, nextEntries] = await Promise.all([
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
        listExpenseEntries(teamId).catch((e) => {
          console.error("[finance] listExpenseEntries failed", e);
          return new Map<string, ExpenseEntry[]>();
        }),
      ]);
      setCategories(nextCategories);
      setAccounts(nextAccounts);
      setEntities(nextEntities);
      setEntriesByExpense(nextEntries);
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

  // Наявні обʼєкти (адреси) — для підказок у полі «Обʼєкт».
  const objectSuggestions = React.useMemo(() => {
    const set = new Set<string>();
    for (const e of expenses) {
      const label = e.objectGroup?.trim();
      if (label) set.add(label);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "uk"));
  }, [expenses]);

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

  // Місяць-у-фокусі — оголошуємо раніше за базлайни, бо змінні платежі рахуються
  // саме за цей місяць (комуналка різна щомісяця).
  const currentKey = React.useMemo(() => todayISO().slice(0, 7), []);
  const [selectedMonth, setSelectedMonth] = React.useState(currentKey);

  // Записи журналу конкретної витрати за конкретний місяць.
  const entriesForMonth = React.useCallback(
    (expenseId: string, monthKey: string): ExpenseEntry[] =>
      (entriesByExpense.get(expenseId) ?? []).filter((en) => en.entryDate.slice(0, 7) === monthKey),
    [entriesByExpense]
  );

  // Місячна гривнева вартість регулярного платежу ДЛЯ конкретного місяця:
  // стала — та сама щомісяця; змінна — сума записів журналу за місяць
  // (або стартовий орієнтир, якщо записів ще немає).
  const monthlyFor = React.useCallback(
    (e: FinanceExpense, monthKey: string): number | null => {
      if (!e.amountVaries) return expenseMonthlyUah(e, rates);
      const monthEntries = entriesForMonth(e.id, monthKey);
      const amt = monthEntries.length > 0 ? monthEntries.reduce((s, en) => s + en.amount, 0) : e.amount;
      return convertToUah(amt, e.currency, rates, e.fxRate);
    },
    [rates, entriesForMonth]
  );
  const monthlyForSelected = React.useCallback(
    (e: FinanceExpense): number | null => monthlyFor(e, selectedMonth),
    [monthlyFor, selectedMonth]
  );

  const { fixed, variable } = React.useMemo(() => {
    const fixedList: FinanceExpense[] = [];
    const variableList: FinanceExpense[] = [];
    for (const expense of visibleExpenses) {
      if (expense.isRecurring) fixedList.push(expense);
      else variableList.push(expense);
    }
    // Найдорожче на місяць — зверху, щоб одразу було видно, що з'їдає бюджет.
    fixedList.sort((a, b) => (monthlyForSelected(b) ?? 0) - (monthlyForSelected(a) ?? 0));
    return { fixed: fixedList, variable: variableList };
  }, [visibleExpenses, monthlyForSelected]);

  // Регулярна місячна база за вибраний місяць (змінні платежі — фактом того місяця).
  const fixedBaseline = React.useMemo(
    () => fixed.reduce((sum, e) => sum + (monthlyForSelected(e) ?? 0), 0),
    [fixed, monthlyForSelected]
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
    (list: FinanceExpense[]) => list.reduce((sum, e) => sum + (monthlyForSelected(e) ?? 0), 0),
    [monthlyForSelected]
  );
  const servicesBaseline = React.useMemo(() => sumMonthly(services), [services, sumMonthly]);

  // «Інші регулярні» під-групуємо за обʼєктом/адресою: оренда+комуналка+інтернет
  // одного офісу разом, з підсумком. Без обʼєкта — окремим блоком у кінці.
  const otherByObject = React.useMemo(() => {
    const byLabel = new Map<string, FinanceExpense[]>();
    const untagged: FinanceExpense[] = [];
    for (const e of recurringOther) {
      const label = e.objectGroup?.trim();
      if (label) {
        const list = byLabel.get(label);
        if (list) list.push(e);
        else byLabel.set(label, [e]);
      } else {
        untagged.push(e);
      }
    }
    const named = Array.from(byLabel.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "uk"))
      .map(([label, items]) => ({ label, items, total: sumMonthly(items) }));
    return untagged.length > 0
      ? [...named, { label: null, items: untagged, total: sumMonthly(untagged) }]
      : named;
  }, [recurringOther, sumMonthly]);

  // Скільки з місячної бази — це не-щомісячні підписки (квартальні/піврічні/річні).
  const spreadBaseline = React.useMemo(
    () => sumMonthly(fixed.filter((e) => billingPeriodOf(e) !== "monthly")),
    [fixed, sumMonthly]
  );

  const missingRateCount = React.useMemo(
    () => fixed.filter((e) => monthlyForSelected(e) === null).length,
    [fixed, monthlyForSelected]
  );

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

  // --- Bento-підсумок місяця: разом + дельта до попереднього + розподіл --------
  const monthTotal = fixedBaseline + selectedVariableSum;
  const prevMonthKey = shiftMonthKey(selectedMonth, -1);

  // Той самий підрахунок, що й для вибраного місяця, тільки за попередній:
  // регулярні — місячною вартістю (змінні — фактом того місяця), плюс змінні витрати.
  const prevMonthTotal = React.useMemo(() => {
    const regular = fixed.reduce((sum, e) => sum + (monthlyFor(e, prevMonthKey) ?? 0), 0);
    const variablePrev = (variableByMonth.get(prevMonthKey) ?? []).reduce(
      (sum, e) => sum + (expenseUahAmount(e, rates) ?? 0),
      0
    );
    return regular + variablePrev;
  }, [fixed, monthlyFor, prevMonthKey, variableByMonth, rates]);

  // Δ% до попереднього місяця; null — якщо порівнювати нема з чим.
  const monthDeltaPct = prevMonthTotal > 0 ? ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100 : null;

  // Секції сторінки й кошики bento — ОДИН список: той самий порядок (сервіси →
  // обʼєкти → без обʼєкта → змінні) і ті самі кольори. Смуга зверху = мапа сторінки.
  const { monthSections, monthBuckets, sectionColor } = React.useMemo(() => {
    const sections: MonthSection[] = [];
    if (services.length > 0) {
      sections.push({
        key: "services",
        label: "Сервіси та підписки",
        legend: "Сервіси та підписки",
        items: services,
        total: servicesBaseline,
        perMonth: true,
      });
    }
    for (const group of otherByObject) {
      sections.push(
        group.label
          ? { key: `obj:${group.label}`, label: group.label, legend: group.label, items: group.items, total: group.total, perMonth: true }
          : { key: "untagged", label: "Без обʼєкта", legend: "Без обʼєкта", items: group.items, total: group.total, perMonth: true }
      );
    }
    // Змінні — завжди остання секція, навіть порожня (щоб місяць читався повністю).
    sections.push({
      key: "variable",
      label: "Змінні витрати",
      legend: "Змінні",
      items: selectedItems,
      total: selectedVariableSum,
      perMonth: false,
    });
    // Кольори роздаємо лише непорожнім (вони ж — сегменти смуги); решті — сірий у секції.
    const buckets: { key: string; label: string; amount: number; color: string }[] = [];
    const colors = new Map<string, string>();
    for (const s of sections) {
      if (s.total > 0) {
        const color = BENTO_COLORS[buckets.length % BENTO_COLORS.length];
        colors.set(s.key, color);
        buckets.push({ key: s.key, label: s.legend, amount: s.total, color });
      }
    }
    return { monthSections: sections, monthBuckets: buckets, sectionColor: colors };
  }, [services, servicesBaseline, otherByObject, selectedItems, selectedVariableSum]);

  // Розгорнутість секцій: за замовчуванням відкриті, вибір живе в localStorage
  // (ключі динамічні — обʼєкти зʼявляються з даних, тому оверрайди поверх бази).
  const [sectionOpenOverrides, setSectionOpenOverrides] = React.useState<Record<string, boolean>>({});
  const isSectionOpen = React.useCallback(
    (key: string) => sectionOpenOverrides[key] ?? readGroupOpen(key),
    [sectionOpenOverrides]
  );
  const setSectionOpen = React.useCallback((key: string, next: boolean) => {
    setSectionOpenOverrides((prev) => ({ ...prev, [key]: next }));
    try {
      window.localStorage.setItem(`${GROUP_OPEN_STORAGE_PREFIX}${key}`, next ? "1" : "0");
    } catch {
      // приватний режим — не критично
    }
  }, []);
  const toggleSection = React.useCallback(
    (key: string) => setSectionOpen(key, !isSectionOpen(key)),
    [setSectionOpen, isSectionOpen]
  );

  // Клік по легенді bento: розгорнути секцію і мʼяко проскролити до неї (під липкий бар).
  const sectionElsRef = React.useRef(new Map<string, HTMLElement | null>());
  const registerSectionEl = React.useCallback((key: string, el: HTMLElement | null) => {
    sectionElsRef.current.set(key, el);
  }, []);
  const scrollToSection = React.useCallback(
    (key: string) => {
      setSectionOpen(key, true);
      requestAnimationFrame(() => {
        sectionElsRef.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [setSectionOpen]
  );

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FinanceExpense | null>(null);

  const openCreate = React.useCallback(() => {
    setEditing(null);
    setDialogOpen(true);
  }, []);

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

  // Які журнали розгорнуті (за expenseId).
  const [openJournals, setOpenJournals] = React.useState<Set<string>>(() => new Set());
  const toggleJournal = React.useCallback((expenseId: string) => {
    setOpenJournals((prev) => {
      const next = new Set(prev);
      if (next.has(expenseId)) next.delete(expenseId);
      else next.add(expenseId);
      return next;
    });
  }, []);

  // Для яких витрат зараз триває запис у журнал (блокує кнопки, щоб не дублювати).
  const [busyExpenses, setBusyExpenses] = React.useState<Set<string>>(() => new Set());
  const setExpenseBusy = React.useCallback((expenseId: string, on: boolean) => {
    setBusyExpenses((prev) => {
      const next = new Set(prev);
      if (on) next.add(expenseId);
      else next.delete(expenseId);
      return next;
    });
  }, []);

  // Додати запис журналу. Реальний рядок (з id) приходить із сервера й лягає в стан.
  const addEntry = React.useCallback(
    async (expenseId: string, values: { entryDate: string; amount: number; note: string }) => {
      if (!teamId) return;
      setExpenseBusy(expenseId, true);
      try {
        const created = await createExpenseEntry(teamId, {
          expenseId,
          entryDate: values.entryDate,
          amount: values.amount,
          note: values.note || null,
          enteredBy: userId,
        });
        setEntriesByExpense((prev) => {
          const next = new Map(prev);
          next.set(expenseId, [created, ...(next.get(expenseId) ?? [])]);
          return next;
        });
        toast.success(`Додано за ${formatDate(values.entryDate)}`);
      } catch (error) {
        toast.error("Не вдалося додати запис", { description: getErrorMessage(error, "Спробуйте ще раз.") });
      } finally {
        setExpenseBusy(expenseId, false);
      }
    },
    [teamId, userId, setExpenseBusy]
  );

  // Оновити запис (оптимістично; на помилці відкочуємо до попереднього списку).
  const updateEntry = React.useCallback(
    async (expenseId: string, entryId: string, values: { entryDate: string; amount: number; note: string }) => {
      if (!teamId) return;
      const prevList = entriesByExpense.get(expenseId) ?? [];
      setEntriesByExpense((prev) => {
        const next = new Map(prev);
        next.set(
          expenseId,
          (next.get(expenseId) ?? []).map((en) =>
            en.id === entryId
              ? { ...en, entryDate: values.entryDate, amount: values.amount, note: values.note || null }
              : en
          )
        );
        return next;
      });
      setExpenseBusy(expenseId, true);
      try {
        await updateExpenseEntry(teamId, entryId, {
          entryDate: values.entryDate,
          amount: values.amount,
          note: values.note || null,
        });
        toast.success("Запис оновлено");
      } catch (error) {
        toast.error("Не вдалося оновити запис", { description: getErrorMessage(error, "Спробуйте ще раз.") });
        setEntriesByExpense((prev) => {
          const next = new Map(prev);
          next.set(expenseId, prevList);
          return next;
        });
      } finally {
        setExpenseBusy(expenseId, false);
      }
    },
    [teamId, entriesByExpense, setExpenseBusy]
  );

  // Видалити запис (оптимістично; на помилці відкочуємо).
  const deleteEntry = React.useCallback(
    async (expenseId: string, entryId: string) => {
      if (!teamId) return;
      const prevList = entriesByExpense.get(expenseId) ?? [];
      setEntriesByExpense((prev) => {
        const next = new Map(prev);
        next.set(
          expenseId,
          (next.get(expenseId) ?? []).filter((en) => en.id !== entryId)
        );
        return next;
      });
      setExpenseBusy(expenseId, true);
      try {
        await deleteExpenseEntry(teamId, entryId);
        toast.success("Запис видалено");
      } catch (error) {
        toast.error("Не вдалося видалити запис", { description: getErrorMessage(error, "Спробуйте ще раз.") });
        setEntriesByExpense((prev) => {
          const next = new Map(prev);
          next.set(expenseId, prevList);
          return next;
        });
      } finally {
        setExpenseBusy(expenseId, false);
      }
    },
    [teamId, entriesByExpense, setExpenseBusy]
  );

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
    const monthly = monthlyForSelected(expense);
    const overdue = expense.nextChargeDate ? daysUntil(expense.nextChargeDate) < 0 : false;
    const monthEntries = expense.amountVaries ? entriesForMonth(expense.id, selectedMonth) : [];
    const hasEntries = monthEntries.length > 0;
    const journalOpen = openJournals.has(expense.id);

    return (
      <div key={expense.id} className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
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
                {expense.amountVaries ? (
                  <Badge tone="info" size="sm" className="gap-1 text-[10px]">
                    журнал по датах
                  </Badge>
                ) : null}
                {category ? (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {category.name}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {expense.amountVaries ? (
                  <span className="font-medium text-foreground/80">по факту — записуй кожну дату</span>
                ) : (
                  <span className="font-medium text-foreground/80">
                    {nativeAmountLabel(expense)} / {PERIOD_UNIT_SHORT[period]}
                  </span>
                )}
                {!expense.amountVaries && expense.nextChargeDate ? (
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
            {expense.amountVaries ? (
              <button
                type="button"
                onClick={() => toggleJournal(expense.id)}
                aria-expanded={journalOpen}
                className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/50"
              >
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums text-foreground">
                    {monthly === null ? "—" : formatOrderMoney(monthly, "UAH")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {hasEntries ? `${monthEntries.length} ${pluralEntries(monthEntries.length)} · факт` : "орієнтир — додай"}
                  </div>
                </div>
                <ChevronDown
                  className={cn("h-4 w-4 text-muted-foreground transition-transform", journalOpen && "rotate-180")}
                />
              </button>
            ) : (
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums text-foreground">
                  {monthly === null ? "—" : formatOrderMoney(monthly, "UAH")}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {monthly === null ? "курс невідомий" : "на місяць"}
                </div>
              </div>
            )}
            {rowActions(expense)}
          </div>
        </div>
        {expense.amountVaries && journalOpen ? (
          <ExpenseJournalPanel
            monthKey={selectedMonth}
            monthText={monthLabel(selectedMonth)}
            currentKey={currentKey}
            currency={expense.currency}
            rates={rates}
            entries={monthEntries}
            busy={busyExpenses.has(expense.id)}
            onAdd={(values) => void addEntry(expense.id, values)}
            onUpdate={(entryId, values) => void updateEntry(expense.id, entryId, values)}
            onDelete={(entryId) => void deleteEntry(expense.id, entryId)}
          />
        ) : null}
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
          {/* Липкий бар місяця (спільний для розділів Фінансів): місяць і головна дія
              лишаються на екрані під час скролу. */}
          <FinanceMonthBar
            label={monthLabel(selectedMonth)}
            onPrev={() => setSelectedMonth((k) => shiftMonthKey(k, -1))}
            onNext={() => setSelectedMonth((k) => shiftMonthKey(k, 1))}
            onReset={() => setSelectedMonth(currentKey)}
            showReset={selectedMonth !== currentKey}
          >
            <Button type="button" size="sm" className="h-8 gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Додати витрату
            </Button>
          </FinanceMonthBar>

          {/* Bento-підсумок вибраного місяця — спільний компонент розділів Фінансів.
              Легенда клікабельна: розгортає відповідну секцію нижче і скролить до неї. */}
          <FinanceBentoSummary
            title={`Разом за ${monthLabel(selectedMonth)}`}
            totalText={formatOrderMoney(monthTotal, "UAH")}
            deltaPct={monthDeltaPct}
            deltaVs={monthGenitive(prevMonthKey, selectedMonth)}
            buckets={monthTotal > 0 ? monthBuckets : []}
            onBucketClick={scrollToSection}
            footnote={
              fixed.length > 0 ? (
                <>
                  <span>
                    Регулярна база:{" "}
                    <span className="font-medium tabular-nums text-foreground/80">
                      {formatOrderMoney(fixedBaseline, "UAH")} / міс
                    </span>
                  </span>
                  {spreadBaseline > 0 ? (
                    <span>з них {formatOrderMoney(spreadBaseline, "UAH")} — неодномісячні, розбиті на місяці</span>
                  ) : null}
                  {missingRateCount > 0 ? (
                    <span className="text-destructive">{missingRateCount} у валюті без курсу</span>
                  ) : null}
                </>
              ) : undefined
            }
          />

          {/* Секції = кошики bento: той самий порядок і колір, без зайвих обгорток.
              Кожна згортається стрілочкою, вибір памʼятається між сесіями. */}
          <div className="space-y-1.5">
            {monthSections.map((s) => (
              <ExpenseSection
                key={s.key}
                sectionKey={s.key}
                colorClass={sectionColor.get(s.key) ?? "bg-muted-foreground/25"}
                label={s.key === "variable" ? `${s.label} · ${monthLabel(selectedMonth)}` : s.label}
                count={s.items.length}
                totalText={`${formatOrderMoney(s.total, "UAH")}${s.perMonth ? " / міс" : ""}`}
                open={isSectionOpen(s.key)}
                onToggle={() => toggleSection(s.key)}
                registerEl={registerSectionEl}
              >
                {s.key === "variable" ? (
                  s.items.length > 0 ? (
                    <div className="grid gap-2">{s.items.map(renderRow)}</div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
                      Немає змінних витрат за {monthLabel(selectedMonth)}.
                    </div>
                  )
                ) : (
                  <div className="grid gap-2">{s.items.map(renderSubscriptionRow)}</div>
                )}
              </ExpenseSection>
            ))}
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
          // key прив'язує інстанс до конкретної витрати: кожне відкриття (нова / інша
          // витрата) дає свіжий стан замість залишків попереднього редагування.
          key={editing ? editing.id : "new"}
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
          objectSuggestions={objectSuggestions}
          onSaved={reload}
        />
      ) : null}
    </div>
  );
}

// Секція реєстру витрат: кольорова крапка (та сама, що в bento-смузі), назва,
// кількість і сума справа. Згортається стрілочкою — щоб довгі списки (11 сервісів)
// не розповзались; вибір запам'ятовується між сесіями. scroll-mt = висота липкого бару.
function ExpenseSection({
  sectionKey,
  colorClass,
  label,
  count,
  totalText,
  open,
  onToggle,
  registerEl,
  children,
}: {
  sectionKey: string;
  colorClass: string;
  label: string;
  count: number;
  totalText: string;
  open: boolean;
  onToggle: () => void;
  registerEl: (key: string, el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      ref={(el) => {
        registerEl(sectionKey, el);
      }}
      className="scroll-mt-14"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", colorClass)} />
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground/80">· {count}</span>
        <span className="ml-auto text-xs font-semibold tabular-nums text-muted-foreground">{totalText}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
      </button>
      {open ? <div className="pb-2 pt-0.5">{children}</div> : null}
    </section>
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

const EXPENSE_KIND_OPTIONS: {
  value: ExpenseFormKind;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  { value: "one_off", label: "Разова", hint: "Купівля, матеріали, під замовлення", icon: Receipt },
  { value: "service", label: "Сервіс", hint: "Dropbox, Adobe, Supabase…", icon: Cloud },
  { value: "recurring", label: "Регулярний платіж", hint: "Оренда, комуналка, прибирання", icon: RefreshCw },
];

// Один рядок батч-вводу регулярних платежів.
type RecurRow = {
  id: string;
  categoryId: string; // існуюча стаття, або "" якщо нова
  categoryName: string; // підпис існуючої / назва нової (створимо при збереженні)
  name: string;
  amount: string;
  currency: FxCurrency;
  period: BillingPeriod;
  amountVaries: boolean; // сума змінна (комуналка) — факт вводиться по місяцях
};

// Вибір «виду» (статті) з можливістю вписати нову — combobox поверх Command.
function CategoryPicker({
  categories,
  categoryId,
  categoryName,
  onChange,
}: {
  categories: FinanceExpenseCategory[];
  categoryId: string;
  categoryName: string;
  onChange: (next: { categoryId: string; categoryName: string }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const q = query.trim();
  const filtered = React.useMemo(
    () => (q ? categories.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : categories),
    [categories, q]
  );
  const exactExists = categories.some((c) => c.name.trim().toLowerCase() === q.toLowerCase());

  // Іконка обраного виду: за наявною статтею, інакше — здогадка за введеною назвою.
  const selected = categories.find((c) => c.id === categoryId) ?? null;
  const TriggerIcon = categoryName
    ? getExpenseCategoryIcon(selected?.name ?? categoryName, selected?.kind ?? "fixed")
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-10 w-full justify-between px-3 font-normal", !categoryName && "text-muted-foreground")}
        >
          <span className="flex min-w-0 items-center gap-2">
            {TriggerIcon
              ? React.createElement(TriggerIcon, { className: "h-4 w-4 shrink-0 text-muted-foreground" })
              : null}
            <span className="truncate">{categoryName || "Вид витрати"}</span>
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] min-w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Пошук або нова стаття…" value={query} onValueChange={setQuery} />
          <CommandList>
            {filtered.length === 0 && !q ? <CommandEmpty>Немає статей</CommandEmpty> : null}
            <CommandGroup>
              {filtered.map((c) => {
                const Icon = getExpenseCategoryIcon(c.name, c.kind);
                return (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    onSelect={() => {
                      onChange({ categoryId: c.id, categoryName: c.name });
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{c.name}</span>
                    <Check
                      className={cn("ml-auto h-4 w-4 shrink-0", categoryId === c.id ? "opacity-100" : "opacity-0")}
                    />
                  </CommandItem>
                );
              })}
              {q && !exactExists ? (
                <CommandItem
                  value={`__create_${q}`}
                  onSelect={() => {
                    onChange({ categoryId: "", categoryName: q });
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Створити «{q}»
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
  objectSuggestions,
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
  objectSuggestions: string[];
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
  const [amountVaries, setAmountVaries] = React.useState(editing?.amountVaries ?? false);
  const [objectGroup, setObjectGroup] = React.useState(editing?.objectGroup ?? "");
  const [nextChargeDate, setNextChargeDate] = React.useState(editing?.nextChargeDate ?? "");
  const [notes, setNotes] = React.useState(editing?.notes ?? "");
  const [allocations, setAllocations] = React.useState<AllocRow[]>(
    editing?.allocations.map((a) => ({ quoteId: a.quoteId, amount: String(a.amount) })) ?? []
  );
  const [saving, setSaving] = React.useState(false);

  // Батч-режим — лише при СТВОРЕННІ регулярних платежів. Редагування завжди одиночне.
  const batchMode = !editing && expenseKind === "recurring";
  const rowIdRef = React.useRef(0);
  const makeRow = React.useCallback(
    (): RecurRow => ({
      id: String(++rowIdRef.current),
      categoryId: "",
      categoryName: "",
      name: "",
      amount: "",
      currency: "UAH",
      period: "monthly",
      amountVaries: false,
    }),
    []
  );
  const [recurRows, setRecurRows] = React.useState<RecurRow[]>(() => [makeRow()]);
  const updateRow = (id: string, patch: Partial<RecurRow>) =>
    setRecurRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRecurRows((prev) => [...prev, makeRow()]);
  const removeRow = (id: string) =>
    setRecurRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));

  const rowMonthlyUah = (r: RecurRow) => {
    const uah = convertToUah(amountNumber(r.amount), r.currency, rates);
    return uah === null ? 0 : uah / BILLING_PERIOD_MONTHS[r.period];
  };
  const batchMonthlyTotal = recurRows.reduce((sum, r) => sum + rowMonthlyUah(r), 0);
  const batchValidCount = recurRows.filter((r) => amountNumber(r.amount) > 0).length;

  const amountNum = amountNumber(amount);
  const allocatedNum = allocations.reduce((sum, a) => sum + amountNumber(a.amount), 0);
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

  // Змінна сума (комуналка) при створенні — сума в формі необовʼязкова (орієнтир),
  // факт вводиться по місяцях у списку.
  const varyingRecurring = isRecurring && amountVaries;

  const submit = async () => {
    if (!teamId) return;
    // Введена, але «нечислова» сума (напр. зайвий символ у «6'238,20») — не мовчимо: явний тост.
    if (amount.trim() && parseAmountInput(amount) === null) {
      toast.error("Перевірте суму", {
        description: `«${amount.trim()}» — не схоже на число. Приклад: 6238,20`,
      });
      return;
    }
    if (!varyingRecurring && (!Number.isFinite(amountNum) || amountNum <= 0)) {
      toast.error("Вкажіть коректну суму витрати.");
      return;
    }
    // Розподіл на замовлення існує лише для разових. Гейтимо і валідацію, і payload
    // за типом — інакше приховані алокації (лишені після перемикання типу) поїхали б
    // у сервіс/підписку й тихо зіпсували маржу.
    const useAllocations = expenseKind === "one_off";
    if (useAllocations && allocatedNum - amountNum > 0.005) {
      toast.error("Розподілено більше, ніж сума витрати.");
      return;
    }
    const allocInput: ExpenseAllocationInput[] = useAllocations
      ? allocations
          .filter((a) => a.quoteId)
          .map((a) => ({ quoteId: a.quoteId, amount: amountNumber(a.amount) }))
          .filter((a) => a.amount > 0)
      : [];

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
      amountVaries: varyingRecurring,
      objectGroup: isRecurring ? objectGroup || null : null,
      nextChargeDate: isRecurring ? nextChargeDate || null : null,
      notes,
      enteredBy: userId,
      allocations: allocInput,
    };

    setSaving(true);
    try {
      if (editing) {
        await updateExpense(teamId, editing.id, input);
      } else {
        // Змінна сума: тут вписують лише ОРІЄНТИР (amount). Фактичні датовані записи
        // додаються потім у списку через журнал — тому нічого не сідаємо на старті.
        await createExpense(teamId, input);
      }
      onOpenChange(false);
      await onSaved();
      toast.success(editing ? "Витрату оновлено" : "Витрату додано");
    } catch (error) {
      toast.error("Не вдалося зберегти витрату", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    } finally {
      setSaving(false);
    }
  };

  // Батч-збереження регулярних платежів: нові статті створюємо один раз (дедуп за назвою).
  const submitBatch = async () => {
    if (!teamId) return;
    const hasAmount = (r: RecurRow) => amountNumber(r.amount) > 0;
    const isTouched = (r: RecurRow) =>
      Boolean(r.amount.trim() || r.name.trim() || r.categoryId || r.categoryName.trim());

    // Заповнений рядок без суми — найчастіша причина «зникнення» платежу: раніше він
    // тихо відсіювався. Тепер блокуємо збереження й прямо кажемо, який рядок доповнити.
    // Виняток — «сума змінна» (комуналка): для неї сума на старті необовʼязкова.
    const touched = recurRows.filter(isTouched);
    // Введена, але «нечислова» сума (зайвий символ) — окремий, зрозумілий тост,
    // щоб не плутати з «забули вписати суму».
    const badAmount = touched.find((r) => r.amount.trim() && parseAmountInput(r.amount) === null);
    if (badAmount) {
      toast.error("Перевірте суму", {
        description: `«${badAmount.amount.trim()}» — не схоже на число. Приклад: 6238,20`,
      });
      return;
    }
    const missingAmount = touched.filter((r) => !r.amountVaries && !hasAmount(r));
    if (missingAmount.length > 0) {
      toast.error("Вкажіть суму для кожного платежу", {
        description: "Рядок без суми не збережеться. Додайте суму або приберіть зайвий рядок.",
      });
      return;
    }
    const rows = touched; // усі заповнені мають суму
    if (rows.length === 0) {
      toast.error("Додайте хоча б один платіж із сумою.");
      return;
    }

    setSaving(true);
    // Вставляємо по одному (немає bulk-RPC), кожен у власному try — збій одного рядка
    // не «з'їдає» решту. Успішні знімаємо зі списку, щоб повтор не дублював.
    const savedIds: string[] = [];
    let firstError: unknown = null;
    try {
      const nameToId = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
      const resolveCategory = async (r: RecurRow): Promise<string | null> => {
        if (r.categoryId) return r.categoryId;
        const nm = r.categoryName.trim();
        if (!nm) return null;
        const existing = nameToId.get(nm.toLowerCase());
        if (existing) return existing;
        const created = await createExpenseCategory(teamId, { name: nm, kind: "fixed" });
        nameToId.set(nm.toLowerCase(), created.id);
        return created.id;
      };
      for (const r of rows) {
        try {
          const catId = await resolveCategory(r);
          const rowAmount = amountNumber(r.amount);
          await createExpense(teamId, {
            categoryId: catId,
            amount: rowAmount,
            currency: r.currency,
            fxRate: null,
            supplierName: r.name,
            vendorKey: null,
            logoUrl: null,
            expenseDate,
            accountId: accountId || null,
            legalEntityId: legalEntityId || null,
            isRecurring: true,
            recurrence: r.period,
            amountVaries: r.amountVaries,
            objectGroup: objectGroup || null,
            nextChargeDate: null,
            notes: null,
            enteredBy: userId,
            allocations: [],
          });
          // Змінна сума: rowAmount — лише орієнтир. Фактичні датовані записи
          // додаються згодом у списку (журнал), тож нічого не сідаємо тут.
          savedIds.push(r.id);
        } catch (rowError) {
          if (firstError === null) firstError = rowError;
        }
      }

      if (firstError === null) {
        onOpenChange(false);
        await onSaved();
        toast.success(`Додано платежів: ${rows.length}`);
      } else {
        // Частину збережено: приберемо успішні рядки, лишимо проблемні для повтору.
        if (savedIds.length > 0) setRecurRows((prev) => prev.filter((r) => !savedIds.includes(r.id)));
        await onSaved();
        toast.error(
          savedIds.length > 0
            ? `Збережено ${savedIds.length}, не вдалося ${rows.length - savedIds.length}`
            : "Не вдалося зберегти платежі",
          { description: getErrorMessage(firstError, "Спробуйте ще раз.") }
        );
      }
    } catch (error) {
      toast.error("Не вдалося зберегти платежі", { description: getErrorMessage(error, "Спробуйте ще раз.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Каркас фіксованої висоти (шапка / скрол-тіло / футер): висота стала для всіх
          типів — перемикання Разова/Сервіс/Регулярний не смикає вікно. Довший вміст
          (сервіс, багато платежів) скролить усередині тіла. */}
      <DialogContent className="h-[640px] max-h-[calc(100dvh-2rem)] gap-0 p-0 sm:max-w-[720px] sm:gap-0 sm:p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 pb-4 pt-5">
          <DialogTitle>{editing ? "Редагувати витрату" : "Нова витрата"}</DialogTitle>
          <DialogDescription className="min-h-[20px]">
            {batchMode
              ? "Кілька регулярних платежів одразу: оренда, комуналка, інтернет…"
              : expenseKind === "service"
                ? "Підписка на зовнішній сервіс. Річна оплата розіб'ється по місяцях."
                : expenseKind === "recurring"
                  ? "Регулярний платіж: оренда, комуналка, прибирання."
                  : "Разова витрата. Її можна розподілити між замовленнями для коректної маржі."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* Підказки наявних обʼєктів для полів «Обʼєкт / адреса». */}
          <datalist id="expense-object-options">
            {objectSuggestions.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          {/* Тип витрати задає і поля форми, і групу в списку — тому він перший і явний. */}
          <div role="radiogroup" aria-label="Тип витрати" className="grid gap-2 sm:grid-cols-3">
            {EXPENSE_KIND_OPTIONS.map((option) => {
              const active = expenseKind === option.value;
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setExpenseKind(option.value)}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
                    active
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/60 hover:border-border hover:bg-muted/40"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 bg-muted/30 text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className={cn("text-sm font-semibold", active ? "text-foreground" : "text-foreground/90")}>
                      {option.label}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{option.hint}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {batchMode ? (
            /* ── Батч регулярних платежів: список рядків + спільні поля ── */
            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Платежі
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {batchValidCount > 0 ? `${batchValidCount} із сумою` : "додайте суми"}
                  </span>
                </div>

                {/* Кожен платіж — простора картка 2×2: Вид | Назва (пів-картки) зверху,
                    Сума | Періодичність знизу. Колонки вирівняні, нічого не тісниться. */}
                <div className="space-y-2.5">
                  {recurRows.map((row) => (
                    <div key={row.id} className="space-y-2.5 rounded-xl border border-border/60 bg-muted/10 p-3">
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                          <Label className="text-[11px] font-normal uppercase tracking-wide text-muted-foreground">
                            Вид
                          </Label>
                          <CategoryPicker
                            categories={categories}
                            categoryId={row.categoryId}
                            categoryName={row.categoryName}
                            onChange={(next) => updateRow(row.id, next)}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-[11px] font-normal uppercase tracking-wide text-muted-foreground">
                              Назва
                            </Label>
                            {recurRows.length > 1 ? (
                              <button
                                type="button"
                                aria-label="Видалити платіж"
                                onClick={() => removeRow(row.id)}
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> прибрати
                              </button>
                            ) : null}
                          </div>
                          <Input
                            value={row.name}
                            onChange={(e) => updateRow(row.id, { name: e.target.value })}
                            placeholder="Напр. Богданівська, Київстар…"
                            aria-label="Назва платежу"
                            className="h-10"
                          />
                        </div>
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                          <Label className="text-[11px] font-normal uppercase tracking-wide text-muted-foreground">
                            {row.amountVaries ? "Орієнтир" : "Сума"}
                          </Label>
                          <div className="flex gap-1.5">
                            <Input
                              value={row.amount}
                              onChange={(e) => updateRow(row.id, { amount: e.target.value })}
                              inputMode="decimal"
                              placeholder={row.amountVaries ? "необов'язково" : "0.00"}
                              aria-label="Сума"
                              className="h-10 min-w-0 flex-1 tabular-nums"
                            />
                            <Select
                              value={row.currency}
                              onValueChange={(v) => updateRow(row.id, { currency: v as FxCurrency })}
                            >
                              <SelectTrigger className="h-10 w-[64px] shrink-0 px-2.5" aria-label="Валюта">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="UAH">₴</SelectItem>
                                <SelectItem value="USD">$</SelectItem>
                                <SelectItem value="EUR">€</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-[11px] font-normal uppercase tracking-wide text-muted-foreground">
                            Періодичність
                          </Label>
                          <Select
                            value={row.period}
                            onValueChange={(v) => updateRow(row.id, { period: v as BillingPeriod })}
                          >
                            <SelectTrigger className="h-10" aria-label="Періодичність">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BILLING_PERIOD_ORDER.map((p) => (
                                <SelectItem key={p} value={p}>
                                  {BILLING_PERIOD_LABELS[p]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={row.amountVaries}
                          onCheckedChange={(v) => updateRow(row.id, { amountVaries: v === true })}
                        />
                        Сума змінна — журнал по датах (прибирання, комуналка)
                      </label>
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" size="sm" className="mt-2 h-9 gap-1.5" onClick={addRow}>
                  <Plus className="h-4 w-4" /> Додати платіж
                </Button>
              </div>

              {/* Спільні поля — застосуються до всіх платежів у списку */}
              <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Спільне для всіх
                </div>
                <div className="mb-3 grid gap-2">
                  <Label>Обʼєкт / адреса</Label>
                  <Input
                    value={objectGroup}
                    onChange={(e) => setObjectGroup(e.target.value)}
                    list="expense-object-options"
                    placeholder="Напр. Богданівська 7 — згрупує оренду, комуналку, інтернет цього офісу"
                    className="h-10"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Спосіб оплати</Label>
                    <Select value={accountId || "none"} onValueChange={(v) => setAccountId(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-10">
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
                      <SelectTrigger className="h-10">
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
                  <div className="grid gap-2">
                    <Label>Дата початку</Label>
                    <Input
                      type="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── Одиночна витрата (разова / сервіс / редагування) ──
               Один grid: повноширинні блоки — sm:col-span-2, тож рядки завжди вирівняні. */
            <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>
                  {varyingRecurring ? "Орієнтовна сума" : "Сума"}
                  {varyingRecurring ? null : <span className="text-destructive"> *</span>}
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    autoFocus={!editing}
                    className="h-10 text-base font-semibold tabular-nums"
                  />
                  <Select value={currency} onValueChange={(v) => setCurrency(v as FxCurrency)}>
                    <SelectTrigger className="h-10 w-[92px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UAH">₴ грн</SelectItem>
                      <SelectItem value="USD">$ USD</SelectItem>
                      <SelectItem value="EUR">€ EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>{varyingRecurring ? "Веду облік з" : isRecurring ? "Дата початку" : "Дата оплати"}</Label>
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="h-10" />
              </div>

              {/* FX — на всю ширину, тому наступні рядки не зсуваються */}
              <p className="-mt-2 min-h-[16px] text-[11px] leading-4 text-muted-foreground sm:col-span-2">
                {currency !== "UAH"
                  ? currentRate
                    ? `≈ ${formatOrderMoney(uahValue ?? 0, "UAH")} за курсом ${currentRate.toFixed(2)}`
                    : "Курс ще не завантажився — гривневий еквівалент з'явиться пізніше."
                  : ""}
              </p>

              {/* Сума змінна: у списку зʼявиться журнал — кожна оплата з датою й коментарем. */}
              {isRecurring ? (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/60 bg-muted/10 p-3 sm:col-span-2">
                  <Checkbox
                    checked={amountVaries}
                    onCheckedChange={(v) => setAmountVaries(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-foreground">Сума змінна — вести журнал по датах</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Для прибирання, комуналки й подібного: у списку зʼявиться журнал, куди вписуватимеш
                      кожну оплату — конкретна дата, сума й коментар (кілька на місяць — теж можна).
                      Сума вище — лише орієнтир. Оренда/підписки — лишай вимкненим.
                    </span>
                  </span>
                </label>
              ) : null}

              {/* Обʼєкт/адреса — групує оренду+комуналку одного офісу в списку «Інші регулярні». */}
              {expenseKind === "recurring" ? (
                <div className="grid gap-2 sm:col-span-2">
                  <Label>Обʼєкт / адреса</Label>
                  <Input
                    value={objectGroup}
                    onChange={(e) => setObjectGroup(e.target.value)}
                    list="expense-object-options"
                    placeholder="Напр. Богданівська 7 (щоб згрупувати з комуналкою)"
                    className="h-10"
                  />
                </div>
              ) : null}

              {isRecurring ? (
                <>
                  <div className="grid gap-2">
                    <Label>Періодичність</Label>
                    <Select value={billingPeriod} onValueChange={(v) => setBillingPeriod(v as BillingPeriod)}>
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BILLING_PERIOD_ORDER.map((p) => (
                          <SelectItem key={p} value={p}>
                            {BILLING_PERIOD_LABELS[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Наступне списання — лише для сталої суми: у журналі дати ведуться поштучно. */}
                  {varyingRecurring ? null : (
                    <div className="grid gap-2">
                      <Label>Наступне списання</Label>
                      <Input type="date" value={nextChargeDate} onChange={(e) => setNextChargeDate(e.target.value)} className="h-10" />
                    </div>
                  )}
                </>
              ) : null}

              <div className="grid gap-2">
                <Label>{expenseKind === "service" ? "Сервіс" : "Постачальник"}</Label>
                <Input
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder={expenseKind === "service" ? "Dropbox або dropbox.com" : "Назва постачальника"}
                  className="h-10"
                />
              </div>
              <div className="grid gap-2">
                <Label>Стаття витрат</Label>
                <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-10">
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

              {expenseKind === "service" ? (
                <div className="grid gap-2 sm:col-span-2">
                  <Label>Сервіс зі списку</Label>
                  <Select value={vendorKey || "none"} onValueChange={(v) => applyBrand(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-10">
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
                    Підтягне лого й типову валюту. Немає в списку — впишіть домен у назву (напр. vercel.com).
                  </p>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label>Спосіб оплати</Label>
                <Select value={accountId || "none"} onValueChange={(v) => setAccountId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-10">
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
                  <SelectTrigger className="h-10">
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

              {isRecurring ? (
                <div className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5 text-xs sm:col-span-2">
                  {varyingRecurring ? (
                    <span className="text-muted-foreground">
                      Сума змінна — кожну оплату з датою й коментарем додаси в журналі (у списку витрат).
                    </span>
                  ) : monthlyUah === null ? (
                    <span className="text-muted-foreground">
                      {amountNum > 0 ? "Курс ще не завантажився." : "Введіть суму — порахуємо місячну вартість."}
                    </span>
                  ) : (
                    <>
                      <span className="text-muted-foreground">У витратах кожного місяця: </span>
                      <span className="font-semibold text-foreground">{formatOrderMoney(monthlyUah, "UAH")}</span>
                      {billingPeriod !== "monthly" ? (
                        <span className="text-muted-foreground">
                          {" "}
                          ({nativeAmountLabel({ amount: amountNum, currency })} ÷ {BILLING_PERIOD_MONTHS[billingPeriod]} міс)
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {/* Розподіл на замовлення — тільки разова: підписка не належить замовленню. */}
              {expenseKind === "one_off" ? (
                <div className="rounded-xl border border-border/60 bg-muted/10 p-3 sm:col-span-2">
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
                      Не обов'язково. Додайте, якщо витрата стосується конкретних замовлень (для маржі).
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
                            className="h-9 w-24"
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
                        <span>Залишок: {nativeAmountLabel({ amount: remaining, currency })}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="grid gap-2 sm:col-span-2">
                <Label>Коментар</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Необов'язково"
                  className="min-h-[64px]"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-col items-stretch gap-3 border-t border-border/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Живий підсумок — завжди в одному місці, читається без пошуку по формі. */}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
            {batchMode ? (
              batchMonthlyTotal > 0 ? (
                <>
                  <span className="text-muted-foreground">Разом на місяць:</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatOrderMoney(batchMonthlyTotal, "UAH")}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Заповніть суми платежів</span>
              )
            ) : amountNum > 0 ? (
              <>
                <span className="font-semibold tabular-nums text-foreground">
                  {nativeAmountLabel({ amount: amountNum, currency })}
                </span>
                {currency !== "UAH" && uahValue !== null ? (
                  <span className="text-muted-foreground">≈ {formatOrderMoney(uahValue, "UAH")}</span>
                ) : null}
                {isRecurring && monthlyUah !== null ? (
                  <span className="text-muted-foreground">· {formatOrderMoney(monthlyUah, "UAH")} / міс</span>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">Введіть суму</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Скасувати
            </Button>
            <Button onClick={() => void (batchMode ? submitBatch() : submit())} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {batchMode && batchValidCount > 1 ? `Зберегти (${batchValidCount})` : "Зберегти"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

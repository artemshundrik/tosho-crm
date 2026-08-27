import { formatCurrencyAmount, type FxCurrency, type FxRates } from "@/lib/fxRates";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import { expenseUahAmount, type FinanceExpense } from "./types";

// Дрібні помічники розділу «Витрати»: місяці, дати, парсинг і підписи сум.
//
// Винесені з FinanceExpenses.tsx (REQ-190), коли ратчет розміру сказав своє:
// це чисті функції без стану, їх ділять і сама сторінка, і панель журналу
// (./ExpenseJournalPanel), і тримати їх у тритисячному файлі не було причини.

export const MONTHS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

// «YYYY-MM» → «Липень 2026»; empty key → «Без дати».
export const monthLabel = (key: string) => {
  if (!key) return "Без дати";
  const [year, month] = key.split("-").map(Number);
  return `${MONTHS[(month || 1) - 1]} ${year}`;
};

export const MONTHS_GENITIVE = [
  "січень", "лютий", "березень", "квітень", "травень", "червень",
  "липень", "серпень", "вересень", "жовтень", "листопад", "грудень",
];

// «YYYY-MM» → «серпень» — короткий підпис усередині фрази («не внесено за серпень»),
// де рік зайвий, а велика літера посеред речення читається як помилка.
export const monthShort = (key: string) => {
  const month = Number(key.slice(5, 7));
  return MONTHS_GENITIVE[(month || 1) - 1] ?? key;
};


// Парсинг суми з «людського» вводу: апостроф/пробіл (і nbsp) — роздільник тисяч,
// останній «,» або «.» — десятковий. «6'238,20» → 6238.2; «12 500» → 12500.
// Повертає null, якщо це не додатне число (для валідації + тосту).
export const parseAmountInput = (raw: string): number | null => {
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
export const amountNumber = (raw: string): number => parseAmountInput(raw) ?? 0;

// Назва, у якій немає жодної літери, — це майже завжди вписана не в те поле сума.
// Реальний випадок (REQ-190): у «Постачальник» для палива вписали «40 302,65», і
// в списку витрата так і називалась — числом, з тим самим числом справа.
export const looksLikeAmount = (raw: string): boolean => {
  const value = raw.trim();
  if (!value) return false;
  return !/\p{L}/u.test(value) && /\d/.test(value);
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

// Пресети «за скільки днів до платежу» нагадувати + людські підписи.
export const REMINDER_LEAD_OPTIONS = [1, 3, 7, 14, 30];
export const REMINDER_LEAD_LABELS: Record<number, string> = {
  1: "За 1 день",
  3: "За 3 дні",
  7: "За тиждень",
  14: "За 2 тижні",
  30: "За місяць",
};
export const reminderLeadLabel = (d: number) => REMINDER_LEAD_LABELS[d] ?? `За ${d} дн.`;

// «YYYY-MM-DD» мінус N днів → «YYYY-MM-DD» (дата спрацювання нагадування).
export const subtractDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};
export const formatDate = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("uk-UA");
  } catch {
    return value;
  }
};

export const daysUntil = (date: string) => {
  const target = new Date(`${date}T00:00:00`).getTime();
  const today = new Date(`${todayISO()}T00:00:00`).getTime();
  return Math.round((target - today) / 86400000);
};

// «через 12 днів» / «сьогодні» / «прострочено на 3 дні» — коротка підказка біля дати.
export const chargeCountdown = (date: string) => {
  const days = daysUntil(date);
  if (days === 0) return "сьогодні";
  if (days === 1) return "завтра";
  if (days > 1) return `через ${days} дн.`;
  return `прострочено на ${Math.abs(days)} дн.`;
};

// «$200» або «200 ₴» — рівно в тій валюті, в якій підписку виставили.
export const nativeAmountLabel = (expense: Pick<FinanceExpense, "amount" | "currency">) =>
  expense.currency === "UAH"
    ? formatOrderMoney(expense.amount, "UAH")
    : formatCurrencyAmount(expense.amount, expense.currency);

// «≈ 8 400 ₴» — гривневий еквівалент валютної суми; для гривні не показуємо.
export const uahHint = (expense: FinanceExpense, rates: FxRates) => {
  if (expense.currency === "UAH") return null;
  const uah = expenseUahAmount(expense, rates);
  return uah === null ? "курс невідомий" : `≈ ${formatOrderMoney(uah, "UAH")}`;
};

export const CURRENCY_SYMBOL: Record<FxCurrency, string> = { UAH: "₴", USD: "$", EUR: "€" };

// «запис / записи / записів» за українським правилом множини.
export const pluralEntries = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "запис";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "записи";
  return "записів";
};


// «05.07» — короткий день+місяць запису (рік зрозумілий із заголовка місяця).
export const formatDayShort = (entryDate: string) => {
  const [, m, d] = entryDate.split("-");
  return d && m ? `${d}.${m}` : entryDate;
};

// Дата за замовчуванням для нового запису: сьогодні, якщо додаємо в поточний місяць,
// інакше — перше число вибраного місяця (коли «доганяєш» минулий).
export const defaultEntryDate = (monthKey: string, currentKey: string) =>
  monthKey === currentKey ? todayISO() : `${monthKey}-01`;

// Сума запису в рідній валюті + гривневий орієнтир (для не-гривні).
export const entryAmountLabel = (amount: number, currency: FxCurrency) =>
  currency === "UAH" ? formatOrderMoney(amount, "UAH") : formatCurrencyAmount(amount, currency);


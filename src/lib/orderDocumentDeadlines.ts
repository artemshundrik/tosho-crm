/**
 * Строки документів замовнику (REQ-343): робочі дні, «рахунок дійсний 5 р.д.»,
 * пороги нагадувань. Без жодного імпорту — модуль читають і інтерфейс
 * (через orderDocumentDispatch.ts), і крон ранкового зведення
 * (netlify/functions/order-document-reminders.ts), якому аліас `@/` недоступний.
 */

/** Рахунок дійсний 5 робочих днів з дати рахунку — так і в шаблоні BAS (Влад, 02.11). */
export const INVOICE_VALID_WORKING_DAYS = 5;
/** Погоджене чи виписане, але не надіслане з попереднього робочого дня — нагадати менеджеру. */
export const UNSENT_REMIND_AFTER_WORKING_DAYS = 1;
/** Надіслане й не підписане 2 робочі дні — нагадати менеджеру. */
export const UNSIGNED_REMIND_AFTER_WORKING_DAYS = 2;
/** 5 робочих днів без руху — у зведення керівнику. */
export const ESCALATE_AFTER_WORKING_DAYS = 5;

// --- Робочі дні: пн–пт, як у addBalanceDays (за воєнного стану свят немає). ---

const isoToUtc = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};
const DAY_MS = 86_400_000;
const isWeekend = (ms: number) => {
  const weekday = new Date(ms).getUTCDay();
  return weekday === 0 || weekday === 6;
};

/** Скільки робочих днів минуло: дні після `fromIso` до `toIso` включно (0 — той самий день). */
export const workingDaysBetween = (fromIso: string, toIso: string): number => {
  const from = isoToUtc(fromIso);
  const to = isoToUtc(toIso);
  let count = 0;
  for (let cursor = from + DAY_MS; cursor <= to; cursor += DAY_MS) if (!isWeekend(cursor)) count += 1;
  return count;
};

/** Дата + N робочих днів (сам день не рахується) — як addBalanceDays для «working». */
export const addWorkingDays = (startIso: string, days: number): string => {
  let cursor = isoToUtc(startIso);
  let left = days;
  while (left > 0) {
    cursor += DAY_MS;
    if (!isWeekend(cursor)) left -= 1;
  }
  return new Date(cursor).toISOString().slice(0, 10);
};

/** Дата + N календарних днів — доплата «протягом N календарних днів». */
export const addCalendarDays = (startIso: string, days: number): string =>
  new Date(isoToUtc(startIso) + days * DAY_MS).toISOString().slice(0, 10);

/** Попередній робочий день — «за день до кінця строку». */
export const previousWorkingDay = (iso: string): string => {
  let cursor = isoToUtc(iso) - DAY_MS;
  while (isWeekend(cursor)) cursor -= DAY_MS;
  return new Date(cursor).toISOString().slice(0, 10);
};

const kyivDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kiev" });
/** Київська дата позначки часу: надіслане о 23:30 UTC — уже наступний день. */
export const kyivDayOf = (value: string) => {
  if (value.length <= 10) return value;
  const time = Date.parse(value);
  return Number.isNaN(time) ? value.slice(0, 10) : kyivDayFormat.format(new Date(time));
};

/** «02.11» */
export const formatDispatchDay = (value: string) => {
  const day = kyivDayOf(value);
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`;
};

// --- Строк оплати рахунку ---

export type InvoiceDueInput = {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceCreatedAt: string | null;
  /** Відсоток наперед; null — умов немає (старі замовлення), рахуємо як передоплату. */
  prepaymentPct: number | null;
  balanceTiming: string | null;
  paymentStatus: string;
};

export type InvoiceDue = {
  dueDate: string;
  /** З цього дня — «за день до кінця»: жовтий і нагадування менеджеру. */
  warnFrom: string;
  overdue: boolean;
  warning: boolean;
};

/** Оплата, що вже прийшла (хоч частково): рахунок своє відпрацював. */
export const PAYMENT_STARTED_STATUSES = new Set(["partially_paid", "fully_paid", "awaiting_balance"]);

/**
 * Строк оплати рахунку: 5 робочих днів з дати рахунку. Лише там, де рахунок
 * справді треба оплатити наперед: на відтермінуванні (0% до відвантаження,
 * доплата після ВН) строк рахує дата ВН чи акта — це getBalanceDue.
 */
export const getInvoiceDue = (input: InvoiceDueInput, todayIso: string): InvoiceDue | null => {
  if (!input.invoiceNumber || PAYMENT_STARTED_STATUSES.has(input.paymentStatus)) return null;
  if (input.prepaymentPct === 0 && input.balanceTiming === "after_shipment") return null;
  const from = input.invoiceDate ?? (input.invoiceCreatedAt ? kyivDayOf(input.invoiceCreatedAt) : null);
  if (!from) return null;
  const dueDate = addWorkingDays(from, INVOICE_VALID_WORKING_DAYS);
  const warnFrom = previousWorkingDay(dueDate);
  const overdue = todayIso > dueDate;
  return { dueDate, warnFrom, overdue, warning: !overdue && todayIso >= warnFrom };
};

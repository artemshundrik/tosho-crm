import type { ExpenseEntry, FinanceExpense } from "./types";

// Правило «місяць не закритий» — ОДНЕ на всі поверхні: бейдж на рядку витрати,
// лічильник у заголовку секції, мітка на підпункті «Витрати» і крон-функція
// netlify/functions/finance-month-close-reminders.ts. Тримати їх синхронно
// коментарями не вийшло б — тому логіка живе тут, а не копіюється.

/** Скільки місяців перед цільовим дивимось, щоб зрозуміти «цю витрату ведуть». */
export const MONTH_CLOSE_HISTORY_MONTHS = 3;

/** «YYYY-MM» ± місяців. */
export function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(year, (month || 1) - 1 + delta, 1));
  return dt.toISOString().slice(0, 7);
}

/**
 * Журнальні витрати, за якими у `monthKey` немає жодного запису, АЛЕ є історія
 * за попередні місяці.
 *
 * Умова про історію обовʼязкова: без неї давно закинуті статті («Кондиціонери»
 * з нулем записів за весь час) світилися б у списку вічно й привчили б його
 * ігнорувати. Події (`eventType`) виключені — вони разові за природою.
 */
export function findMissingMonthEntries(
  expenses: FinanceExpense[],
  entriesByExpense: Map<string, ExpenseEntry[]>,
  monthKey: string
): Set<string> {
  const historyMonths = Array.from({ length: MONTH_CLOSE_HISTORY_MONTHS }, (_, i) =>
    shiftMonthKey(monthKey, -(i + 1))
  );
  const ids = new Set<string>();
  for (const expense of expenses) {
    if (!expense.isRecurring || !expense.amountVaries || expense.eventType) continue;
    const entries = entriesByExpense.get(expense.id) ?? [];
    if (entries.some((en) => en.entryDate.slice(0, 7) === monthKey)) continue;
    if (entries.some((en) => historyMonths.includes(en.entryDate.slice(0, 7)))) ids.add(expense.id);
  }
  return ids;
}

import { isRecurringExpenseInMonth } from "./expenseMonth";
import { expectsMonthlyEntry, type ExpenseEntry, type FinanceExpense } from "./types";

// Правило «місяць не закритий» — ОДНЕ на всі поверхні: бейдж на рядку витрати,
// лічильник у заголовку секції, мітка на підпункті «Витрати» і крон-функція
// netlify/functions/finance-month-close-reminders.ts. Тримати їх синхронно
// коментарями не вийшло б — тому логіка живе тут, а не копіюється.

/** «YYYY-MM» ± місяців. */
export function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(year, (month || 1) - 1 + delta, 1));
  return dt.toISOString().slice(0, 7);
}

/**
 * Журнальні витрати, від яких ЧЕКАЮТЬ запис щомісяця, але за `monthKey` його немає.
 *
 * Межі рахуємо від САМОЇ витрати, а не від її історії (REQ-190): від місяця
 * «веду облік з» до архівації включно, і не далі поточного місяця — майбутній
 * місяць не буває «не внесеним». Події (`eventType`) виключені: вони разові.
 *
 * До REQ-190 тут була умова «є хоч один запис за 3 попередні місяці» — щоб
 * закинуті статті («Кондиціонери» з нулем записів за весь час) не світились
 * вічно. Вона ж і глушила найгучніший випадок: НОВУ витрату з нулем записів,
 * яка щойно підставила свій орієнтир у кожен місяць. Здогад за історією
 * замінили дві речі, які каже людина: періодичність («по потребі» — не чекаємо
 * взагалі) і архів («більше не ведемо»).
 */
export function findMissingMonthEntries(
  expenses: FinanceExpense[],
  entriesByExpense: Map<string, ExpenseEntry[]>,
  monthKey: string,
  currentMonthKey: string
): Set<string> {
  const ids = new Set<string>();
  if (monthKey > currentMonthKey) return ids;
  for (const expense of expenses) {
    if (!expense.isRecurring || !expense.amountVaries || expense.eventType) continue;
    // «По потребі» (паливо, таксі, подарунки) не має чого «не внести»: воно або
    // сталось, або ні. Чекаємо запис лише від тих, хто ходить щомісяця.
    if (!expectsMonthlyEntry(expense)) continue;
    if (!isRecurringExpenseInMonth(expense, monthKey)) continue;
    const entries = entriesByExpense.get(expense.id) ?? [];
    if (entries.some((en) => en.entryDate.slice(0, 7) === monthKey)) continue;
    ids.add(expense.id);
  }
  return ids;
}

import { isRecurringExpenseInMonth } from "./expenseMonth";
import { expectsMonthlyEntry, type ExpenseEntry, type FinanceExpense } from "./types";

// Правило «місяць не закритий» — ОДНЕ на всі поверхні: бейдж на рядку витрати,
// лічильник у заголовку секції, мітка на підпункті «Витрати» і крон-функція
// netlify/functions/finance-month-close-reminders.ts. Тримати їх синхронно
// коментарями не вийшло б — тому логіка живе тут, а не копіюється.

/**
 * До якого числа НАСТУПНОГО місяця чекаємо запис від витрати, рахунок за яку
 * приходить після кінця місяця (REQ-314). Комуналку по офісу виставляють 6–8
 * числа, тож 10-те — перший день, коли «не внесено» справді означає «забули».
 * Крон `finance-month-close-billed` стоїть на це ж число.
 */
export const NEXT_MONTH_BILL_DUE_DAY = 10;

/** «YYYY-MM» ± місяців. */
export function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(year, (month || 1) - 1 + delta, 1));
  return dt.toISOString().slice(0, 7);
}

/**
 * Останній місяць, за який від витрати ВЖЕ чекають запис станом на `todayKey`
 * (YYYY-MM-DD).
 *
 * Звичайна журнальна витрата (вода, прибирання) — поточний місяць: записи в
 * неї лягають тим самим місяцем, і бейдж «не внесено» світиться від першого
 * числа, як і раніше. Витрата з рахунком наступного місяця (комуналка) свій
 * місяць закриває лише 10-го числа наступного: до 10 жовтня останній
 * «належний» місяць — серпень, з 10-го — вересень. Без цього вересень
 * світився «не внесеним» увесь вересень, хоч вносити не було з чого.
 */
export function latestDueMonth(expense: Pick<FinanceExpense, "billedNextMonth">, todayKey: string): string {
  const currentMonthKey = todayKey.slice(0, 7);
  if (!expense.billedNextMonth) return currentMonthKey;
  const day = Number(todayKey.slice(8, 10));
  return shiftMonthKey(currentMonthKey, day >= NEXT_MONTH_BILL_DUE_DAY ? -1 : -2);
}

/**
 * Журнальні витрати, від яких ЧЕКАЮТЬ запис щомісяця, але за `monthKey` його немає.
 *
 * Межі рахуємо від САМОЇ витрати, а не від її історії (REQ-190): від місяця
 * «веду облік з» до архівації включно, і не далі останнього місяця, за який
 * запис уже належить (`latestDueMonth`), — майбутній місяць, як і вересень
 * комуналки до 10 жовтня, не буває «не внесеним». Події (`eventType`)
 * виключені: вони разові.
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
  todayKey: string
): Set<string> {
  const ids = new Set<string>();
  for (const expense of expenses) {
    if (!expense.isRecurring || !expense.amountVaries || expense.eventType) continue;
    // «По потребі» (паливо, таксі, подарунки) не має чого «не внести»: воно або
    // сталось, або ні. Чекаємо запис лише від тих, хто ходить щомісяця.
    if (!expectsMonthlyEntry(expense)) continue;
    if (monthKey > latestDueMonth(expense, todayKey)) continue;
    if (!isRecurringExpenseInMonth(expense, monthKey)) continue;
    const entries = entriesByExpense.get(expense.id) ?? [];
    if (entries.some((en) => en.entryDate.slice(0, 7) === monthKey)) continue;
    ids.add(expense.id);
  }
  return ids;
}

/**
 * Скільки журнальних витрат винні запис ПРОСТО ЗАРАЗ — кожна за свій останній
 * належний місяць: вода за поточний, комуналка за минулий (з 10-го числа).
 * Це мітка на підпункті «Витрати»: вона відповідає на «що не зроблено зараз»,
 * а не «що в місяці, який гортаю». Рахувати її одним спільним місяцем не можна:
 * у поточному місяці комуналка не винна ніколи, і мітка про неї б мовчала.
 */
export function countOutstandingMonthEntries(
  expenses: FinanceExpense[],
  entriesByExpense: Map<string, ExpenseEntry[]>,
  todayKey: string
): number {
  let count = 0;
  for (const expense of expenses) {
    const monthKey = latestDueMonth(expense, todayKey);
    if (findMissingMonthEntries([expense], entriesByExpense, monthKey, todayKey).size > 0) count += 1;
  }
  return count;
}

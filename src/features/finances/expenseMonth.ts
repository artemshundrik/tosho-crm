import { convertToUah, type FxRates } from "@/lib/fxRates";
import { expenseMonthlyUah, expenseUahAmount, type ExpenseEntry, type FinanceExpense } from "./types";

// Скільки коштує витрата в конкретному місяці — ОДНЕ правило на всі поверхні
// Фінансів (список «Витрати», bento-підсумок, Звіти, чекліст «закрити місяць»).
//
// НАВІЩО ОКРЕМИЙ МОДУЛЬ (REQ-190). До нього правило жило рядком усередині
// FinanceExpenses: «немає записів за місяць — підставляємо орієнтовну суму».
// У будь-який місяць, включно з тими, яких витрата ще не бачила. Бухгалтер
// завела 27.08 паливо з орієнтиром 40 302,65 — і ця сума додалась до кожного
// місяця в історії: червень показував 77 494 грн орієнтирів від трьох витрат,
// яких у червні не існувало. Виглядало як факт: те саме число, той самий шрифт.
//
// Тепер: журнальна витрата коштує рівно суму своїх записів. Немає записів —
// нуль, і в підсумок вона не йде. Орієнтир лишається підказкою, а не числом.

/** Природа місячної суми — від неї залежить і показ, і те, чи йде вона в підсумок. */
export type MonthCostKind =
  /** Підтверджено: записи журналу за цей місяць або стале зобовʼязання. */
  | "fact"
  /** Майбутній місяць: факту там ще не може бути, тож показуємо орієнтир як план. */
  | "plan"
  /** Місяць порожній: записів немає, а орієнтир — не факт. Нуль. */
  | "empty";

export type MonthCost = {
  /** Гривні для показу в рядку. null = курс невідомий, рахувати не можна. */
  uah: number | null;
  kind: MonthCostKind;
  /** Орієнтир у гривні — для сірої підказки під числом. null, якщо його нема. */
  estimateUah: number | null;
  /** Скільки записів журналу за цей місяць (0 для сталих). */
  entriesCount: number;
};

/** «YYYY-MM» місяця, з якого витрату ведуть («Веду облік з» / «Дата початку»). */
export const expenseStartMonth = (expense: Pick<FinanceExpense, "expenseDate">): string =>
  (expense.expenseDate ?? "").slice(0, 7);

/** «YYYY-MM» місяця, у якому витрату здали в архів (null = активна). */
export const expenseArchivedMonth = (expense: Pick<FinanceExpense, "archivedAt">): string | null =>
  expense.archivedAt ? expense.archivedAt.slice(0, 7) : null;

export const isExpenseArchived = (expense: Pick<FinanceExpense, "archivedAt">): boolean =>
  Boolean(expense.archivedAt);

/**
 * Чи існує регулярна витрата в цьому місяці.
 *
 * Дві межі, і обидві з реальних збоїв: оренда, заведена в липні, показувалась у
 * червні (бо регулярні не питали дати початку взагалі), а закинуту статтю не було
 * чим прибрати зі списку, крім видалення — разом з усією історією записів.
 * Архів — саме дата, а не прапорець: місяці до архівації лишаються як були.
 *
 * ФАКТ СИЛЬНІШИЙ ЗА МЕЖУ. Якщо за місяць є записи журналу — витрата в ньому є,
 * хай навіть «веду облік з» стоїть пізніше. Знайдено очима на живих даних: в
 * Уклона запис за 01.06, а дата початку — 31.07 (її поставили «кінцем місяця,
 * який закривали»), і чиста межа сховала б справжні 17 699 грн червня.
 */
export function isRecurringExpenseInMonth(
  expense: Pick<FinanceExpense, "expenseDate" | "archivedAt">,
  monthKey: string,
  hasEntriesInMonth = false
): boolean {
  if (hasEntriesInMonth) return true;
  const start = expenseStartMonth(expense);
  if (start && monthKey < start) return false;
  const archived = expenseArchivedMonth(expense);
  if (archived && monthKey > archived) return false;
  return true;
}

/**
 * Місячна вартість регулярної витрати.
 *
 * `monthEntries` — записи журналу САМЕ цього місяця (для події — всі її позиції:
 * подія привʼязана до власної дати, а не до вибраного місяця).
 * `currentMonthKey` відрізняє майбутнє від минулого: у вересні орієнтир — це
 * чесний план, у червні — вигадка.
 */
export function expenseMonthCost(
  expense: FinanceExpense,
  monthEntries: ExpenseEntry[],
  monthKey: string,
  rates: FxRates,
  currentMonthKey: string
): MonthCost {
  if (!expense.amountVaries) {
    return {
      uah: expenseMonthlyUah(expense, rates),
      kind: "fact",
      estimateUah: null,
      entriesCount: 0,
    };
  }

  const estimateUah = convertToUah(expense.amount, expense.currency, rates, expense.fxRate);

  if (monthEntries.length > 0) {
    const sum = monthEntries.reduce((total, entry) => total + entry.amount, 0);
    return {
      uah: convertToUah(sum, expense.currency, rates, expense.fxRate),
      kind: "fact",
      estimateUah,
      entriesCount: monthEntries.length,
    };
  }

  if (monthKey > currentMonthKey) {
    return { uah: estimateUah, kind: "plan", estimateUah, entriesCount: 0 };
  }

  return { uah: 0, kind: "empty", estimateUah, entriesCount: 0 };
}

/** Сума місяця по списку витрат: порожні місяці дають нуль, а не орієнтир. */
export function sumMonthCosts(costs: MonthCost[]): number {
  return costs.reduce((total, cost) => total + (cost.uah ?? 0), 0);
}

/** Витрата, розкладена по місяцях: один рядок = скільки вона коштувала в місяці. */
export type MonthlyExpenseRow = { expense: FinanceExpense; monthKey: string; uah: number };

/**
 * Розклад витрат по місяцях діапазону — для Звітів.
 *
 * До REQ-190 Звіти рахували інакше за Витрати: сумували `amount` усіх витрат із
 * датою в діапазоні. Річна підписка потрапляла в звіт РАЗ (у місяць свого
 * початку) і далі зникала, журнальна витрата йшла орієнтиром замість фактичних
 * записів, а валюта взагалі не переводилась. Тепер обидві поверхні рахують одним
 * правилом: регулярна — щомісяця, поки її ведуть; разова — у місяці своєї дати.
 */
export function expenseRowsForMonths(
  expenses: FinanceExpense[],
  entriesByExpense: Map<string, ExpenseEntry[]>,
  monthKeys: string[],
  rates: FxRates,
  currentMonthKey: string
): MonthlyExpenseRow[] {
  const rows: MonthlyExpenseRow[] = [];
  const monthSet = new Set(monthKeys);
  for (const expense of expenses) {
    const ownMonth = (expense.expenseDate ?? "").slice(0, 7);
    // Разова — рівно у своєму місяці.
    if (!expense.isRecurring) {
      if (!monthSet.has(ownMonth)) continue;
      rows.push({ expense, monthKey: ownMonth, uah: expenseUahAmount(expense, rates) ?? 0 });
      continue;
    }
    // Подія (корпоратив) технічно регулярна — щоб мати журнал позицій, — але
    // разова за природою: рахується лише в місяці своєї дати.
    if (expense.eventType) {
      if (!monthSet.has(ownMonth)) continue;
      const cost = expenseMonthCost(
        expense,
        entriesByExpense.get(expense.id) ?? [],
        ownMonth,
        rates,
        currentMonthKey
      );
      rows.push({ expense, monthKey: ownMonth, uah: cost.uah ?? 0 });
      continue;
    }
    for (const monthKey of monthKeys) {
      const monthEntries = expense.amountVaries
        ? (entriesByExpense.get(expense.id) ?? []).filter((en) => en.entryDate.slice(0, 7) === monthKey)
        : [];
      if (!isRecurringExpenseInMonth(expense, monthKey, monthEntries.length > 0)) continue;
      const cost = expenseMonthCost(expense, monthEntries, monthKey, rates, currentMonthKey);
      rows.push({ expense, monthKey, uah: cost.uah ?? 0 });
    }
  }
  return rows;
}

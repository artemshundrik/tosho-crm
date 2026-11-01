import { STATUS_OPTIONS, normalizeStatus } from "@/features/quotes/quotes-page/config";
import type { QuoteListTotal } from "@/features/quotes/quotes-page/quoteListTotal";

/**
 * Таблиця прорахунків групами за станом (хвиля В4, картка 346).
 *
 * Порядок груп — шлях прорахунку: на прорахунку → пораховано → чекає
 * погодження → погоджено → скасовано. Усередині групи лишається порядок,
 * який людина обрала сортуванням. Сума групи — сума того, що видно в колонці
 * «Сума»; якщо хоч в одного рядка сума «від» або ще невідома, сума групи теж «від».
 */

/** Стани, де хід наш: прострочений дедлайн тут — наша провина, і він червоний. */
const OUR_TURN_STATUSES = new Set(["new", "estimating", "estimated"]);

export const isQuoteOurTurn = (status: string | null | undefined) => OUR_TURN_STATUSES.has(status ?? "");

export type QuoteTableGroup<Row> = {
  status: string;
  rows: Row[];
  amount: number;
  /** Є рядок із сумою «від» або без суми — показуємо «від». */
  partial: boolean;
};

const statusRank = (status: string) => {
  const index = STATUS_OPTIONS.indexOf(status);
  // «Новий» (історичний) іде першим, невідоме — у кінець.
  if (status === "new") return -1;
  return index === -1 ? STATUS_OPTIONS.length : index;
};

export function groupQuoteRows<Row extends { id: string; status?: string | null }>(
  rows: Row[],
  totalOf: (row: Row) => QuoteListTotal | null | undefined
): QuoteTableGroup<Row>[] {
  const byStatus = new Map<string, QuoteTableGroup<Row>>();
  for (const row of rows) {
    const status = row.status ?? "";
    let group = byStatus.get(status);
    if (!group) {
      group = { status, rows: [], amount: 0, partial: false };
      byStatus.set(status, group);
    }
    group.rows.push(row);
    const total = totalOf(row);
    if (!total) {
      group.partial = true;
    } else {
      group.amount += total.amount;
      if (total.partial) group.partial = true;
    }
  }
  return [...byStatus.values()].sort((a, b) => statusRank(a.status) - statusRank(b.status));
}

/** Сума всього списку для шапки: «від», якщо хоч одна група неповна. */
export function formatQuoteGroupsSum(groups: QuoteTableGroup<unknown>[], format: (amount: number) => string) {
  if (groups.length === 0) return undefined;
  const amount = groups.reduce((sum, group) => sum + group.amount, 0);
  return `${groups.some((group) => group.partial) ? "від " : ""}${format(Math.round(amount))}`;
}

export const parseDateOnly = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }
  return new Date(value);
};

/** Дедлайн прорахунку для таблиці, дошки й прев'ю. */
export const getDeadlineBadge = (value?: string | null, status?: string | null) => {
  if (!value) return { label: "Не вказано", tone: "none" as const };
  const date = parseDateOnly(value);
  if (Number.isNaN(date.getTime())) {
    return { label: "Не вказано", tone: "none" as const };
  }
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDeadline = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfDeadline.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));

  // Тривога — лише де хід наш (В4): прорахунок у клієнта на погодженні,
  // затверджений чи скасований показує дату нейтрально.
  if (status && !isQuoteOurTurn(normalizeStatus(status))) {
    return { label: date.toLocaleDateString("uk-UA"), tone: "future" as const };
  }

  if (diffDays < 0) {
    return {
      label: `Прострочено (${Math.abs(diffDays)} дн.)`,
      tone: "overdue" as const,
    };
  }
  if (diffDays === 0) {
    return {
      label: "Сьогодні",
      tone: "today" as const,
    };
  }
  if (diffDays <= 2) {
    return {
      label: diffDays === 1 ? "Завтра" : `Через ${diffDays} дн.`,
      tone: "soon" as const,
    };
  }
  return {
    label: date.toLocaleDateString("uk-UA"),
    tone: "future" as const,
  };
};

import type { ReactNode } from "react";

import { KanbanOffBoardList } from "@/components/kanban";
import { quoteTypeLabel } from "@/features/quotes/quotes-page/config";
import type { QuoteListRow } from "@/lib/toshoApi";

/**
 * Скасовані прорахунки — окремий список замість колонки на дошці (REQ-138).
 *
 * ЧОМУ ОКРЕМИЙ ФАЙЛ, А НЕ ГІЛКА В QuotesPage. Сторінка вже на 8 тисяч рядків, і
 * ратчет розміру (scripts/check-file-growth.mjs) б'є саме по причині, а не по
 * наслідку: у файл такого розміру нове не дописується. Тут лежить рівно
 * перетворення рядка прорахунку на рядок списку — воно нікому більше не
 * потрібне й нікуди звідси не тягнеться.
 *
 * Чому список, а не сьома колонка, і чому кнопка «Повернути» обов'язкова —
 * розгорнуто в @/lib/kanbanBoards і в KanbanOffBoardList.
 */
type CancelledQuotesListProps = {
  rows: QuoteListRow[];
  /** Прорахунок, який зараз повертають: кнопка на ньому крутиться. */
  busyId: string | null;
  /** Гейт «лише свої» — той самий, що на дошці. */
  canOpen: (row: QuoteListRow) => boolean;
  onOpen: (row: QuoteListRow) => void;
  onRestore: (row: QuoteListRow) => void;
  managerLabel: (assignedTo: string | null | undefined) => string;
  /** «Показати ще»: прорахунки вантажаться сторінками. */
  footer?: ReactNode;
};

const formatCreated = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export function CancelledQuotesList({
  rows,
  busyId,
  canOpen,
  onOpen,
  onRestore,
  managerLabel,
  footer,
}: CancelledQuotesListProps) {
  return (
    <KanbanOffBoardList
      busyId={busyId}
      emptyText="Скасованих прорахунків немає."
      footer={footer}
      entries={rows.map((row) => {
        const openable = canOpen(row);
        const title = row.customer_name?.trim() || "Не вказано";
        return {
          id: row.id,
          code: row.number ?? "—",
          title,
          // Назва прорахунку часто дорівнює назві замовника — тоді другий
          // рядок повторював би перший. Показуємо тип.
          subtitle:
            row.title?.trim() && row.title.trim() !== title
              ? row.title.trim()
              : quoteTypeLabel(row.quote_type),
          meta: (
            <>
              <span className="max-w-[150px] truncate">{managerLabel(row.assigned_to)}</span>
              <span className="tabular-nums">{formatCreated(row.created_at)}</span>
            </>
          ),
          onOpen: openable ? () => onOpen(row) : undefined,
          // Повертає той, хто взагалі має доступ до картки: гейт «лише свої»
          // діє тут так само, як на дошці.
          restore: openable ? { label: "Повернути", onSelect: () => onRestore(row) } : null,
        };
      })}
    />
  );
}

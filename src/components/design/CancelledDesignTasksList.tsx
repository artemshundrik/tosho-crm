import type { ReactNode } from "react";

import { KanbanOffBoardList } from "@/components/kanban";

/**
 * Скасовані дизайн-задачі — окремий список замість колонки на дошці (REQ-138).
 *
 * ЧОМУ ОКРЕМИЙ ФАЙЛ — з тієї ж причини, що й у прорахунках: DesignPage уже на
 * 6 тисяч рядків, і ратчет розміру не дає дописувати в кінець. Тут лежить рівно
 * перетворення задачі на рядок списку.
 *
 * ТИП ЗАДАЧІ ОПИСАНИЙ СТРУКТУРНО, а не імпортований: `DesignTask` живе всередині
 * DesignPage і назовні не виноситься. Брати звідти тип означало б тягнути
 * сторінку-гігант у кожного, хто просто малює список.
 */
type CancelledDesignTask = {
  id: string;
  title: string | null;
  designTaskNumber?: string | null;
  quoteNumber?: string | null;
  customerName?: string | null;
  productName?: string | null;
  createdAt?: string | null;
};

type CancelledDesignTasksListProps<T extends CancelledDesignTask> = {
  tasks: T[];
  busyId: string | null;
  onOpen: (task: T) => void;
  /** `null` — у цієї людини немає права повертати саме цю задачу. */
  restoreOf: (task: T) => (() => void) | null;
  assigneeLabel: (task: T) => string;
  footer?: ReactNode;
};

/**
 * Дата створення коротким рядком у київському часі.
 *
 * НЕ через розбір «перших десяти символів», яким читаються дедлайни: дедлайн —
 * настінна дата, а `createdAt` це позначка часу в UTC. Ввечері за Києвом такий
 * розбір давав учорашню дату.
 */
const formatCreated = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Kiev",
  });
};

export function CancelledDesignTasksList<T extends CancelledDesignTask>({
  tasks,
  busyId,
  onOpen,
  restoreOf,
  assigneeLabel,
  footer,
}: CancelledDesignTasksListProps<T>) {
  return (
    <KanbanOffBoardList
      busyId={busyId}
      emptyText="Скасованих дизайн-задач немає."
      footer={footer}
      entries={tasks.map((task) => {
        const restore = restoreOf(task);
        return {
          id: task.id,
          code: task.designTaskNumber ?? task.quoteNumber ?? "—",
          title: task.title?.trim() || task.productName?.trim() || "Без назви",
          subtitle: task.customerName?.trim() || null,
          meta: (
            <>
              <span className="max-w-[150px] truncate">{assigneeLabel(task)}</span>
              <span className="tabular-nums">{formatCreated(task.createdAt)}</span>
            </>
          ),
          onOpen: () => onOpen(task),
          restore: restore ? { label: "Повернути", onSelect: restore } : null,
        };
      })}
    />
  );
}

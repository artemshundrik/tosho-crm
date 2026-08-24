import type { ReactNode } from "react";
import { Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Список карток, виведених із канбан-дошки (@/lib/kanbanBoards).
 *
 * ЧОМУ СПИСОК, А НЕ КОЛОНКА. Стовпчик читається як етап, який картка проходить
 * і залишає, — а скасоване не рухається нікуди. На проді це було 56% дошки
 * прорахунків, тобто кладовище посеред роботи, яке ще й з'їдало ширину екрана
 * й ламало відчуття обсягу: очі рахують усі стовпчики разом.
 *
 * ЧОМУ САМЕ РЯДКИ, А НЕ СТІНА КАРТОК. Сюди не приходять ВИБИРАТИ — сюди
 * заходять по конкретну картку, згадавши, що її колись скасували. Для пошуку
 * очима по одній колонці рядок кращий за картку: вісім рядків на екран проти
 * трьох карток, і всі ключові поля в одному рівні.
 *
 * ДОРОГА НАЗАД ОБОВ'ЯЗКОВА. Дані ця історія не чіпає — картка лишається в тому
 * самому статусі, — тож і повернення має бути дією, а не міграцією: кнопка в
 * рядку, одна на всі дошки. Без неї список став би пасткою, з якої видно, але
 * не вийти: перетягнути звідси нікуди, колонки в цього стану немає.
 *
 * ВІДКРИВАЄТЬСЯ ФІЛЬТРОМ СТАТУСІВ, а не власною кнопкою в тулбарі — чому саме
 * так, розгорнуто в @/lib/kanbanBoards.
 */
export type KanbanOffBoardEntry = {
  id: string;
  /** Номер картки — те, за чим її шукають очима. Моноширинний, зліва. */
  code?: ReactNode;
  title: string;
  /** Другий рядок: замовник, тип, будь-що, що допомагає впізнати картку. */
  subtitle?: ReactNode;
  /** Праворуч перед кнопкою: виконавець, дата, мітки. */
  meta?: ReactNode;
  onOpen?: () => void;
  /** Дія повернення. `null` — у цієї людини такого права немає. */
  restore?: { label: string; onSelect: () => void } | null;
};

type KanbanOffBoardListProps = {
  entries: KanbanOffBoardEntry[];
  /** Що написати, коли список порожній. */
  emptyText: string;
  /** Картка, яку зараз повертають: кнопка на ній крутиться, решта чекає. */
  busyId?: string | null;
  /** «Показати ще» і подібне — під списком, усередині тієї самої рамки немає. */
  footer?: ReactNode;
  className?: string;
};

export function KanbanOffBoardList({
  entries,
  emptyText,
  busyId,
  footer,
  className,
}: KanbanOffBoardListProps) {
  return (
    <div className={cn("px-4 py-4 md:px-5 md:py-5 lg:px-6", className)}>
      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-card">
          {entries.map((entry) => {
            const busy = busyId === entry.id;
            return (
              <li key={entry.id}>
                {/*
                  div з role="button", а не сам <button>: усередині рядка вже
                  стоїть кнопка «Повернути», а кнопка в кнопці — невалідна
                  розмітка, яку браузер розбирає на свій розсуд. Клавіатуру при
                  цьому не втрачаємо: tabIndex + Enter/Space.
                */}
                <div
                  role={entry.onOpen ? "button" : undefined}
                  tabIndex={entry.onOpen ? 0 : undefined}
                  onClick={entry.onOpen}
                  onKeyDown={(event) => {
                    if (!entry.onOpen) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      entry.onOpen();
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                    entry.onOpen &&
                      "cursor-pointer hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none"
                  )}
                >
                  {entry.code ? (
                    <span className="w-[88px] shrink-0 truncate font-mono text-2xs font-semibold tracking-wide text-muted-foreground sm:w-[104px]">
                      {entry.code}
                    </span>
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium" title={entry.title}>
                      {entry.title}
                    </p>
                    {entry.subtitle ? (
                      <p className="mt-0.5 truncate text-2xs text-muted-foreground">{entry.subtitle}</p>
                    ) : null}
                  </div>

                  {entry.meta ? (
                    <div className="hidden shrink-0 items-center gap-2 text-2xs text-muted-foreground sm:flex">
                      {entry.meta}
                    </div>
                  ) : null}

                  {entry.restore ? (
                    <Button
                      variant="outline"
                      size="xs"
                      className="shrink-0 gap-1.5"
                      disabled={busy}
                      // На телефоні лишається сама іконка: підпис з'їдав рядок
                      // так, що від назви картки лишалось «Дизайн: С…».
                      aria-label={entry.restore.label}
                      title={entry.restore.label}
                      onClick={(event) => {
                        event.stopPropagation();
                        entry.restore?.onSelect();
                      }}
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">{entry.restore.label}</span>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {footer ? <div className="flex justify-center pt-4">{footer}</div> : null}
    </div>
  );
}

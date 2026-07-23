import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * Шапка колонки канбану — спільна для борда прорахунків і борда дизайну.
 *
 * До виділення ця розмітка стояла двічі, байт-в-байт, у QuotesPage і DesignPage.
 * Будь-яка зміна вимагала правки в обох місцях, і рано чи пізно вони б розійшлись.
 *
 * Лічильник бере ТОЙ САМИЙ тон, що й іконка. Раніше він був сірий
 * (text-muted-foreground) на тінтованій шапці, тож шапка змішувала два різні
 * набори: іконку в кольорі колонки і число з чужого, нейтрального набору.
 *
 * Чому саме текст у тоні, а не тонований чип: чип із м'якою заливкою лягає на
 * вже тінтовану шапку, різниця з'їдається і контраст падає нижче 4.5:1
 * (у «Правках» 4.26, у «В роботі» 4.46). Простий текст у тоні тримає 4.5–6.1
 * на всіх колонках обох бордів.
 */
type KanbanColumnHeaderProps = {
  icon: ComponentType<{ className?: string }>;
  /** Клас тону колонки (tone-text-*). Нейтральні колонки лишаються сірими. */
  toneClassName?: string;
  label: string;
  count: number;
};

export function KanbanColumnHeader({
  icon: Icon,
  toneClassName,
  label,
  count,
}: KanbanColumnHeaderProps) {
  const tone = toneClassName || "text-muted-foreground";
  return (
    <div className="kanban-column-header flex shrink-0 items-center justify-between gap-2 px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", tone)} />
        <span className="truncate text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <span className={cn("text-2xs font-semibold tabular-nums", tone)}>{count}</span>
    </div>
  );
}

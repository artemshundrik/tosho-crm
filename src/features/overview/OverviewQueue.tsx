import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { EntityAvatar } from "@/components/app/avatar-kit";
import { toneDotClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

import {
  OVERVIEW_LANES,
  OVERVIEW_LANE_LABEL,
  OVERVIEW_LANE_TONE,
  type OverviewQueueItem,
} from "./overviewModel";

/**
 * Черга справ — головний елемент сторінки.
 *
 * ЧОМУ ОДИН СПИСОК, А НЕ ПЛИТКИ ПО МОДУЛЯХ. Людина не питає «що там у
 * дизайні» — вона питає «з чого почати». Стара сторінка розкладала роботу за
 * модулями, тож відповідь на це питання доводилось збирати очима з чотирьох
 * блоків, а прострочене й свіже лежали поруч без різниці.
 *
 * ЧОМУ РЯДОК У ДВА РЯДКИ, А НЕ В ОДИН. На 375px в один рядок не влазять ані
 * заголовок, ані підпис, ані час — щось довелось би ховати, а ховати немає
 * чого: без часу рядок втрачає сенс, без підпису — контекст. Тому розкладка
 * однакова на всіх ширинах: заголовок зверху, мета й час — під ним. Другої
 * гілки розмітки навмисно немає: `md:hidden` тримає в DOM обидві.
 */

const getInitials = (name?: string | null) => {
  const source = name?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

function QueueRow({ item }: { item: OverviewQueueItem }) {
  return (
    <Link
      to={item.to}
      className="group flex min-w-0 items-start gap-2.5 border-t border-border/40 px-3 py-2.5 transition-colors first:border-t-0 hover:bg-muted/40 sm:gap-3 sm:px-5"
    >
      {/* Кант терміновості — та сама мова, що в рядках канбану й нагадувань. */}
      <span
        className={cn("mt-0.5 h-9 w-[3px] shrink-0 rounded-full", toneDotClass[OVERVIEW_LANE_TONE[item.lane]])}
        aria-hidden="true"
      />
      {/* Аватарка лише в рядка про конкретну сутність. У зведеного рядка
          («Прорахунки без відповідального») сутності немає, і літерна заглушка
          «ПР» у кружечку виглядала б як замовник на імʼя «Прорахунки». */}
      {item.entityKey ? (
        <EntityAvatar
          src={item.entityLogoUrl}
          name={item.entityName ?? item.title}
          fallback={getInitials(item.entityName ?? item.title)}
          size={28}
          className="mt-0.5"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium leading-5 text-foreground">{item.title}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
          {/* Чипс нейтральний, а тип позначає крапка. Кольоровий чипс тут уже
              пробували: поруч із кольоровим кантом терміновості й кольоровим
              часом виходило три кольори на рядок, і жоден не читався. */}
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-[2px]", toneDotClass[item.chipTone])} aria-hidden="true" />
            {item.chip}
          </span>
          {item.code ? <span className="figure hidden shrink-0 sm:inline">{item.code}</span> : null}
          <span className="truncate">{item.subtitle}</span>
          <span className={cn("figure ml-auto shrink-0 pl-1 font-medium", toneTextClass[item.whenTone])}>
            {item.when}
          </span>
        </div>
      </div>
      <ArrowRight
        className="mt-2 hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
        aria-hidden="true"
      />
    </Link>
  );
}

function LaneHeader({ lane, count }: { lane: (typeof OVERVIEW_LANES)[number]; count: number }) {
  return (
    <div className="flex items-center gap-2 border-t border-border/40 bg-muted/40 px-3 py-2 first:border-t-0 sm:px-5">
      <span className={cn("h-2 w-2 shrink-0 rounded-[3px]", toneDotClass[OVERVIEW_LANE_TONE[lane]])} aria-hidden="true" />
      <span className="text-2xs font-semibold uppercase tracking-wider text-foreground">
        {OVERVIEW_LANE_LABEL[lane]}
      </span>
      <span className="figure text-2xs text-muted-foreground">{count}</span>
    </div>
  );
}

export function OverviewQueue({
  items,
  total,
  emptyText,
}: {
  items: OverviewQueueItem[];
  /** Скільки справ у черзі насправді — показуємо ми не всі. */
  total: number;
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/50 bg-card px-5 py-10 text-center">
        <div className="text-sm font-medium text-foreground">Порожньо — і це добра новина</div>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-card">
      {OVERVIEW_LANES.map((lane) => {
        const laneItems = items.filter((item) => item.lane === lane);
        if (laneItems.length === 0) return null;
        return (
          <div key={lane}>
            <LaneHeader lane={lane} count={laneItems.length} />
            {laneItems.map((item) => (
              <QueueRow key={item.id} item={item} />
            ))}
          </div>
        );
      })}
      {total > items.length ? (
        // Не «і ще щось»: скільки саме лишилось за кадром, видно числом. Інакше
        // велике число в героєві виглядало б як помилка поруч із коротким списком.
        <div className="border-t border-border/40 px-3 py-2.5 text-2xs text-muted-foreground sm:px-5">
          Показано {items.length} з <span className="figure font-medium text-foreground">{total}</span> — решта в
          розділах
        </div>
      ) : null}
    </div>
  );
}

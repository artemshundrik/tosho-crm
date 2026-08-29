import * as React from "react";

import {
  AnimatedFigure,
  FigureRevealProvider,
  figureRevealTransition,
  useFigureReveal,
  useSharedFigureReveal,
} from "@/components/app/animated-figure";
import { cn } from "@/lib/utils";

/**
 * Примітиви «бенто»-сторінок: картка, герой із великим числом і смуга часток.
 *
 * ЧОМУ ОКРЕМИЙ ФАЙЛ. Смуга з часток та легендою існувала двома незалежними
 * копіями — у «Стеку» (`StackOverview`) і в підсумку «Витрат»
 * (`FinanceBentoSummary`). Копії вже встигли розійтись у дрібницях: у
 * фінансовій легенда клікабельна, у стеківській — ні, а відступи легенди
 * різні (`gap-x-2` проти `gap-x-4`). Огляд став би третьою копією, тож замість
 * неї — один примітив із параметрами.
 *
 * ЩО ТУТ НЕ ЖИВЕ. Кольори сегментів приходять готовими класами
 * (`bg-success-solid`, `bg-warning-solid`, `bg-destructive`), а не тонами:
 * смуга ділить дані за РІЗНИМИ ознаками залежно від сторінки — у «Стеку» за
 * вагою шару, у «Витратах» за сумою, в «Огляді» за терміновістю — і
 * загальної таблиці «ознака → колір» не існує. Вибір лишається за сторінкою.
 */

/** Канонічна поверхня бенто-картки. Тіні немає навмисно — вона лише у спливному. */
export const BENTO_CARD = "rounded-2xl border border-border/40 bg-card";

/** Дрібний капслок над великим числом. */
export const BENTO_LABEL = "text-2xs font-medium uppercase tracking-wide text-muted-foreground";

export type SplitPart = {
  key: string;
  label: string;
  /** Вага сегмента — саме вона ділить смугу. Нуль ховає частку цілком. */
  weight: number;
  /** Число в легенді. Не задано — показуємо вагу як є (штуки). */
  valueText?: string;
  /** Клас заливки з токенів: `bg-success-solid`, `bg-warning-solid`, `bg-destructive`. */
  color: string;
};

/**
 * Смуга з часток + легенда.
 *
 * `minWidth: 6` тримає дрібні частки видимими: без нього частка на 1% зникає
 * у нуль пікселів, і легенда посилається на сегмент, якого не видно.
 */
export function SplitBar({
  parts,
  className,
  onPartClick,
}: {
  parts: SplitPart[];
  className?: string;
  /** Легенда стає кнопками. Без обробника — звичайний текст, як у «Стеку». */
  onPartClick?: (key: string) => void;
}) {
  // Прапорець картки, якщо смуга всередині героя, і власний, якщо ні (REQ-200).
  const ready = useSharedFigureReveal();

  const visible = parts.filter((part) => part.weight > 0);
  if (visible.length === 0) return null;

  const legendItem = (part: SplitPart) => (
    <>
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", part.color)} aria-hidden="true" />
      <span className="text-muted-foreground">{part.label}</span>
      <span className="figure font-medium text-foreground">{part.valueText ?? part.weight}</span>
    </>
  );

  return (
    <div className={className}>
      <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
        {visible.map((part) => (
          <div
            key={part.key}
            className={cn("rounded-[2px]", part.color)}
            // Смуга росте разом із великим числом і тією ж кривою. `minWidth`
            // теж їде з нуля, інакше замість порожньої смуги на старті стояв
            // би ряд шестипіксельних пеньків.
            style={{
              flexGrow: ready ? part.weight : 0,
              flexBasis: 0,
              minWidth: ready ? 6 : 0,
              transition: figureRevealTransition,
            }}
            title={`${part.label} — ${part.valueText ?? part.weight}`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {visible.map((part) =>
          onPartClick ? (
            <button
              key={part.key}
              type="button"
              onClick={() => onPartClick(part.key)}
              title="Перейти до секції"
              className="-mx-1 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-xs hover:bg-muted/50"
            >
              {legendItem(part)}
            </button>
          ) : (
            <span key={part.key} className="inline-flex items-center gap-1.5 py-0.5 text-xs">
              {legendItem(part)}
            </span>
          )
        )}
      </div>
    </div>
  );
}

/**
 * Герой: капслок-підпис, велике число з суфіксом, бейдж праворуч, вміст і
 * приписка внизу за роздільником.
 *
 * Число моноширинне (`figure`) — інакше воно стрибає по ширині при кожному
 * оновленні даних.
 */
export function HeroShell({
  label,
  value,
  suffix,
  badge,
  children,
  footnote,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  footnote?: React.ReactNode;
  className?: string;
}) {
  // Число й смуга під ним рушать від ОДНОГО прапорця: смуга живе в `children`,
  // тож дістає його через контекст (REQ-200).
  const ready = useFigureReveal();

  return (
    <FigureRevealProvider ready={ready}>
      <div className={cn(BENTO_CARD, "p-4 sm:p-5", className)}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <div className={BENTO_LABEL}>{label}</div>
            <div className="figure mt-1.5 flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold leading-none text-foreground sm:text-[28px]">
              {/* Число анімується лише коли воно ЧИСЛО. Вузол може бути й
                  складеним («12 з 40»), і такому крутитись нема чим. */}
              {typeof value === "number" ? (
                <AnimatedFigure value={value} ready={ready} format={{}} />
              ) : (
                value
              )}
              {suffix ? <span className="text-sm font-normal leading-snug text-muted-foreground sm:text-base">{suffix}</span> : null}
            </div>
          </div>
          {badge}
        </div>
        {children}
        {footnote ? (
          <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/40 pt-2.5 text-2xs text-muted-foreground">
            {footnote}
          </div>
        ) : null}
      </div>
    </FigureRevealProvider>
  );
}

/**
 * Один факт у приписці героя: іконка, ЧИСЛО кольором тексту, приглушений підпис.
 *
 * Ієрархія робить усю роботу: спершу видно числа, потім — про що вони. Рівний
 * сірий рядок із восьми речень поспіль читається як абзац, набраний дрібним.
 */
export function BentoFact({
  icon: Icon,
  value,
  label,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  value: React.ReactNode;
  label?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 translate-y-[2px] text-muted-foreground/70" aria-hidden="true" /> : null}
      <span className="figure font-medium text-foreground">{value}</span>
      {label ? <span>{label}</span> : null}
    </span>
  );
}

import { useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneDotClass, toneTextClass, type Tone } from "@/lib/statusTones";

export type MobileStatusColumn<T> = {
  /** Ключ стану — той самий, що в реєстрі дошок (`kanbanBoards.ts`). */
  key: string;
  label: string;
  icon?: ElementType;
  tone?: Tone;
  items: readonly T[];
};

/**
 * Канбан на телефоні — не дошка, а СТАТУСИ Й КАРТКИ (картка 146).
 *
 * НАВІЩО. Горизонтальна дошка на екрані 375px — це прокрутка вбік по колонках
 * шириною 300px: на беклозі заміряно 1596px вмісту в 376px вікна. Гортати
 * вбік, щоб побачити наступний статус, і вниз, щоб побачити картки, — два
 * різні жести на одній поверхні, і жоден не працює впевнено.
 *
 * ЩО ЗАМІСТЬ. Ряд чипів статусів із лічильниками (гортається вбік — але це
 * маленька смуга, а не весь екран) і звичайний вертикальний список карток
 * обраного статусу. Один жест на кожну вісь.
 *
 * ПОБІЧНА ВИГОДА — вузли. Стос усіх колонок поспіль (як було на дизайні)
 * тримає в DOM усі картки всіх статусів; тут живе рівно один статус. Це та
 * сама економія, що дала 8167 → 2068 вузлів на дошках ([[project_hidden_mobile_branch]]).
 */
export function MobileStatusBoard<T>({
  columns,
  renderCard,
  getItemKey,
  emptyLabel = "Тут поки порожньо",
  className,
}: {
  columns: readonly MobileStatusColumn<T>[];
  renderCard: (item: T) => ReactNode;
  getItemKey: (item: T) => string;
  emptyLabel?: string;
  className?: string;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  /**
   * Активний статус: обраний людиною, інакше перший НЕПОРОЖНІЙ.
   *
   * Перший непорожній, а не просто перший: відкривати дошку на порожній
   * колонці — це показати людині «нічого немає» там, де насправді все є.
   */
  const resolvedKey = useMemo(() => {
    if (activeKey && columns.some((column) => column.key === activeKey)) return activeKey;
    return (columns.find((column) => column.items.length > 0) ?? columns[0])?.key ?? null;
  }, [activeKey, columns]);

  const active = columns.find((column) => column.key === resolvedKey) ?? null;

  // Обраний чип має бути видимим: після зміни фільтра він може опинитись за
  // краєм смуги, і тоді здається, що нічого не вибрано.
  useEffect(() => {
    if (!resolvedKey) return;
    chipRefs.current[resolvedKey]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [resolvedKey]);

  if (!columns.length) return null;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* Смуга статусів. Прокрутка живе всередині неї (overscroll-contain),
          тож сторінка вбік не їде. */}
      <div
        role="tablist"
        aria-label="Статуси"
        className="-mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {columns.map((column) => {
          const Icon = column.icon;
          const isActive = column.key === resolvedKey;
          return (
            <button
              key={column.key}
              ref={(el) => {
                chipRefs.current[column.key] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveKey(column.key)}
              // h-11 = 44px: мінімальний тач-таргет; touch-manipulation прибирає
              // 300ms затримку тапу.
              className={cn(
                "flex h-11 shrink-0 touch-manipulation items-center gap-2 rounded-full border px-3.5 text-sm font-medium",
                "transition-colors duration-150 ease-out",
                isActive
                  ? "border-foreground/10 bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              {Icon ? (
                <Icon className={cn("h-4 w-4 shrink-0", !isActive && column.tone ? toneTextClass[column.tone] : undefined)} />
              ) : column.tone ? (
                <span className={cn("h-2 w-2 shrink-0 rounded-full", toneDotClass[column.tone])} />
              ) : null}
              <span className="whitespace-nowrap">{column.label}</span>
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-2xs font-semibold leading-5 tabular-nums",
                  isActive ? "bg-background/20 text-background" : "bg-muted text-muted-foreground"
                )}
              >
                {column.items.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Картки лише активного статусу. */}
      <div className="flex min-h-0 flex-col gap-2">
        {active && active.items.length > 0 ? (
          active.items.map((item) => <div key={getItemKey(item)}>{renderCard(item)}</div>)
        ) : (
          <p className="rounded-inner border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        )}
      </div>
    </div>
  );
}

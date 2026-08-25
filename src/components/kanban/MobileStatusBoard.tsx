import { useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneDotClass, toneTextClass, type Tone } from "@/lib/statusTones";
import { MOBILE_CARD_LIST, MOBILE_CHIPS_ROW } from "@/layout/mobileRhythm";

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
export type MobileStatusChip = {
  key: string;
  label: string;
  icon?: ElementType;
  tone?: Tone;
  /** Без лічильника чип рендериться самою назвою — не всі вкладки їх мають. */
  count?: number;
};

/**
 * Смуга статусів — окремо від дошки, бо потрібна й спискам.
 *
 * У канбані вона перемикає видиму колонку, у списку — фільтр статусу. Для
 * людини це одне й те саме питання «покажи мені ось цей статус», тож і
 * виглядати воно мусить однаково.
 */
export function MobileStatusChips({
  chips,
  activeKey,
  onSelect,
  className,
}: {
  chips: readonly MobileStatusChip[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Обраний чип має бути видимим: після зміни фільтра він може опинитись за
  // краєм смуги, і тоді здається, що нічого не вибрано.
  useEffect(() => {
    if (!activeKey) return;
    refs.current[activeKey]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeKey]);

  return (
    <div
      role="tablist"
      aria-label="Статуси"
      className={cn(
        // -mx-4/px-4: смуга гортається від краю до краю, а перший і останній
        // чипи стоять на тій самій вертикалі, що й пошук та картки.
        "-mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {chips.map((chip) => {
        const Icon = chip.icon;
        const isActive = chip.key === activeKey;
        return (
          <button
            key={chip.key}
            ref={(el) => {
              refs.current[chip.key] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(chip.key)}
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
              <Icon className={cn("h-4 w-4 shrink-0", !isActive && chip.tone ? toneTextClass[chip.tone] : undefined)} />
            ) : chip.tone ? (
              <span className={cn("h-2 w-2 shrink-0 rounded-full", toneDotClass[chip.tone])} />
            ) : null}
            <span className="whitespace-nowrap">{chip.label}</span>
            {chip.count === undefined ? null : (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-2xs font-semibold leading-5 tabular-nums",
                  isActive ? "bg-background/20 text-background" : "bg-muted text-muted-foreground"
                )}
              >
                {chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

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

  if (!columns.length) return null;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <MobileStatusChips
        chips={columns.map((column) => ({
          key: column.key,
          label: column.label,
          icon: column.icon,
          tone: column.tone,
          count: column.items.length,
        }))}
        activeKey={resolvedKey}
        onSelect={setActiveKey}
        className={MOBILE_CHIPS_ROW}
      />

      {/* Картки лише активного статусу. */}
      <div className={cn("flex min-h-0 flex-col", MOBILE_CARD_LIST)}>
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

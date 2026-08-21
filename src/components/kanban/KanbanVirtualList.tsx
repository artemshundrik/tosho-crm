import { useCallback, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

/**
 * Малює лише ті картки колонки, які видно, плюс невеликий запас.
 *
 * НАВІЩО. На дошці дизайну 21.08.2026 було 578 задач і 57 373 вузли DOM —
 * учетверо більше, ніж коли писали REQ-24. Компілятор прибирав із гальм лише
 * 9%: вузьке місце не в мемоізації, а в тому, що браузер тримає й переміряє
 * все дерево цілком.
 *
 * ЧОМУ ОКРЕМИЙ КОМПОНЕНТ, А НЕ ВСЕРЕДИНІ KanbanColumn. Колонка лишається
 * простою: заголовок, тіло, події перетягування. Віртуалізація потрібна не
 * всім дошкам — на беклозі 28 карток і нуль гальм.
 *
 * ПРО МАКЕТ. Картки різної висоти: у когось три товари, у когось жодного.
 * Тому висоти не задаються, а міряються. І саме тому картки НЕ позиціонуються
 * кожна окремо: перша спроба ставила кожну в `absolute` з власним `translateY`,
 * і картки наїжджали одна на одну на 47–67 пікселів — виміряна висота 243
 * проти кроку 176, узятого з першого наближення. Замість цього зсувається
 * ОДИН внутрішній контейнер, а всередині картки лежать звичайним потоком:
 * тоді неточність оцінки дає щонайбільше дрібний зсув прокрутки, який
 * віртуалізатор сам виправляє наступним кадром, і накластись вони не можуть
 * фізично.
 */
type KanbanVirtualListProps<T> = {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /**
   * Перше наближення висоти картки, поки її не виміряли.
   *
   * Не косметика: чим гірша оцінка, тим більше віртуалізатор переміряє й
   * перемальовує. З оцінкою 168 при справжніх ~240 відкриття дошки давало
   * 2.3 с блокування замість 0.5 с без віртуалізації — увесь виграш з'їдала
   * буря перерахунків.
   */
  estimateSize?: number;
  /** Відступ між картками. Замінює space-y на тілі колонки. */
  gap?: number;
  /**
   * Скільки карток тримати поза екраном з кожного боку. Шість — компроміс:
   * менше дає порожні місця під час швидкої прокрутки, більше з'їдає виграш.
   * Запас важливий і для перетягування: картка, яку тягнуть, не має зникати
   * з дерева, щойно виїхала за край.
   */
  overscan?: number;
};

export function KanbanVirtualList<T>({
  items,
  getKey,
  renderItem,
  estimateSize = 240,
  gap = 8,
  overscan = 6,
}: KanbanVirtualListProps<T>) {
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  // Прокручується не цей список, а тіло колонки — воно на рівень вище.
  // Шукаємо його через callback-ref, а НЕ через useEffect із setState:
  // синхронний setState в ефекті — це зайвий прохід рендеру на кожну колонку
  // (і саме те, за що свариться лінт компілятора).
  const anchorRef = useCallback((node: HTMLDivElement | null) => {
    setScrollElement(node?.closest<HTMLElement>("[data-kanban-column-body='true']") ?? null);
  }, []);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimateSize,
    overscan,
    gap,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={anchorRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      <div
        className="absolute left-0 top-0 flex w-full flex-col"
        style={{
          gap: `${gap}px`,
          transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          if (item === undefined) return null;
          return (
            <div
              key={getKey(item, virtualItem.index)}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

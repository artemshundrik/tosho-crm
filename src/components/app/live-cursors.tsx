import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * КУРСОРИ КОЛЕГ — ШАР ПОВЕРХ СТОРІНКИ (REQ-163, поки що показ).
 *
 * ЩО ЦЕ. Те саме, що у Фігмі: по сторінці їздять стрілки колег, кожна у своєму
 * кольорі й з підписом. Присутність перестає бути іконкою ока в кутку й стає
 * тим, що видно краєм ока.
 *
 * РУХ ЖИВЕ В DOM, А НЕ В СТАНІ REACT. Координати міняються десятки разів на
 * секунду, і якби вони лежали в `useState`, кожен рух чужої миші перемальовував
 * би сторінку цілком. Той самий висновок, що й у перетягуванні карток
 * (kanbanDrag.tsx): React відповідає за те, ХТО на сторінці, а куди саме
 * показує стрілка — пишеться прямо в стиль вузла.
 *
 * ЧОМУ ПЛАВНІСТЬ РОБИТЬ ПРИЙМАЧ, А НЕ ВІДПРАВНИК. Слати по кадру на кожен рух
 * миші — і дорого, і зайво. Відправник шле рідше (десяток разів на секунду), а
 * приймач домальовує проміжок переходом: на око різниці немає, а повідомлень
 * удесятеро менше. Це стандартний розмін у всіх спільних редакторах.
 *
 * ЩО ТУТ ЩЕ НЕ ВИРІШЕНО — і чому файл поки лише про вигляд:
 * координати треба міряти не від вікна, а від ВМІСТУ (дошка їздить убік, у
 * людей різні екрани й масштаб), інакше чужа стрілка показуватиме не на ту
 * картку. Це вирішується разом із вибором частоти — див. картку REQ-163.
 */

/** Кольори беремо з тонів аватарок: у людини стрілка того ж кольору, що й вона сама. */
const CURSOR_TONES = 6;

export type LiveCursor = {
  /** Стабільний ключ людини. */
  id: string;
  name: string;
  x: number;
  y: number;
};

/** Той самий розподіл, що в аватарках: одна людина — завжди один колір. */
export function cursorTone(seed: string): number {
  const normalized = seed.trim().toLowerCase();
  if (!normalized) return 1;
  const hash = Array.from(normalized).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return (hash % CURSOR_TONES) + 1;
}

type LiveCursorsProps = {
  cursors: LiveCursor[];
  className?: string;
};

export function LiveCursors({ cursors, className }: LiveCursorsProps) {
  const nodes = useRef(new Map<string, HTMLDivElement>());

  // Позиції ставимо в стиль напряму — щоб рух не проходив через рендер.
  useEffect(() => {
    cursors.forEach((cursor) => {
      const node = nodes.current.get(cursor.id);
      if (node) node.style.transform = `translate3d(${cursor.x}px, ${cursor.y}px, 0)`;
    });
  }, [cursors]);

  return (
    <div
      aria-hidden
      className={cn(
        // Шар нічого не ловить: курсор колеги — це картинка, а не перешкода.
        "pointer-events-none fixed inset-0 z-40 overflow-hidden",
        className
      )}
    >
      {cursors.map((cursor) => {
        const tone = cursorTone(cursor.id);
        return (
          <div
            key={cursor.id}
            ref={(node) => {
              if (node) nodes.current.set(cursor.id, node);
              else nodes.current.delete(cursor.id);
            }}
            className="absolute left-0 top-0 will-change-transform"
            style={{
              transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
              // Перехід — це і є домальовування проміжку між рідкими
              // повідомленнями. Лінійний навмисно: будь-яке пом'якшення на
              // безперервному русі читається як гальмування.
              transition: "transform 90ms linear",
              color: `hsl(var(--entity-avatar-${tone}-fg))`,
            }}
          >
            <svg width="20" height="22" viewBox="0 0 20 22" fill="none" className="drop-shadow-sm">
              <path
                d="M2 1.5 17.5 11 10.5 12.2 7.2 19z"
                fill="currentColor"
                stroke="hsl(var(--background))"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="ml-3.5 -mt-1 inline-block max-w-[160px] truncate rounded-md px-1.5 py-0.5 text-2xs font-medium text-white"
              style={{ backgroundColor: "currentColor" }}
            >
              <span className="text-white mix-blend-normal">{cursor.name}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

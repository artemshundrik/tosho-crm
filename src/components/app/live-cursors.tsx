import { useEffect, useRef } from "react";

import { AvatarBase } from "@/components/app/avatar-kit";
import { cn } from "@/lib/utils";

/**
 * КУРСОРИ КОЛЕГ — ШАР ПОВЕРХ СТОРІНКИ (REQ-163).
 *
 * ЩО ЦЕ. Те саме, що у Фігмі: по сторінці їздять стрілки колег, кожна у своєму
 * кольорі, і поруч зі стрілкою — сама людина. Присутність перестає бути іконкою
 * ока в кутку й стає тим, що видно краєм ока.
 *
 * ЧОМУ АВАТАР, А НЕ ПІДПИС ІМЕНЕМ. Перший захід малював плашку з іменем, і в
 * ній була помилка, яку добре видно на екрані: фон плашки брався з
 * `currentColor`, а клас поруч робив колір білим — тобто фон виходив білий по
 * білому. Але навіть без помилки плашка гірша: імена різної довжини смикають
 * ширину при кожному русі, а обличчя впізнається швидше за текст. Тому тут
 * аватар — у кольоровій обводці свого курсора, з білою межею й тінню, щоб він
 * читався на будь-якому фоні: і на картці, і на порожній колонці.
 *
 * РУХ ЖИВЕ В DOM, А НЕ В СТАНІ REACT. Координати міняються десятки разів на
 * секунду, і якби вони лежали в `useState`, кожен рух чужої миші перемальовував
 * би сторінку цілком. Той самий висновок, що й у перетягуванні карток
 * (kanbanDrag.tsx): React відповідає за те, ХТО на сторінці, а куди саме
 * показує стрілка — пишеться прямо в стиль вузла.
 *
 * ЧОМУ ПЛАВНІСТЬ РОБИТЬ ПРИЙМАЧ, А НЕ ВІДПРАВНИК. Слати по кадру на кожен рух
 * миші — і дорого, і зайво. Відправник шле рідко — і тим рідше, чим більше
 * людей на сторінці, — а приймач домальовує проміжок переходом: на око різниці
 * немає, а повідомлень у рази менше. Це стандартний розмін у всіх спільних
 * редакторах. Тривалість переходу приходить ЗЗОВНІ й мусить перекривати крок
 * відправки: інакше стрілка доїжджає, спиняється й смикається далі.
 */

/** Кольори беремо з тонів аватарок: у людини стрілка того ж кольору, що й вона сама. */
const CURSOR_TONES = 6;

export type LiveCursor = {
  /** Стабільний ключ людини. */
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Координати у вікні, у пікселях. */
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
  /** Скільки триває домальовування проміжку між двома повідомленнями. */
  transitionMs?: number;
  className?: string;
};

export function LiveCursors({ cursors, transitionMs = 180, className }: LiveCursorsProps) {
  const nodes = useRef(new Map<string, HTMLDivElement>());

  // Позиції ставимо в стиль напряму — щоб рух не проходив через рендер.
  useEffect(() => {
    cursors.forEach((cursor) => {
      const node = nodes.current.get(cursor.id);
      if (node) node.style.transform = `translate3d(${cursor.x}px, ${cursor.y}px, 0)`;
    });
  }, [cursors]);

  if (cursors.length === 0) return null;

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
        const color = `hsl(var(--entity-avatar-${tone}-fg))`;
        return (
          <div
            key={cursor.id}
            ref={(node) => {
              if (node) nodes.current.set(cursor.id, node);
              else nodes.current.delete(cursor.id);
            }}
            className="absolute left-0 top-0 flex items-start will-change-transform"
            style={{
              transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
              // Перехід — це і є домальовування проміжку між рідкими
              // повідомленнями. Лінійний навмисно: будь-яке пом'якшення на
              // безперервному русі читається як гальмування.
              transition: `transform ${transitionMs}ms linear`,
            }}
          >
            {/* Біла обводка на стрілці — щоб вона не губилась на картці свого ж кольору. */}
            <svg width="20" height="22" viewBox="0 0 20 22" fill="none" className="shrink-0">
              <path
                d="M2 1.5 17.5 11 10.5 12.2 7.2 19z"
                fill={color}
                stroke="#fff"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="-ml-0.5 mt-3 inline-flex rounded-full bg-white p-[2px] shadow-[0_2px_8px_-2px_rgb(0_0_0/0.45)]"
              style={{ boxShadow: `0 0 0 2px ${color}, 0 2px 8px -2px rgb(0 0 0 / 0.45)` }}
            >
              <AvatarBase
                src={cursor.avatarUrl ?? null}
                name={cursor.name}
                fallback={cursor.name.slice(0, 2).toUpperCase()}
                size={24}
                className="border-0"
                fallbackClassName="text-3xs font-semibold"
                showStatusIndicator={false}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

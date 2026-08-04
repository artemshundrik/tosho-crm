import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Сегментований перемикач із ковзною плашкою.
 *
 * Обгортка НАД наявною розміткою, а не заміна їй: діти лишаються тими самими
 * кнопками (`variant="segmented"` з `aria-pressed`) або тригерами Radix
 * (`data-state="active" | "on"`). Тому 40+ місць у застосунку отримують
 * анімацію, не переписуючись — міняється лише `<div className={SEGMENTED_GROUP}>`
 * на `<SegmentedGroup>`.
 *
 * Активний фон малює саме плашка, а не кнопка: клас `segmented-slider` гасить
 * власний фон/тінь активного тригера (див. index.css). Поза цією обгорткою
 * кнопки виглядають як раніше — старий вигляд нічого не втрачає.
 *
 * Обидва механізми стану підтримані навмисно: `aria-pressed` у наших кнопок і
 * `data-state` у Radix. Один селектор на два світи дешевший за дві обгортки.
 *
 * ОДНА ГРУПА = ОДИН ПЕРЕМИКАЧ. Плашка тут одна, тож два незалежні набори в
 * спільному контейнері не працюють: підсвітку забере перший активний, а
 * другий лишиться зовсім без неї — його ж власний фон погашено. Якщо поруч
 * потрібні два перемикачі (вкладки + вид показу), робіть дві сусідні групи.
 */

const ACTIVE_SELECTOR = '[aria-pressed="true"],[data-state="active"],[data-state="on"]';

type Rect = { left: number; width: number; height: number; top: number };

/**
 * Механіка ковзання окремо від розмітки — щоб її можна було вдягнути і на
 * `TabsList` Radix, який власним `div` не є й обгортку всередину не пустить.
 */
export function useSegmentedSlider<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  // Перший вимір не анімуємо: плашка мусить з'явитись одразу під активним
  // елементом, а не приїхати з лівого краю на завантаженні сторінки. Це
  // САМЕ стан, а не ref: значення читається під час рендера, і ref тут
  // порушував би правила React (lint react-hooks/refs).
  const [animated, setAnimated] = React.useState(false);

  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      const all = node.querySelectorAll<HTMLElement>(ACTIVE_SELECTOR);
      if (import.meta.env.DEV && all.length > 1) {
        // Мовчазна поломка виглядала б як «кнопка не підсвічується», а не як
        // помилка розмітки — тому кажемо прямо.
        console.warn(
          "[SegmentedGroup] у групі кілька активних тригерів — плашка одна. " +
            "Розділіть на дві сусідні групи."
        );
      }
      const active = all[0] ?? null;
      if (!active) {
        setRect(null);
        setAnimated(false);
        return;
      }
      setRect({
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      });
    };

    measure();

    // Стан міняється атрибутом, а не перемонтуванням, тож потрібен саме
    // спостерігач: React про клік по сусідній кнопці нам не повідомить.
    const mutation = new MutationObserver(measure);
    mutation.observe(node, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-pressed", "data-state", "class"],
      childList: true,
    });

    // Ширина тригерів пливе від тексту (лічильники «12» → «7») і від
    // ресайзу вікна — без цього плашка лишалась би старого розміру.
    const resize = new ResizeObserver(measure);
    resize.observe(node);
    node.querySelectorAll<HTMLElement>("button,a,[role='tab']").forEach((child) => resize.observe(child));

    return () => {
      mutation.disconnect();
      resize.disconnect();
    };
    // Порожній масив свідомо: спостерігачі вже ловлять і зміну стану, і
    // появу/зникнення тригерів (childList), тож перепідписка на кожен рендер
    // лише плодила б роботу.
  }, []);

  React.useEffect(() => {
    // Вмикаємо перехід ПІСЛЯ того, як плашка вже стала на місце.
    if (rect) setAnimated(true);
  }, [rect]);

  const indicator = rect ? (
    <span
      aria-hidden
      data-segmented-indicator=""
      className={cn(
        "pointer-events-none absolute z-0 rounded-lg border border-border bg-background shadow-sm",
        animated && "transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
      )}
      style={{
        transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
        width: rect.width,
        height: rect.height,
        left: 0,
        top: 0,
      }}
    />
  ) : null;

  return { ref, indicator };
}

export function SegmentedGroup({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { ref, indicator } = useSegmentedSlider<HTMLDivElement>();

  return (
    <div ref={ref} className={cn("segmented-slider relative", className)} {...props}>
      {indicator}
      {children}
    </div>
  );
}

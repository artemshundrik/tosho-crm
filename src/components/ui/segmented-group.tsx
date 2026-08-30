import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Сегментований перемикач із ковзною плашкою.
 *
 * ПЛАШКУ НЕ МОЖНА ВІДДАВАТИ View Transitions — перевірено на собі 29.08.2026.
 * Спокуса зрозуміла: дати їй `view-transition-name`, і браузер сам розведе два
 * положення рухом. Але тоді вона виїжджає з загального знімка сторінки в
 * ОКРЕМИЙ шар, а названі шари малюються ПОВЕРХ кореневого — тобто поверх
 * підписів кнопок. Плашка світла, підписи опиняються під нею, і перехід
 * виглядає так, ніби назва, на яку переходиш, блимає білим. Шар під корінь не
 * сховаєш: корінь непрозорий, і плашка просто зникне.
 *
 * Тому плашка їде звичайним `transition` по `transform` і лишається ВСЕРЕДИНІ
 * знімка. Наслідок, з яким миримось свідомо: під перехресним згасанням цілої
 * сторінки її руху не видно (на екрані два нерухомі кадри). Отже сторінки із
 * сегментованим перемикачем таким згасанням НЕ обгортаються — там працює сама
 * плашка, і цього досить.
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
export type SliderVariant = "pill" | "underline";

export function useSegmentedSlider<T extends HTMLElement>(variant: SliderVariant = "pill") {
  /**
   * Вузол тримається в СТАНІ, а посилання на нього — callback-ref.
   *
   * Звичайний `useRef` тут мовчки не працює на сторінках, де ряд кнопок
   * з'являється не з першим рендером (картка прорахунку показує спершу
   * каркас). Layout-ефект зі списком залежностей `[]` відпрацьовує один раз,
   * бачить `ref.current === null`, виходить — і більше не повертається ніколи.
   * Збоку це виглядає як «індикатора просто немає»: розмітка ціла, активна
   * кнопка на місці, а підсвітки нема й нізвідки взятись.
   *
   * Callback-ref спрацьовує саме тоді, коли вузол справді приєднався, і
   * оновлює стан — ефект перезапускається вже з живим вузлом. Заразом це
   * закриває й зворотний випадок: вузол ЗАМІНИЛИ (каркас на справжню смугу),
   * і спостерігачі мусять переїхати на новий, а не тримати від'єднаний.
   */
  const [node, setNode] = React.useState<T | null>(null);
  const ref = React.useCallback((next: T | null) => setNode(next), []);

  const [rect, setRect] = React.useState<Rect | null>(null);
  // Перший вимір не анімуємо: плашка мусить з'явитись одразу під активним
  // елементом, а не приїхати з лівого краю на завантаженні сторінки. Це
  // САМЕ стан, а не ref: значення читається під час рендера, і ref тут
  // порушував би правила React (lint react-hooks/refs).
  const [animated, setAnimated] = React.useState(false);

  React.useLayoutEffect(() => {
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
      const next = {
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      };


      setRect(next);
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
    // Залежність одна — сам вузол. Спостерігачі вже ловлять і зміну стану, і
    // появу/зникнення тригерів (childList), тож перепідписуватись на кожен
    // рендер немає потреби; а от на ЗАМІНУ вузла — обов'язково.
  }, [node]);

  React.useEffect(() => {
    // Вмикаємо перехід ПІСЛЯ того, як плашка вже стала на місце.
    if (rect) setAnimated(true);
  }, [rect]);

  /**
   * Два види однієї механіки: плашка під активною кнопкою й риска під активною
   * вкладкою. Спільне в них головне — положення міряється по тому самому
   * активному тригеру, тож смуга вкладок отримує ковзання, не переписуючись.
   *
   * Риска БЕЗ рамки й фону і рахує свою ширину з відступом: підкреслення на всю
   * ширину кнопки разом із її падінгами читається як підкреслений абзац, а не
   * як мітка вкладки.
   */
  const underline = variant === "underline";
  const inset = underline ? 8 : 0;

  const indicator = rect ? (
    <span
      aria-hidden
      data-segmented-indicator=""
      className={cn(
        "pointer-events-none absolute",
        underline
          ? // Риска вкладки — кольором ТЕКСТУ, а не бренду (REQ-175#p44): чорна
            // у світлій темі, біла в темній. Синій у цьому інтерфейсі означає
            // дію або посилання, а активна вкладка — не дія, а місце, де ти
            // зараз стоїш.
            "bottom-0 z-base h-0.5 rounded-full bg-foreground"
          : "z-0 rounded-lg border border-border bg-background",
        animated &&
          (underline
            ? "transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
            : "transition-[transform,width,height] duration-200 ease-out motion-reduce:transition-none")
      )}
      style={
        underline
          ? {
              transform: `translate3d(${rect.left + inset}px, 0, 0)`,
              width: Math.max(rect.width - inset * 2, 0),
              left: 0,
            }
          : {
              transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
              width: rect.width,
              height: rect.height,
              left: 0,
              top: 0,
            }
      }
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

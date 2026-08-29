import { useEffect, type RefObject } from "react";

/**
 * Згасання країв прокрутки: край показується лише тоді, коли за ним щось є.
 *
 * Малює згасання CSS (`.edge-fade-y` / `.edge-fade-x` в index.css) — тут лише
 * рішення, ЧИ показувати кожен край. Хук пише дві змінні в стиль вузла:
 * `--edge-fade-start` (початок осі: верх або лівий край) і `--edge-fade-end`.
 *
 * ЧОМУ НЕ СТАН REACT. Прокрутка колонки канбану — це десятки подій на секунду,
 * і стан перерендерював би весь список карток на кожній. Тут же взагалі не
 * потрібен рендер: змінюється лише одна властивість оформлення, і записати її
 * в `node.style` дешевше на порядки. React про це знати не мусить — розмітка
 * від згасання не залежить.
 *
 * ЧОМУ ЛИШЕ ДВА ЗНАЧЕННЯ, А НЕ ПОТОЧНИЙ ЗСУВ. Край або є, або його немає:
 * проміжних станів картка не просила, а плавність між ними дає `transition` у
 * CSS. Тому запис у стиль трапляється не на кожному кадрі прокрутки, а рівно
 * двічі за весь рух — коли список зрушив з початку й коли доїхав до кінця.
 * Порівняння з попереднім значенням тут не мікрооптимізація: без нього кожен
 * кадр чіпав би inline-стиль і скидав перехід, який сам же й запустив.
 *
 * ЩО СТЕЖИТЬ ЗА ЗМІНАМИ. Трьох джерел досить і кожне закриває свій випадок:
 * `scroll` — рух пальцем чи колесом; `ResizeObserver` — зміна висоти самої
 * колонки (згорнули сайдбар, повернули телефон); `MutationObserver` — приїзд
 * або від'їзд карток, від якого міняється `scrollHeight`, а розмір вузла ні.
 * Без останнього колонка, у яку перетягнули картку, лишалась би без нижнього
 * згасання до першого дотику.
 */

/** Глибина згасання береться з CSS (`--edge-fade-depth`) — тут лише вимикач. */
const NO_FADE = "0px";
const FADE = "var(--edge-fade-depth)";

/**
 * Один піксель допуску. Дробові висоти після масштабування сторінки дають
 * `scrollTop + clientHeight` на 0.5 px менший за `scrollHeight` навіть коли
 * список докручено до самого низу — і нижній край згасав би вічно.
 */
const EDGE_EPSILON = 1;

export type EdgeFadeAxis = "y" | "x";

/** Обчислення окремо від DOM — щоб межові випадки закривались юнітом. */
export function edgeFadeState(
  { offset, viewport, content }: { offset: number; viewport: number; content: number },
  epsilon: number = EDGE_EPSILON
): { start: boolean; end: boolean } {
  // Нічого прокручувати — обидва краї гасимо. Інакше короткий список у високій
  // колонці отримав би згасання знизу «про запас», обіцяючи неіснуючі картки.
  if (content <= viewport + epsilon) return { start: false, end: false };
  return {
    start: offset > epsilon,
    end: offset + viewport < content - epsilon,
  };
}

/**
 * Вузол приходить готовим `ref`, а не заводиться тут: майже всі прокрутки, яким
 * потрібне згасання, вже мають власний `ref` під інші потреби (дошка — під
 * колесо миші, колонка — під автопрокрутку при перетягуванні). Хук, що віддає
 * СВІЙ ref, змушував би їх зшивати два — а це рівно те місце, де ref мовчки
 * губиться при перемонтуванні.
 */
export function useEdgeFade<T extends HTMLElement>(
  ref: RefObject<T | null>,
  axis: EdgeFadeAxis = "y",
  enabled: boolean = true
): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!enabled) {
      node.style.removeProperty("--edge-fade-start");
      node.style.removeProperty("--edge-fade-end");
      return;
    }

    // `null` — «ще не міряли»: перший замір мусить записати обидва краї, навіть
    // якщо обидва вимкнені, бо в стилі вузла їх поки немає взагалі.
    let prevStart: boolean | null = null;
    let prevEnd: boolean | null = null;

    const sync = () => {
      const next = edgeFadeState(
        axis === "y"
          ? { offset: node.scrollTop, viewport: node.clientHeight, content: node.scrollHeight }
          : { offset: node.scrollLeft, viewport: node.clientWidth, content: node.scrollWidth }
      );

      if (next.start !== prevStart) {
        prevStart = next.start;
        node.style.setProperty("--edge-fade-start", next.start ? FADE : NO_FADE);
      }
      if (next.end !== prevEnd) {
        prevEnd = next.end;
        node.style.setProperty("--edge-fade-end", next.end ? FADE : NO_FADE);
      }
    };

    sync();

    node.addEventListener("scroll", sync, { passive: true });
    const resize = new ResizeObserver(sync);
    resize.observe(node);
    const mutation = new MutationObserver(sync);
    mutation.observe(node, { childList: true, subtree: true });

    return () => {
      node.removeEventListener("scroll", sync);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [ref, axis, enabled]);
}

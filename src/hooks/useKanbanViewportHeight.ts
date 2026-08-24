import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Висота вікна канбан-дошки: «від його верху до низу екрана».
 *
 * ЧОМУ ЦЕ СПІЛЬНИЙ МОДУЛЬ. Дошки дизайну й прорахунків мали дослівно однакові
 * вісімдесят рядків цього вимірювання, і кожна пастка нижче лікувалась двічі.
 *
 * ТРИ ПАСТКИ, ЩО ТУТ ЗАКРИТІ (усі заміряні 24.08.2026, картка 136):
 *
 * 1. СТАРИЙ ВУЗОЛ. Каркас і сама дошка — РІЗНІ елементи, і `ref` при заміні
 *    переїжджає з одного на інший. Ефект із залежностями лише за режимом і
 *    кількістю рядків тримав відчеплений вузол, а в такого
 *    `getBoundingClientRect()` віддає нулі: висота виходила 974 замість 797,
 *    і дошка стирчала на 165 px за нижній край екрана 2.5 секунди. Тому
 *    `skeletonShown` — обов'язкова залежність, а сам замір мовчки виходить
 *    для від'єднаного вузла.
 *
 * 2. СМУГА ДІЙ ПРИЇЖДЖАЄ ПІЗНІШЕ. Сторінка віддає кнопки в шапку ефектом, тож
 *    після першого заміру `rect.top` ще зростає. ResizeObserver цього не ловить:
 *    у вікна не міняється ні власний розмір, ні розмір батька — лише ПОЗИЦІЯ.
 *    Тому перші пів секунди стежимо за `rect.top` покадрово.
 *
 * 3. ПРОМІЖНА ВЕРСТКА. Синхронний замір усередині layout-ефекту іноді ловить
 *    несталу верстку. Тому результат перевіряється на наступному кадрі: якщо
 *    низ дошки опинився за межами вікна — міряємо ще раз, до трьох спроб.
 */
export function useKanbanViewportHeight(
  viewportRef: RefObject<HTMLElement | null>,
  { enabled, skeletonShown, itemCount }: { enabled: boolean; skeletonShown: boolean; itemCount: number }
) {
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    let frameId = 0;
    let verifyFrame = 0;
    let verifyLeft = 0;

    const measure = () => {
      frameId = 0;
      if (!viewport.isConnected) return;
      const rect = viewport.getBoundingClientRect();
      const next = Math.max(320, Math.floor(window.innerHeight - rect.top - 12));
      setHeight((current) => (current === next ? current : next));
      if (verifyLeft <= 0) verifyLeft = 3;
      if (verifyFrame) window.cancelAnimationFrame(verifyFrame);
      verifyFrame = window.requestAnimationFrame(() => {
        verifyFrame = 0;
        verifyLeft -= 1;
        const after = viewport.getBoundingClientRect();
        if (after.bottom > window.innerHeight + 1 && verifyLeft > 0) measure();
        else verifyLeft = 0;
      });
    };

    const scheduleMeasure = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    // Синхронно до першого кадру — щоб каркас одразу мав кінцеву висоту, — і
    // одразу перевірка на наступному кадрі (пастка 3).
    measure();
    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleMeasure) : null;
    resizeObserver?.observe(viewport);
    if (viewport.parentElement) resizeObserver?.observe(viewport.parentElement);

    // Пастка 2: стежимо за позицією, а не за розміром.
    let settleFrame = 0;
    const settleUntil = performance.now() + 500;
    let lastTop = viewport.getBoundingClientRect().top;
    const settle = () => {
      const top = viewport.getBoundingClientRect().top;
      if (top !== lastTop) {
        lastTop = top;
        measure();
      }
      if (performance.now() < settleUntil) settleFrame = window.requestAnimationFrame(settle);
      else settleFrame = 0;
    };
    settleFrame = window.requestAnimationFrame(settle);

    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      if (frameId) window.cancelAnimationFrame(frameId);
      if (settleFrame) window.cancelAnimationFrame(settleFrame);
      if (verifyFrame) window.cancelAnimationFrame(verifyFrame);
      resizeObserver?.disconnect();
    };
  }, [enabled, skeletonShown, itemCount, viewportRef]);

  return height;
}

import { useSyncExternalStore } from "react";

/**
 * Чи вікно вужче за десктопну межу Tailwind (`md`, 768 px).
 *
 * НАВІЩО. На дошках дизайну й прорахунків мобільний і десктопний вигляди
 * писались одним деревом, а розрізнялись класами `md:hidden` / `hidden md:block`.
 * Браузер ховає невидиму гілку, але React її БУДУЄ Й КОМІТИТЬ: мобільний список
 * малює всі картки поспіль, без віртуалізації, яка є в десктопній колонці.
 *
 * Заміряно 24.08.2026 на дев-сервері: відкриття дошки дизайну зі 123 задачами
 * давало дев'ять підряд `[Violation] 'message' handler took ~690 ms` — це коміт
 * React, а він, на відміну від рендера, НЕ переривається ні transition, ні
 * пріоритетами. Тобто вся боротьба за плавність упиралась у дерево, половина
 * якого ніколи не показується.
 *
 * ЧОМУ `useSyncExternalStore`, А НЕ `useState` + `useEffect`. Потрібне значення
 * ВЖЕ на першому рендері: інакше перший кадр збудує не ту гілку, а другий її
 * викине — рівно та зайва робота, від якої тут позбуваємось. `getSnapshot`
 * читає `matchMedia` синхронно, підписка живе поза React.
 *
 * ЧОМУ 767.98, А НЕ 767. Tailwind `md` спрацьовує від 768 px включно, а
 * `max-width: 767px` пропускає дробові ширини (768.5 при масштабуванні
 * сторінки). Дробова межа збігається з поведінкою класів рівно.
 */
const QUERY = "(max-width: 767.98px)";

function getMedia() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(QUERY);
}

function subscribe(onChange: () => void) {
  const media = getMedia();
  if (!media) return () => {};
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot() {
  return getMedia()?.matches ?? false;
}

/** На сервері рендеримо десктопну гілку — вона ж і в первинному HTML. */
function getServerSnapshot() {
  return false;
}

export function useIsNarrowViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

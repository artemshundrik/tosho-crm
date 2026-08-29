/**
 * Спільна обгортка над View Transitions API.
 *
 * ЧОМУ ЦЕ НЕ ПОВТОРЕННЯ `applyThemeWithTransition`. Хвиля перемикання теми
 * лишається у `src/lib/theme.ts`, бо їй потрібне те, чого більше нікому не
 * треба: обіцянка `ready`, щоб домалювати коло з точки натиску, і власна
 * крива. Тут — звичайний випадок «розвести два кадри перехресним згасанням»,
 * і саме він повторювався б у кожному новому місці.
 *
 * ГОЛОВНЕ ПРАВИЛО, ЗАРАДИ ЯКОГО ФУНКЦІЯ Й ІСНУЄ: браузер знімає кадр «до» НЕ в
 * момент виклику, а перед тим, як покликати `update`. Тож усе, що змінює
 * вигляд, мусить статись УСЕРЕДИНІ `update` і синхронно — інакше React встигне
 * оновитись раніше, у кадрі «до» вже буде новий стан, і перехід розведе два
 * однакові кадри. Збоку це виглядає як «перемкнулось одразу, а анімація
 * приїхала окремо» — тобто гірше, ніж узагалі без анімації. Тому виклики з
 * React обгортають своє оновлення у `flushSync`.
 *
 * Тут навмисно немає жодного імпорту React: файл читає й `theme.ts`, який
 * працює до першого рендера, і тягнути в нього `react-dom` не варто.
 */

type ViewTransition = {
  finished: Promise<void>;
  ready?: Promise<void>;
  updateCallbackDone?: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition;
};

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Виконати `update` під перехресним згасанням, а де це неможливо — просто
 * виконати.
 *
 * Запасний шлях (браузер без API, увімкнене «зменшити рух») — не деградація:
 * результат той самий, лише без руху. Тому функція нічого не повертає й ніде
 * не вимагає перевірок на боці виклику.
 *
 * `.catch(() => {})` обов'язковий. Браузер має право скасувати перехід —
 * вкладку сховали, зверху почався інший перехід, сторінку ще не намалювали —
 * і без цього кожне таке скасування падає в консоль помилкою про недійсний
 * стан. Саме оновлення при цьому вже виконане: його зробив зворотний виклик.
 */
export function runViewTransition(update: () => void): void {
  if (typeof document === "undefined") {
    update();
    return;
  }

  const doc = document as ViewTransitionDocument;
  if (typeof doc.startViewTransition !== "function" || prefersReducedMotion()) {
    update();
    return;
  }

  const transition = doc.startViewTransition(update);
  transition.updateCallbackDone?.catch(() => {});
  transition.finished.catch(() => {});
}

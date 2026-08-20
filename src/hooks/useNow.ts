import { useSyncExternalStore } from "react";

/**
 * Спільний годинник для написів на кшталт «щойно», «5 хв тому», «14 дн».
 *
 * Навіщо окремий хук, коли є `Date.now()`. Виклик `Date.now()` прямо в
 * рендері — не косметична вада: рендер перестає бути чистою функцією від
 * props і state. Наслідок видно ВЖЕ СЬОГОДНІ, без React Compiler: напис
 * оновлюється не тоді, коли минула хвилина, а тоді, коли сторінку
 * перемалювало щось інше. Тобто «щойно» може висіти пів години.
 *
 * Після ввімкнення компілятора стає гірше: він мемоїзує результат рендеру,
 * і час застигає остаточно. Тому правильна відповідь — не ховати `Date.now()`
 * у ref, щоб замовк лінтер (це заморозить напис назавжди), а зробити час
 * значенням, про зміну якого React знає.
 *
 * `useSyncExternalStore` тут не через моду: це канонічний примітив саме для
 * «значення живе поза React і змінюється в часі». Таймер один на весь
 * застосунок, а не по одному на компонент, і він взагалі не заводиться,
 * поки на нього ніхто не підписаний.
 *
 * Крок навмисно один (30 с) для всіх споживачів: «хвилини тому» цього
 * достатньо, а «дні» від зайвого перерахунку не постраждають. Секундного
 * кроку тут немає свідомо — кому треба секунди (таймер дизайнера), той має
 * власний інтервал і власну ціну.
 */
export const CLOCK_TICK_MS = 30_000;

const listeners = new Set<() => void>();
let now = Date.now();
let timerId: ReturnType<typeof setInterval> | null = null;

function refresh() {
  const next = Date.now();
  if (next === now) return;
  now = next;
  for (const listener of listeners) listener();
}

/**
 * Підписка на годинник. Експортована окремо від хука, щоб її можна було
 * перевірити тестом із підробленими таймерами — усередині `useSyncExternalStore`
 * до неї не дотягнутись без рендерера компонентів, якого в проєкті поки немає.
 */
export function subscribeToClock(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (timerId === null) {
    // Вкладка могла провисіти годину без жодного підписника — беремо свіжий
    // час одразу, а не чекаємо першого такту.
    now = Date.now();
    timerId = setInterval(refresh, CLOCK_TICK_MS);
    // Фонові вкладки браузер притормаживає, тож повернення до вкладки — це
    // окремий привід оновитись, інакше людина бачить час, що відстав.
    // typeof, а не document?.: у середовищі без DOM (тести на node) звернення
    // до неоголошеної глобальної кидає ReferenceError, і опційний ланцюжок
    // від цього не рятує.
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", refresh);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size > 0 || timerId === null) return;
    clearInterval(timerId);
    timerId = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", refresh);
  };
}

/** Поточний знімок годинника. Стабільний між тактами — цього вимагає store. */
export function getClockNow() {
  return now;
}

/** Поточний час у мілісекундах, що сам оновлюється раз на 30 секунд. */
export function useNow(): number {
  return useSyncExternalStore(subscribeToClock, getClockNow);
}

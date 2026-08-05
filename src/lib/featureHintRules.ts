/**
 * Коли підказку «спробуй цю можливість» можна показати.
 *
 * Правила навмисно жорсткі. Промо-модалка бота дала 53 покази й 2 кліки саме
 * тому, що била в лоб і повторювалась; підказка тихіша, але може набриднути
 * так само. Тому: лише тим, хто фічу НЕ пробував, максимум тричі за життя й
 * не частіше ніж раз на тиждень.
 *
 * Логіка тут, а не в компоненті, щоб її можна було перевірити тестами —
 * помилка в цих умовах не падає, а просто дратує людей щодня.
 */

/** Скільки разів максимум показуємо підказку одній людині. */
export const HINT_MAX_SHOWS = 3;

/** Скільки днів мовчимо між показами. */
export const HINT_COOLDOWN_DAYS = 7;

export type HintState = {
  shownCount: number;
  lastShownAt: string | null;
  dismissedAt: string | null;
};

export type HintDecisionInput = {
  /** Стан показів. `null` — людині ще ніколи не показували. */
  state: HintState | null;
  /**
   * Скільки разів людина вже користувалася фічею.
   * `undefined` — дані ще вантажаться, підказку притримуємо.
   */
  uses: number | undefined;
  now: Date;
};

export function shouldShowHint({ state, uses, now }: HintDecisionInput): boolean {
  // Дані про використання ще не приїхали — краще промовчати, ніж блимнути
  // підказкою тому, хто фічею давно користується.
  if (uses === undefined) return false;

  // Хто вже пробував — не наша аудиторія. Підказка про освоєне дратує найбільше.
  if (uses > 0) return false;

  if (!state) return true;
  if (state.dismissedAt) return false;
  if (state.shownCount >= HINT_MAX_SHOWS) return false;

  if (!state.lastShownAt) return true;
  const last = new Date(state.lastShownAt);
  if (Number.isNaN(last.getTime())) return true;

  const days = (now.getTime() - last.getTime()) / 86_400_000;
  return days >= HINT_COOLDOWN_DAYS;
}

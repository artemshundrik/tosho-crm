/**
 * Знімок стану інтеграцій між відкриттями сторінки.
 *
 * ЧОМУ НЕ ТЯГНЕМО ЩОРАЗУ: сторінку відкривають, щоб глянути «чи все живе», і
 * робити це кожні пів хвилини сенсу немає — стан інтеграцій міняється днями, а
 * не секундами. Тому список показується з останнього знімка одразу, а поруч із
 * кнопкою стоїть чесний штамп «Оновлено 2 дні тому»: людина бачить вік даних і
 * сама вирішує, чи тиснути «Оновити».
 *
 * Свіжіше за TTL — показуємо знімок і мовчимо. Старіше — тягнемо самі, щоб
 * ніхто не дивився тижнями на застиглі числа, вважаючи їх сьогоднішніми.
 *
 * localStorage, а не база: знімок персональний (у ньому «ваш акаунт»,
 * «підключено з команди» рахується під ваші права), і зберігати чужі цифри
 * було б і зайвим, і небезпечним.
 */

const SNAPSHOT_KEY = "tosho.integrations.snapshot.v1";
const CHECK_STAMP_KEY = "tosho.integrations.checked.v1";

/** Скільки знімок вважається свіжим. Далі сторінка оновиться сама. */
export const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000; // 6 годин

type Snapshot<T> = { at: string; data: T };

const readJson = <T,>(key: string): T | null => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Приватний режим, переповнене сховище, чужий формат після оновлення —
    // усе це не привід ламати сторінку: просто працюємо без знімка.
    return null;
  }
};

const writeJson = (key: string, value: unknown): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* тиша: знімок — зручність, а не умова роботи */
  }
};

export function readSnapshot<T>(): { at: string; data: T; isStale: boolean } | null {
  const snapshot = readJson<Snapshot<T>>(SNAPSHOT_KEY);
  if (!snapshot?.at || !snapshot.data) return null;
  const age = Date.now() - new Date(snapshot.at).getTime();
  if (!Number.isFinite(age) || age < 0) return null;
  return { at: snapshot.at, data: snapshot.data, isStale: age > SNAPSHOT_TTL_MS };
}

export function writeSnapshot<T>(data: T, at: string): void {
  writeJson(SNAPSHOT_KEY, { at, data } satisfies Snapshot<T>);
}

/**
 * Коли востаннє ВРУЧНУ перевіряли живий зв'язок конкретного сервісу.
 *
 * Окремо від знімка: Dropbox не лишає в нашій базі жодного сліду своєї роботи,
 * тож єдина чесна дата в його картці — коли ми самі натиснули «Перевірити
 * зв'язок». Видавати за неї дату правки картки замовника не можна.
 */
export function readLocalCheckStamp(id: string): string | null {
  const stamps = readJson<Record<string, string>>(CHECK_STAMP_KEY);
  return stamps?.[id] ?? null;
}

export function writeLocalCheckStamp(id: string, at: string): void {
  const stamps = readJson<Record<string, string>>(CHECK_STAMP_KEY) ?? {};
  stamps[id] = at;
  writeJson(CHECK_STAMP_KEY, stamps);
}

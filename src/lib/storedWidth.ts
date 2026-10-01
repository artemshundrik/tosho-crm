/**
 * Запам'ятована ширина (колонка обговорення, колонки таблиць) у localStorage.
 * Число — лише побажання людини; межі завжди перераховує той, хто його читає.
 */
export function readStoredWidth(key: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredWidth(key: string, px: number | null) {
  try {
    if (px === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(Math.round(px)));
  } catch {
    // приватний режим — просто не запам'ятовуємо
  }
}

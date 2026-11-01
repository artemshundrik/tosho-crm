import { useSyncExternalStore } from "react";

/**
 * Число біля «Мого ходу» в меню. Рахує його сама сторінка, коли зібрала
 * чергу: меню не вантажить замовлення й прорахунки вдруге. До першого
 * відвідування в сесії числа немає — краще нічого, ніж вигадане.
 */
const STORAGE_KEY = "tosho:my-turn-count";
const EVENT = "my_turn_count";

const read = (): number | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
};

export function setMyTurnCount(count: number) {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(count));
  } catch {
    // Без сховища число просто не переживе перезавантаження.
  }
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (notify: () => void) => {
  window.addEventListener(EVENT, notify);
  return () => window.removeEventListener(EVENT, notify);
};

export const useMyTurnCount = () => useSyncExternalStore(subscribe, read, () => null);

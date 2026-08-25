import { useEffect, useSyncExternalStore } from "react";

/**
 * Скільки перекривних поверхонь (нижніх аркушів) зараз відкрито.
 *
 * НАВІЩО. Смуга вкладок на телефоні висить над контентом і не знає, хто саме
 * відкрився поверх неї. Доти її ховав `AppLayout`, перелічуючи свої стани
 * вручну (`mobileMenuOpen || toshoAiOpen || cmdkOpen`), тож будь-який новий
 * аркуш — фільтри, налаштування смуги — про це не знав і опинявся під смугою:
 * вона перекривала його нижні пункти й ловила дотики.
 *
 * Лічильник, а не прапорець: аркуші можуть накладатись, і закриття верхнього
 * не означає, що знизу нікого не лишилось.
 */
let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Повідомити, що поверхня відкрилась. Повертає функцію «закрилась». */
export function registerOverlay() {
  openCount += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount = Math.max(0, openCount - 1);
    emit();
  };
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot() {
  return openCount > 0;
}

function getServerSnapshot() {
  return false;
}

/** true, поки хоч один нижній аркуш відкритий. */
export function useOverlayOpen() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Маркер присутності: реєструє поверхню, поки САМ змонтований.
 *
 * ЧОМУ НЕ ЕФЕКТ У ТІЛІ `DialogContent`/`SheetContent`, ЯК БУЛО СПОЧАТКУ.
 * Radix ховає лише вміст ПОРТАЛУ — сама обгортка `<DialogContent>` лишається
 * в дереві весь час, відкрите вікно чи ні. Тож ефект на монтуванні
 * спрацьовував для КОЖНОГО аркуша застосунку одразу після завантаження й
 * ніколи не звільнявся: заміряно на «Огляді» — лічильник доростав до 6 без
 * жодного відкритого вікна, і смуга вкладок на телефоні зникала назавжди.
 *
 * Цей компонент ставиться ВСЕРЕДИНУ вмісту порталу, тож живе рівно стільки,
 * скільки поверхня справді відкрита.
 */
export function OverlayPresenceMarker() {
  useEffect(() => registerOverlay(), []);
  return null;
}

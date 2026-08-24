import "@testing-library/jest-dom/vitest";

/**
 * Заглушки браузерних API, яких у jsdom немає (REQ-60).
 *
 * ЧОМУ ВОНИ ПОТРІБНІ. Наші вікна й пікери — це Radix, а він міряє елементи й
 * слухає зміни розміру. У jsdom цих API просто немає, і без заглушок падає не
 * тест поведінки, а сам рендер — тобто ми б не перевіряли нічого.
 *
 * ЩО ЦЕ НЕ ЛІКУЄ. Заглушки повертають нулі й нікого не сповіщають. Тому тут
 * НЕ МОЖНА перевіряти те, що залежить від реальних розмірів: позицію поповера,
 * висоту колонок канбану, чи влізла кнопка в тулбар. Для такого є прев'ю й
 * заміри в браузері. Тут перевіряємо ЛОГІКУ поведінки: що відкрилось, що
 * запитало підтвердження, що закрилось.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Radix перевіряє захоплення вказівника перед відкриттям списків; jsdom про
// нього не знає й кидає помилку просто на кліку по тригеру.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

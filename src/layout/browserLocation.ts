import { useSyncExternalStore } from "react";

/**
 * Адреса браузера як синхронне джерело — для підсвітки пункту меню (REQ-274).
 *
 * НАВІЩО ОКРЕМЕ ДЖЕРЕЛО, КОЛИ Є `useLocation()`. React Router оновлює свою адресу
 * всередині transition, і разом із нею — у тому самому коміті — малюється нова
 * сторінка. Це правильно для сторінки (стара лишається на екрані, доки нова не
 * готова, і головний потік не блокується), але підсвітка пункту меню в тому
 * самому коміті означає, що людина тисне «Прорахунки» й до кінця рендера дошки
 * не бачить жодної реакції — заміряно 100–150 мс на зібраному проді й до
 * секунди на повільнішій машині. `useSyncExternalStore` оновлюється синхронно
 * на pushState: пункт підсвічується й значок робить «поп» у той самий кадр, а
 * сторінка приїжджає слідом.
 *
 * ЯК. `pushState`/`replaceState` не мають події, тож вони обгорнуті один раз на
 * весь застосунок і кидають `tosho:browser-location-change`; `popstate` браузер
 * дає сам. Знімок кешується за значенням, інакше кожен виклик віддавав би новий
 * об'єкт і React перемальовував би підписників без причини.
 */
type BrowserLocationSnapshot = {
  pathname: string;
  search: string;
  hash: string;
};

let cachedBrowserLocationSnapshot: BrowserLocationSnapshot | null = null;

function getBrowserLocationSnapshot(): BrowserLocationSnapshot {
  const nextSnapshot = {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  };
  if (
    cachedBrowserLocationSnapshot &&
    cachedBrowserLocationSnapshot.pathname === nextSnapshot.pathname &&
    cachedBrowserLocationSnapshot.search === nextSnapshot.search &&
    cachedBrowserLocationSnapshot.hash === nextSnapshot.hash
  ) {
    return cachedBrowserLocationSnapshot;
  }
  cachedBrowserLocationSnapshot = nextSnapshot;
  return nextSnapshot;
}

function subscribeToBrowserLocation(onStoreChange: () => void) {
  const historyState = window.history as History & {
    __toshoRoutesPatched?: boolean;
    __toshoPushState?: History["pushState"];
    __toshoReplaceState?: History["replaceState"];
  };

  if (!historyState.__toshoRoutesPatched) {
    historyState.__toshoRoutesPatched = true;
    historyState.__toshoPushState = window.history.pushState.bind(window.history);
    historyState.__toshoReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = function (...args) {
      const result = historyState.__toshoPushState!.apply(this, args);
      window.dispatchEvent(new Event("tosho:browser-location-change"));
      return result;
    };

    window.history.replaceState = function (...args) {
      const result = historyState.__toshoReplaceState!.apply(this, args);
      window.dispatchEvent(new Event("tosho:browser-location-change"));
      return result;
    };
  }

  const handleChange = () => onStoreChange();
  window.addEventListener("popstate", handleChange);
  window.addEventListener("tosho:browser-location-change", handleChange);
  return () => {
    window.removeEventListener("popstate", handleChange);
    window.removeEventListener("tosho:browser-location-change", handleChange);
  };
}

const SERVER_SNAPSHOT: BrowserLocationSnapshot = { pathname: "/", search: "", hash: "" };

export function useBrowserLocation(): BrowserLocationSnapshot {
  return useSyncExternalStore(subscribeToBrowserLocation, getBrowserLocationSnapshot, () => SERVER_SNAPSHOT);
}

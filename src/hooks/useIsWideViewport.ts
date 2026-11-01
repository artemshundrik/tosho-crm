import { useSyncExternalStore } from "react";

/**
 * Чи вікно не вужче за 1600 px — тоді в рядок тулбара влазять пошук, замовник,
 * кілька окремих чипів фільтрів і число зі сумою. Нижче чипи згортаються в один
 * «Фільтри · N» (ToolbarFilterBar), інакше рядок ламається на два. Той самий
 * шаблон, що й useIsNarrowViewport: значення потрібне вже на першому рендері.
 */
const QUERY = "(min-width: 1600px)";

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

const getSnapshot = () => getMedia()?.matches ?? true;
const getServerSnapshot = () => true;

export function useIsWideViewport() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

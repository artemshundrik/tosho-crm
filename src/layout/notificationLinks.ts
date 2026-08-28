import { ROUTES } from "./routes";

/**
 * Адреси й підписи сповіщень — чотири чисті функції, винесені з AppLayout.
 *
 * Тут вони не тому, що завеликі, а тому, що самостійні: жодна не торкається
 * стану лейаута, усі відповідають на питання про ПОСИЛАННЯ. Сам AppLayout при
 * цьому впирався в стелю розміру, і ратчет зупиняв пуш.
 */

export function normalizeNotificationHref(href?: string) {
  if (!href) return "";
  const trimmed = href.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed, window.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return trimmed;
  }
}

export function trimNotificationDescription(text?: string, limit = 160) {
  const normalized = (text ?? "").trim().replace(/\s+/g, " ");
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

export function shouldSuppressInAppNotificationToast(currentPath: string, href?: string) {
  const normalizedHref = normalizeNotificationHref(href);
  if (!normalizedHref) return false;
  if (normalizedHref === currentPath) return true;

  const currentPathname = currentPath.split("?")[0] ?? currentPath;
  const hrefPathname = normalizedHref.split("?")[0] ?? normalizedHref;

  if (hrefPathname === currentPathname) return true;

  const entityRoutes = [
    ROUTES.ordersEstimates,
    ROUTES.ordersCustomers,
    ROUTES.ordersProduction,
    ROUTES.design,
    ROUTES.contractors,
    ROUTES.sampleStock,
  ];
  return entityRoutes.some((route) => currentPathname.startsWith(`${route}/`) && hrefPathname === currentPathname);
}

export function getNotificationActionLabel(href?: string) {
  const normalizedHref = normalizeNotificationHref(href);
  if (!normalizedHref) return "Відкрити";
  if (normalizedHref.startsWith(ROUTES.design)) return "До задачі";
  if (normalizedHref.startsWith(ROUTES.ordersEstimates)) return "До прорахунку";
  if (normalizedHref.startsWith(ROUTES.ordersCustomers)) return "До замовника";
  if (normalizedHref.startsWith(ROUTES.ordersProduction)) return "До замовлення";
  if (normalizedHref.startsWith(ROUTES.sampleStock)) return "До складу";
  if (normalizedHref.startsWith(ROUTES.notifications)) return "До сповіщень";
  return "Відкрити";
}

type RouteImporter = () => Promise<unknown>;

type RoutePreloadEntry = {
  /** Імʼя для підвантаження без конкретної адреси — див. `preloadRouteByKey`. */
  key?: string;
  pattern: RegExp;
  importer: RouteImporter;
  heavy?: boolean;
};

const routeImporters: RoutePreloadEntry[] = [
  { pattern: /^\/overview$/, importer: () => import("../pages/OverviewPage") },
  { pattern: /^\/activity$/, importer: () => import("../pages/ActivityPage") },
  { pattern: /^\/notifications$/, importer: () => import("../pages/NotificationsPage") },
  { pattern: /^\/team$/, importer: () => import("../pages/TeamPage") },
  { pattern: /^\/settings\/members$/, importer: () => import("../pages/TeamMembersPage") },
  { pattern: /^\/profile$/, importer: () => import("../pages/ProfilePage") },
  { pattern: /^\/admin\/observability$/, importer: () => import("../pages/AdminObservabilityPage") },
  { pattern: /^\/orders\/estimates$/, importer: () => import("../pages/OrdersEstimatesPage"), heavy: true },
  { key: "quote-details", pattern: /^\/orders\/estimates\/[^/]+$/, importer: () => import("../pages/OrdersEstimateDetailsPage"), heavy: true },
  { pattern: /^\/orders\/customers$/, importer: () => import("../pages/OrdersCustomersPage"), heavy: true },
  { pattern: /^\/orders\/production$/, importer: () => import("../pages/OrdersProductionPage"), heavy: true },
  { pattern: /^\/orders\/ready-to-ship$/, importer: () => import("../pages/OrdersReadyToShipPage"), heavy: true },
  { pattern: /^\/catalog\/products$/, importer: () => import("../features/catalog/ProductCatalogPage"), heavy: true },
  { pattern: /^\/logistics$/, importer: () => import("../pages/LogisticsPage"), heavy: true },
  { pattern: /^\/design$/, importer: () => import("../pages/DesignPage"), heavy: true },
  { key: "design-task", pattern: /^\/design\/[^/]+$/, importer: () => import("../pages/DesignTaskPage"), heavy: true },
  { pattern: /^\/contractors$/, importer: () => import("../pages/ContractorsPage"), heavy: true },
  { pattern: /^\/stock\/samples$/, importer: () => import("../pages/SampleStockPage"), heavy: true },
  { pattern: /^\/finances$/, importer: () => import("../pages/FinancesPage") },
  { pattern: /^\/marketing$/, importer: () => import("../pages/MarketingPage"), heavy: true },
];

/**
 * Позначка «цей чанк уже везеться» — по ЗАПИСУ, а не по адресі.
 *
 * Доти ключем був сам шлях, і для сторінок із id (`/design/<id>`) кожна картка
 * вважалась окремим маршрутом: наведення на сотню карток означало сотню записів
 * у реєстрі. Чанк усе одно один на весь маршрут, тож і позначка одна.
 */
const prefetched = new Set<RoutePreloadEntry>();
const ALLOW_HEAVY_ROUTE_PRELOAD = true;

function preloadEntry(entry: RoutePreloadEntry, label: string) {
  if (prefetched.has(entry)) return;
  if (entry.heavy && !ALLOW_HEAVY_ROUTE_PRELOAD) return;
  prefetched.add(entry);
  void entry.importer().catch((error) => {
    prefetched.delete(entry);
    console.warn("Route preload failed", label, error);
  });
}

export function preloadRoute(pathname: string) {
  const match = routeImporters.find((entry) => entry.pattern.test(pathname));
  if (!match) return;
  preloadEntry(match, pathname);
}

/**
 * Підвантажити чанк маршруту за іменем, без конкретної адреси.
 *
 * НАВІЩО ОКРЕМО ВІД `preloadRoute` (REQ-136). Картку на дошці відкриває не
 * посилання, а обробник кліку, і адреса в кожної своя. Через це записи для
 * `/design/:id` і `/orders/estimates/:id` лежали в реєстрі роками й НЕ КЛИКАЛИСЬ
 * ЖОДНОГО РАЗУ: `preloadRoute` дьоргають лише посилання сайдбара й нижньої
 * панелі. Заміряно 24.08.2026: через 3 секунди стояння на дошці дизайну чанк
 * сторінки задачі (294 кБ) у памʼяті відсутній — він починає їхати в мить кліку.
 *
 * Ім'я замість адреси дає СТАЛЕ посилання на функцію: у списку з сотень рядків
 * обробник наведення не створюється щорендер.
 */
export function preloadRouteByKey(key: string) {
  const match = routeImporters.find((entry) => entry.key === key);
  if (!match) return;
  preloadEntry(match, key);
}

/** Готові обробники для карток дошок — сталі, тож їх можна давати прямо в JSX. */
export const preloadDesignTaskRoute = () => preloadRouteByKey("design-task");
export const preloadQuoteDetailsRoute = () => preloadRouteByKey("quote-details");

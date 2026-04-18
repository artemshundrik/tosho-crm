type RouteImporter = () => Promise<unknown>;

type RoutePreloadEntry = {
  pattern: RegExp;
  importer: RouteImporter;
  heavy?: boolean;
};

const routeImporters: RoutePreloadEntry[] = [
  { pattern: /^\/overview$/, importer: () => import("../pages/OverviewPage") },
  { pattern: /^\/finance$/, importer: () => import("../pages/FinancePage") },
  { pattern: /^\/finance\/invoices$/, importer: () => import("../pages/FinanceInvoicesPage") },
  { pattern: /^\/finance\/expense-invoices$/, importer: () => import("../pages/FinanceExpenseInvoicesPage") },
  { pattern: /^\/finance\/acts$/, importer: () => import("../pages/FinanceActsPage") },
  { pattern: /^\/activity$/, importer: () => import("../pages/ActivityPage") },
  { pattern: /^\/notifications$/, importer: () => import("../pages/NotificationsPage") },
  { pattern: /^\/team$/, importer: () => import("../pages/TeamPage") },
  { pattern: /^\/settings\/members$/, importer: () => import("../pages/TeamMembersPage") },
  { pattern: /^\/profile$/, importer: () => import("../pages/ProfilePage") },
  { pattern: /^\/admin$/, importer: () => import("../pages/AdminPage") },
  { pattern: /^\/admin\/observability$/, importer: () => import("../pages/AdminObservabilityPage") },
  { pattern: /^\/admin\/runtime-errors$/, importer: () => import("../pages/RuntimeErrorsPage") },
  { pattern: /^\/orders\/estimates$/, importer: () => import("../pages/OrdersEstimatesPage"), heavy: true },
  { pattern: /^\/orders\/estimates\/[^/]+$/, importer: () => import("../pages/OrdersEstimateDetailsPage"), heavy: true },
  { pattern: /^\/orders\/customers$/, importer: () => import("../pages/OrdersCustomersPage"), heavy: true },
  { pattern: /^\/orders\/production$/, importer: () => import("../pages/OrdersProductionPage"), heavy: true },
  { pattern: /^\/orders\/ready-to-ship$/, importer: () => import("../pages/OrdersReadyToShipPage"), heavy: true },
  { pattern: /^\/catalog\/products$/, importer: () => import("../features/catalog/ProductCatalogPage"), heavy: true },
  { pattern: /^\/logistics$/, importer: () => import("../pages/LogisticsPage"), heavy: true },
  { pattern: /^\/design$/, importer: () => import("../pages/DesignPage"), heavy: true },
  { pattern: /^\/design\/[^/]+$/, importer: () => import("../pages/DesignTaskPage"), heavy: true },
  { pattern: /^\/contractors$/, importer: () => import("../pages/ContractorsPage"), heavy: true },
];

const prefetched = new Set<string>();
const ALLOW_HEAVY_ROUTE_PRELOAD = true;

export function preloadRoute(pathname: string) {
  if (prefetched.has(pathname)) return;
  const match = routeImporters.find((entry) => entry.pattern.test(pathname));
  if (!match) return;
  if (match.heavy && !ALLOW_HEAVY_ROUTE_PRELOAD) return;
  prefetched.add(pathname);
  void match.importer().catch((error) => {
    prefetched.delete(pathname);
    console.warn("Route preload failed", pathname, error);
  });
}

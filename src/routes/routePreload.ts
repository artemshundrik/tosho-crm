type RouteImporter = () => Promise<unknown>;

const routeImporters: Array<[RegExp, RouteImporter]> = [
  [/^\/overview$/, () => import("../pages/OverviewPage")],
  [/^\/finance$/, () => import("../pages/FinancePage")],
  [/^\/finance\/invoices$/, () => import("../pages/FinanceInvoicesPage")],
  [/^\/finance\/expense-invoices$/, () => import("../pages/FinanceExpenseInvoicesPage")],
  [/^\/finance\/acts$/, () => import("../pages/FinanceActsPage")],
  [/^\/activity$/, () => import("../pages/ActivityPage")],
  [/^\/notifications$/, () => import("../pages/NotificationsPage")],
  [/^\/settings\/members$/, () => import("../pages/TeamMembersPage")],
  [/^\/profile$/, () => import("../pages/ProfilePage")],
  [/^\/admin$/, () => import("../pages/AdminPage")],
  [/^\/admin\/runtime-errors$/, () => import("../pages/RuntimeErrorsPage")],
  [/^\/orders\/estimates$/, () => import("../pages/OrdersEstimatesPage")],
  [/^\/orders\/estimates\/[^/]+$/, () => import("../pages/OrdersEstimateDetailsPage")],
  [/^\/orders\/customers$/, () => import("../pages/OrdersCustomersPage")],
  [/^\/orders\/production$/, () => import("../pages/OrdersProductionPage")],
  [/^\/orders\/ready-to-ship$/, () => import("../pages/OrdersReadyToShipPage")],
  [/^\/catalog\/products$/, () => import("../features/catalog/ProductCatalogPage")],
  [/^\/logistics$/, () => import("../pages/LogisticsPage")],
  [/^\/design$/, () => import("../pages/DesignPage")],
  [/^\/design\/[^/]+$/, () => import("../pages/DesignTaskPage")],
  [/^\/contractors$/, () => import("../pages/ContractorsPage")],
];

const prefetched = new Set<string>();

export function preloadRoute(pathname: string) {
  if (prefetched.has(pathname)) return;
  const match = routeImporters.find(([pattern]) => pattern.test(pathname));
  if (!match) return;
  prefetched.add(pathname);
  void match[1]().catch((error) => {
    prefetched.delete(pathname);
    console.warn("Route preload failed", pathname, error);
  });
}

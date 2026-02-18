type RouteImporter = () => Promise<unknown>;

const routeImporters: Array<[RegExp, RouteImporter]> = [
  [/^\/overview$/, () => import("../pages/OverviewPage")],
  [/^\/finance$/, () => import("../pages/FinancePage")],
  [/^\/activity$/, () => import("../pages/ActivityPage")],
  [/^\/notifications$/, () => import("../pages/NotificationsPage")],
  [/^\/settings\/members$/, () => import("../pages/TeamMembersPage")],
  [/^\/profile$/, () => import("../pages/ProfilePage")],
  [/^\/admin$/, () => import("../pages/AdminPage")],
  [/^\/orders\/estimates$/, () => import("../pages/OrdersEstimatesPage")],
  [/^\/orders\/customers$/, () => import("../pages/OrdersCustomersPage")],
];

const prefetched = new Set<string>();

export function preloadRoute(pathname: string) {
  if (prefetched.has(pathname)) return;
  const match = routeImporters.find(([pattern]) => pattern.test(pathname));
  if (!match) return;
  prefetched.add(pathname);
  void match[1]();
}

/**
 * Адреси розділів застосунку.
 *
 * ЧОМУ ОКРЕМО. Ці константи жили всередині AppLayout — файлу на 3 250 рядків,
 * який ратчет розміру тримає під наглядом (scripts/check-file-growth.mjs).
 * Маршрути не залежать від жодного React-стану, тож їхнє місце там, де їх
 * можна імпортувати, не тягнучи за собою всю оболонку: конфіг шапки
 * (`headerConfig.ts`) читає саме звідси, а не з AppLayout, — інакше вийшов би
 * цикл імпортів.
 */

// --- Routes ---
export const ROUTES = {
  overview: "/overview",
  activity: "/activity",

  ordersEstimates: "/orders/estimates",
  ordersCustomers: "/orders/customers",
  ordersProduction: "/orders/production",
  ordersReadyToShip: "/orders/ready-to-ship",
  catalogProducts: "/catalog/products",

  logistics: "/logistics",
  design: "/design",
  contractors: "/contractors",
  sampleStock: "/stock/samples",
  finances: "/finances",
  marketing: "/marketing",
  team: "/team",

  workspaceSettings: "/workspace-settings",
  membersAccess: "/settings/members",
  integrations: "/integrations",
  notifications: "/notifications",
  accountSettings: "/account-settings",
  profile: "/profile",
  features: "/features",
  whatsNew: "/whats-new",
  // Розділ «Dev» — беклог, релізи, здоровʼя системи; шляхи в src/lib/devSection.ts.
  // Старі адреси (/releases, /dev-requests, /admin/observability) лишились
  // редиректами заради закладок і href у вже розісланих сповіщеннях.
} as const;

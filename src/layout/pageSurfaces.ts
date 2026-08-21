/**
 * Реєстр поверхонь застосунку: що маршрут ОБІЦЯЄ намалювати.
 *
 * Дві речі, які макет має знати ДО того, як сторінка змонтувалась:
 *   1) чи буде в цього розділу смуга дій (щоб зарезервувати її висоту, а не
 *      вставляти смугу в момент, коли кнопки нарешті приїхали);
 *   2) якої форми буде вміст (щоб каркас завантаження був схожий на майбутню
 *      сторінку, а не на універсальну плитку посеред екрана).
 *
 * ЧОМУ САМЕ РЕЄСТР, А НЕ СПОСТЕРЕЖЕННЯ. Перша спроба (21.08.2026) визначала
 * «чи має розділ смугу» за тим, чи вже з'явились кнопки, — і Каталог отримав
 * порожню смугу на 200 px. Причина фундаментальна: макет рендериться ДО своїх
 * дітей, тож у той самий кадр він фізично не може побачити, що сторінка
 * ЗБИРАЄТЬСЯ зареєструвати тулбар. Спостереження тут не працює в принципі —
 * працює лише факт, узятий із коду наперед.
 *
 * ЧОМУ НЕ showPageHeader. Спокусливо взяти готовий прапорець із getHeaderConfig
 * (там рівно 18 маршрутів із showPageHeader: false), але він означає «не малюй
 * стандартну шапку», а не «тут буде смуга дій». Три з тих 18 — Огляд, Каталог і
 * Фінанси — тулбар не реєструють узагалі.
 *
 * ЩО ТАКЕ «МАЄ СМУГУ». Рівно одне: сторінка кличе usePageHeaderActions. Малювати
 * <UnifiedPageToolbar> у власному тілі — не те саме: це звичайний блок усередині
 * сторінки, він нічого не віддає в макет (так роблять «Як ми працюємо» та
 * «Інтеграції», і смуга їм не потрібна).
 *
 * Від розходження реєстру з кодом стереже scripts/check-page-surfaces.mjs у
 * pre-push: нову сторінку з тулбаром, але без запису тут, запушити не дадуть.
 */

/**
 * Форма майбутнього вмісту — за нею малюється каркас завантаження.
 *
 * Форм більше, ніж «список / картка / дошка», і це навмисно: каркас, який не
 * повторює рамку сторінки, дратує сильніше за його відсутність. Картка
 * прорахунку й дизайн-задача мають праву рейку різної ширини, «Активність» — це
 * одна картка з рядками всередині, а не стрічка окремих карток, тож у кожного
 * з цих випадків своя форма.
 */
export type PageShape =
  /** Стрічка окремих карток-рядків: сповіщення, релізи, «Що нового». */
  | "list"
  /** Стрічка подій усередині однієї картки: «Активність». */
  | "feed"
  /** Таблиця на всю ширину полотна: замовники, підрядники, склад. */
  | "table"
  /** Канбан: колонки з картками. */
  | "board"
  /** Проста картка сутності: замовлення, профіль, налаштування сервісу. */
  | "detail"
  /** Картка прорахунку: верхня панель + права рейка 360 px. */
  | "quote-record"
  /** Дизайн-задача: права рейка 412 px, без верхньої панелі. */
  | "design-record"
  /** Дашборд: плитки з числами й панелі під ними. */
  | "dashboard"
  /** Галерея однакових карток. */
  | "grid"
  /** Список ліворуч, деталі праворуч (Каталог, Ролі та доступи). */
  | "split";

/**
 * Смуга дій сторінки.
 * `compact` — один рядок (заголовок + кнопки), `full` — два (ще пошук/фільтри).
 * Різниця тільки у висоті резерву: помилитись на рядок означає повернути той
 * самий стрибок, тільки менший. Заміряно 21.08.2026: `compact` = 44 px вмісту,
 * `full` = 96 px. Точну висоту макет усе одно запам'ятовує при першому показі
 * тулбара (див. toolbarHeights.ts) — це лише оцінка на перший вхід.
 */
export type PageToolbarKind = "none" | "compact" | "full";

export type PageSurface = {
  /** Стабільний ключ поверхні. Дії в шапці належать саме йому. */
  id: string;
  /** Шаблон шляху; `:щось` — будь-який один сегмент. */
  path: string;
  /** true — збіг лише повний, без вкладених сегментів. */
  exact?: boolean;
  /**
   * Файл сторінки — його читає pre-push, звіряючи `toolbar` з фактичними
   * викликами usePageHeaderActions. Тонку обгортку скрипт проходить наскрізь.
   */
  page: string;
  toolbar: PageToolbarKind;
  shape: PageShape;
  /**
   * Режим полотна: контентна колонка йде без бічних відступів і без обмеження
   * ширини, а відступи додає сама сторінка.
   *
   * Живе тут, а не окремим списком шляхів у макеті, бо від цього залежать двоє:
   * сам макет і каркас завантаження. Поки список був один на макет, каркас про
   * нього не знав — і тягнувся від краю до краю там, де сторінка так не робить.
   */
  canvas?: boolean;
  /**
   * Власне обмеження ширини сторінки, якщо воно в неї є.
   *
   * Без цього каркас малювався на всю контентну колонку, а сторінка під ним
   * стискалась до своєї ширини — на широкому екрані було видно, як щойно
   * показаний каркас «згортається». Числа — ті самі, що в самих сторінках.
   */
  maxWidth?: number;
};

/**
 * Порядок має значення: перший збіг виграє, тож картки сутностей стоять перед
 * своїми списками (`/design/:id` перед `/design`).
 */
export const PAGE_SURFACES: readonly PageSurface[] = [
  { id: "notifications", path: "/notifications", page: "src/pages/NotificationsPage.tsx", toolbar: "compact", shape: "list", canvas: true },
  { id: "activity", path: "/activity", page: "src/pages/ActivityPage.tsx", toolbar: "full", shape: "feed" },
  { id: "overview", path: "/overview", page: "src/pages/OverviewPage.tsx", toolbar: "none", shape: "dashboard" },
  { id: "team", path: "/team", page: "src/pages/TeamPage.tsx", toolbar: "full", shape: "dashboard" },

  { id: "customers", path: "/orders/customers", page: "src/pages/OrdersCustomersPage.tsx", toolbar: "full", shape: "table", canvas: true },
  { id: "quote-details", path: "/orders/estimates/:id", page: "src/pages/OrdersEstimateDetailsPage.tsx", toolbar: "none", shape: "quote-record", canvas: true },
  { id: "quotes", path: "/orders/estimates", page: "src/pages/OrdersEstimatesPage.tsx", toolbar: "full", shape: "board", canvas: true },
  { id: "order-details", path: "/orders/production/:id", page: "src/pages/OrdersProductionDetailsRoutePage.tsx", toolbar: "none", shape: "detail", canvas: true, maxWidth: 1760 },
  { id: "orders", path: "/orders/production", page: "src/pages/OrdersProductionPage.tsx", toolbar: "full", shape: "board", canvas: true },
  { id: "ready-to-ship", path: "/orders/ready-to-ship", page: "src/pages/OrdersReadyToShipPage.tsx", toolbar: "none", shape: "list" },

  { id: "catalog", path: "/catalog/products", page: "src/features/catalog/ProductCatalogPage/index.tsx", toolbar: "none", shape: "split" },
  { id: "logistics", path: "/logistics", page: "src/pages/LogisticsPage.tsx", toolbar: "none", shape: "list" },
  { id: "design-task", path: "/design/:id", page: "src/pages/DesignTaskPage.tsx", toolbar: "none", shape: "design-record", canvas: true },
  { id: "design", path: "/design", page: "src/pages/DesignPage.tsx", toolbar: "full", shape: "board", canvas: true },
  { id: "contractors", path: "/contractors", page: "src/pages/ContractorsPage.tsx", toolbar: "full", shape: "table", canvas: true },
  { id: "stock", path: "/stock/samples", page: "src/pages/SampleStockPage.tsx", toolbar: "full", shape: "table", canvas: true },
  { id: "finances", path: "/finances", page: "src/pages/FinancesPage.tsx", toolbar: "none", shape: "dashboard", canvas: true },
  { id: "marketing", path: "/marketing", page: "src/pages/MarketingPage.tsx", toolbar: "full", shape: "grid" },

  { id: "members-access", path: "/settings/members", page: "src/pages/TeamMembersPage.tsx", toolbar: "compact", shape: "split", canvas: true },
  // Налаштування конкретного сервісу — перед загальною гілкою «Інтеграцій».
  { id: "nova-poshta", path: "/integrations/nova-poshta", page: "src/pages/NovaPoshtaSettingsPage.tsx", toolbar: "none", shape: "detail" },
  // Тулбар малюється всередині тіла сторінки — макету резервувати нічого.
  { id: "integrations", path: "/integrations", page: "src/pages/IntegrationsPage.tsx", toolbar: "none", shape: "list" },
  { id: "profile", path: "/profile", page: "src/pages/ProfilePage.tsx", toolbar: "compact", shape: "detail" },

  // Той самий випадок, що й «Інтеграції»: власний тулбар у тілі сторінки.
  { id: "handbook", path: "/whats-new/handbook", page: "src/pages/HandbookPage.tsx", toolbar: "none", shape: "list" },
  { id: "features", path: "/whats-new/features", page: "src/pages/FeaturesPage.tsx", toolbar: "full", shape: "grid" },
  { id: "whats-new", path: "/whats-new", page: "src/pages/WhatsNewPage.tsx", toolbar: "full", shape: "list", maxWidth: 760 },

  { id: "dev-backlog", path: "/dev/backlog", page: "src/pages/DevRequestsPage.tsx", toolbar: "full", shape: "board", canvas: true },
  { id: "dev-releases", path: "/dev/releases", page: "src/pages/ReleasesPage.tsx", toolbar: "none", shape: "dashboard", maxWidth: 1180 },
  { id: "dev-health", path: "/dev/health", page: "src/pages/AdminObservabilityPage.tsx", toolbar: "none", shape: "dashboard" },
] as const;

function segmentsOf(value: string) {
  return value.split("/").filter(Boolean);
}

function matchesSurface(surface: PageSurface, pathSegments: string[]) {
  const patternSegments = segmentsOf(surface.path);
  if (surface.exact ? pathSegments.length !== patternSegments.length : pathSegments.length < patternSegments.length) {
    return false;
  }
  return patternSegments.every((segment, index) =>
    segment.startsWith(":") ? Boolean(pathSegments[index]) : segment === pathSegments[index]
  );
}

/** Яка поверхня відкрита. `null` — маршрут поза оболонкою (вхід, інвайт, 404). */
export function resolvePageSurface(pathname: string): PageSurface | null {
  const pathSegments = segmentsOf(pathname.split("?")[0] ?? pathname);
  return PAGE_SURFACES.find((surface) => matchesSurface(surface, pathSegments)) ?? null;
}

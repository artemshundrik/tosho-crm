/**
 * Єдиний реєстр модулів застосунку — джерело правди для доступів.
 *
 * До 2026-07-26 цей список був продубльований у шести місцях (бібліотека
 * довідника, TeamMembersPage, union у AppLayout, дві netlify-функції, SQL-дефолт)
 * і вже встиг розійтися: 13 ключів проти 10 проти 8 проти 7. Тепер усе, що
 * стосується модулів — ключі, підписи, порядок у UI, дефолти за роллю — живе
 * тут, а решта файлів імпортує.
 *
 * **Додаючи модуль**, допиши рядок у MODULE_DEFINITIONS, признач його посадам у
 * ROLE_MENUS і привʼяжи `moduleKey` до пункту сайдбару та до ModuleRouteGate у
 * App.tsx. Модуль, забутий у ROLE_MENUS, не побачить ніхто, крім власника.
 *
 * «Сповіщення» свідомо НЕ модуль: вони потрібні всім і перемикача не мають.
 */

export type ModuleKey =
  | "overview"
  | "customers"
  | "quotes"
  | "orders"
  | "shipping"
  | "catalog"
  | "logistics"
  | "design"
  | "contractors"
  | "stock"
  | "finance"
  | "vchasno"
  | "vchasno_send"
  | "marketing"
  | "team"
  | "members_access"
  | "nova_poshta"
  | "pulse"
  | "dev";

export type ModuleAccess = Record<ModuleKey, boolean>;

/** Секції, на які групується список перемикачів у «Ролі та доступи». */
export type ModuleGroup = "orders" | "operations" | "finance" | "account";

export const MODULE_GROUP_LABELS: Record<ModuleGroup, string> = {
  orders: "Продажі та замовлення",
  operations: "Операції",
  finance: "Фінанси та документи",
  account: "Команда й налаштування",
};

type RoleContext = { accessRole?: string | null; jobRole?: string | null };

const isOwner = (ctx: RoleContext) => (ctx.accessRole ?? "").trim().toLowerCase() === "owner";
const job = (ctx: RoleContext) => (ctx.jobRole ?? "").trim().toLowerCase();

const ownerOrSeo = (ctx: RoleContext) => isOwner(ctx) || job(ctx) === "seo";

export type ModuleDefinition = {
  key: ModuleKey;
  /** Підпис у «Ролі та доступи». */
  label: string;
  group: ModuleGroup;
  /** Коротке пояснення під підписом, якщо назви замало. */
  hint?: string;
  /**
   * Модуль неможливо вимкнути: перемикач показуємо ввімкненим і заблокованим.
   * Такий доступ мають усі, незалежно від ролі.
   */
  alwaysOn?: boolean;
  /**
   * Дзеркало `alwaysOn`: модуль неможливо ВВІМКНУТИ ролям поза цим предикатом.
   *
   * Навіщо. У решти модулів галочка = доступ. Але є розділи, дані яких ріже сама
   * база (RLS), — там галочка лише показує пункт меню. Увімкнена такій ролі, вона
   * привела б людину на порожній екран: не «немає доступу», а «зламана CRM».
   * Тому збережене `true` для невповноваженої ролі ігнорується, а перемикач у
   * «Ролях і доступах» показуємо заблокованим із поясненням.
   */
  restrictedTo?: (ctx: RoleContext) => boolean;
  /**
   * Ключ, від якого успадкувати значення для старих записів, де цього ключа
   * ще не існувало. Без цього розділення одного модуля на кілька мовчки
   * забрало б доступ у всіх, хто його мав.
   */
  inheritsFrom?: ModuleKey;
};

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  { key: "overview", label: "Огляд", group: "orders" },
  // Чотири пункти «замовлень» раніше сиділи на спільному ключі `orders`, тож
  // не можна було дати прорахунки без відвантаження. Розділили — а старі
  // записи успадковують те саме значення, щоб ніхто нічого не втратив.
  { key: "customers", label: "Замовники", group: "orders", inheritsFrom: "orders" },
  { key: "quotes", label: "Прорахунки", group: "orders", inheritsFrom: "orders" },
  { key: "orders", label: "Замовлення", group: "orders" },
  { key: "shipping", label: "До відвантаження", group: "orders", inheritsFrom: "orders" },

  { key: "catalog", label: "Каталог", group: "operations" },
  { key: "logistics", label: "Логістика", group: "operations" },
  { key: "design", label: "Дизайн", group: "operations" },
  { key: "contractors", label: "Підрядники та постачальники", group: "operations" },
  { key: "stock", label: "Склад", group: "operations" },
  { key: "marketing", label: "Маркетинг", group: "operations" },

  { key: "finance", label: "Фінанси", group: "finance" },
  { key: "vchasno", label: "Вчасно — завантаження", group: "finance" },
  {
    key: "vchasno_send",
    label: "Вчасно — надсилання",
    group: "finance",
    hint: "Надсилання контрагенту — лише уповноважена особа",
  },

  {
    key: "team",
    label: "Команда",
    group: "account",
    hint: "Доступний усім — вимкнути не можна",
    alwaysOn: true,
  },
  {
    key: "members_access",
    label: "Ролі та доступи",
    group: "account",
    hint: "Керування правами інших людей",
  },
  // Ключ лишається `nova_poshta` (він у базі), а підпис уже про весь розділ:
  // за ним стоять усі зовнішні сервіси, а не одна служба доставки.
  {
    key: "nova_poshta",
    label: "Інтеграції",
    group: "account",
    // Підпис навмисно про НАЛАШТУВАННЯ, а не про самі служби: за старим
    // «Нова Пошта; далі — Вчасно…» розбір карток тягнув сюди будь-який запит,
    // де звучала Нова Пошта, — навіть створення ТТН, яке роблять із замовлення.
    // Перелік потрапляє і в карту CRM для помічника, тож він має збігатися з
    // тим, що справді є на сторінці: інакше на питання «які в нас інтеграції»
    // приходить неповна відповідь.
    hint: "Ключі й підключення зовнішніх сервісів: Нова Пошта, Вчасно, Telegram, Dropbox, OpenAI",
  },
  { key: "pulse", label: "Пульс команди", group: "account", hint: "Аналітика активності" },
  {
    key: "dev",
    label: "Dev",
    group: "account",
    hint: "Беклог доробок, релізи, здоровʼя системи",
    // Дошку доробок і релізи база віддає лише власнику й SEO. Без цього
    // обмеження увімкнена галочка привела б людину на порожній екран.
    restrictedTo: ownerOrSeo,
  },
];

export const MODULE_KEYS = MODULE_DEFINITIONS.map((item) => item.key);

/**
 * Стартовий набір сторінок посади — що людина бачить у меню, поки їй нічого
 * не міняли руками.
 *
 * Дефолт потрібен у трьох місцях: новій людині без запису в `module_access`,
 * картці доступів у «Ролях і доступах» і режимі «Приміряти посаду» (там людини
 * немає взагалі, тож брати значення нема звідки). До 25.08.2026 дефолт жив
 * окремим `defaultFor` у кожного модуля — і половина ключів його просто не
 * мала: «Замовники», «Прорахунки», «Каталог», «До відвантаження» й «Логістика»
 * були вимкнені геть усім, включно з власником. У звичайному режимі цього не
 * бачив ніхто (у команди ключі записані явно), зате «приміряв менеджера»
 * показувало меню з чотирьох пунктів — без замовників, прорахунків і каталогу.
 *
 * Набори знято з того, що в людей цих посад справді стоїть у проді (заміряно
 * 25.08.2026). Посади, яких зараз ніхто не займає, зібрані за аналогією з
 * найближчою — і таблиця свідомо перелічує всі посади з JOB_ROLE_NAMES, щоб
 * нова посада не діставалась мовчки в запасний набір (тест це стереже).
 *
 * Дефолт нікому нічого не забирає: збережене значення завжди сильніше (див.
 * normalizeModuleAccess), тож правка тут міняє лише новачків і режим посади.
 */

/** Продажі: замовник → прорахунок → замовлення, плюс каталог і дизайн-дошка. */
const SALES_MENU: ModuleKey[] = ["overview", "customers", "quotes", "orders", "catalog", "design"];

/** Бухгалтерія: документи ходять навколо замовлення, від складу до підрядника. */
const ACCOUNTING_MENU: ModuleKey[] = [
  "overview",
  "customers",
  "quotes",
  "orders",
  "shipping",
  "catalog",
  "logistics",
  "stock",
  "contractors",
  "vchasno",
];

/** Маркетинг: матеріал — готові візуали, а не замовлення й ціни. */
const MARKETING_MENU: ModuleKey[] = ["overview", "design", "marketing"];

const ROLE_MENUS: Record<string, ModuleKey[]> = {
  // — Продажі —
  manager: SALES_MENU,
  sales_manager: SALES_MENU,
  junior_sales_manager: SALES_MENU,
  top_manager: SALES_MENU,
  office_manager: SALES_MENU,
  // PM веде замовлення далі за менеджера — звідси склад зразків і підрядники.
  pm: [...SALES_MENU, "stock", "contractors"],

  // — Дизайн —
  // Дизайнер працює з прорахунку: там і ТЗ, і замовник, і моделі з каталогу.
  designer: SALES_MENU,

  // — Виробництво —
  head_of_production: [...SALES_MENU, "stock", "logistics", "contractors"],
  // Друкар і пакувальник цін не бачать: їм треба замовлення, макет і склад.
  printer: ["overview", "orders", "catalog", "design", "stock"],
  packer: ["overview", "orders", "shipping", "catalog", "stock"],

  // — Логістика —
  head_of_logistics: [...SALES_MENU, "shipping", "logistics", "contractors"],
  logistics: ["overview", "customers", "orders", "shipping", "catalog", "logistics"],

  // — Бухгалтерія —
  // Молодший бухгалтер без «Фінансів»: їх ріже RLS (has_finance_access), і
  // галочка привела б його на порожній екран замість даних.
  junior_accountant: ACCOUNTING_MENU,
  accountant: [...ACCOUNTING_MENU, "finance"],
  chief_accountant: [...ACCOUNTING_MENU, "finance", "vchasno_send"],

  // — Маркетинг —
  marketer: MARKETING_MENU,
  smm: MARKETING_MENU,

  // — Решта —
  // IT тримає ключі до зовнішніх сервісів, але не веде продажі.
  it_specialist: ["overview", "orders", "catalog", "design", "nova_poshta"],
  // SEO — заступник власника: бачить усе, що йому дозволяє роль.
  seo: MODULE_KEYS,
};

/**
 * Посада не з довідника (вписана руками або порожня) — найбезпечніший мінімум,
 * а не «нічого»: людині все одно треба кудись зайти.
 */
const FALLBACK_MENU: ModuleKey[] = ["overview", "orders", "design"];

/** Rule 0: власник відкриває будь-яку сторінку повз галочки — див. docs/SECURITY.md. */
function roleMenu(ctx: RoleContext): ModuleKey[] {
  if (isOwner(ctx)) return MODULE_KEYS;
  return ROLE_MENUS[job(ctx)] ?? FALLBACK_MENU;
}

const DEFINITION_BY_KEY = new Map<ModuleKey, ModuleDefinition>(
  MODULE_DEFINITIONS.map((item) => [item.key, item])
);

export function getModuleDefinition(key: ModuleKey) {
  return DEFINITION_BY_KEY.get(key);
}

/** Модулі, згруповані для рендеру списку доступів. */
export const MODULE_GROUPS: Array<{ group: ModuleGroup; label: string; modules: ModuleDefinition[] }> = (
  ["orders", "operations", "finance", "account"] as ModuleGroup[]
).map((group) => ({
  group,
  label: MODULE_GROUP_LABELS[group],
  modules: MODULE_DEFINITIONS.filter((item) => item.group === group),
}));

/** Усі модулі відкриті — те, що фактично має owner (Rule 0). */
export function fullModuleAccess(): ModuleAccess {
  const result = {} as ModuleAccess;
  MODULE_KEYS.forEach((key) => {
    result[key] = true;
  });
  return result;
}

/**
 * Перетин доступів для режиму «Дивитись як»: показуємо модулі обраної посади,
 * але жодного, якого немає у власних.
 *
 * Без цього режим ставав би обхідним шляхом до чужих даних: доступи в CRM
 * персональні, а RLS у таблицях — командна (по team_id). Тобто відкривши
 * «Фінанси», яких у тебе немає, ти справді прочитав би їх із бази.
 */
export function intersectModuleAccess(own: ModuleAccess, target: ModuleAccess): ModuleAccess {
  const result = {} as ModuleAccess;
  MODULE_KEYS.forEach((key) => {
    result[key] = Boolean(own[key]) && Boolean(target[key]);
  });
  return result;
}

/**
 * Доступи «за замовчуванням» для посади — коли в `module_access` порожньо.
 * База і для нормалізації збереженого запису, і для нових запрошень, і для
 * режиму «Приміряти посаду». Набори — у ROLE_MENUS вище.
 */
export function defaultModuleAccess(ctx: RoleContext = {}): ModuleAccess {
  const menu = new Set(roleMenu(ctx));
  const result = {} as ModuleAccess;
  MODULE_DEFINITIONS.forEach((item) => {
    if (item.alwaysOn) {
      result[item.key] = true;
      return;
    }
    if (item.restrictedTo && !item.restrictedTo(ctx)) {
      result[item.key] = false;
      return;
    }
    result[item.key] = menu.has(item.key);
  });
  return result;
}

/**
 * Приводить збережений JSON до повного набору ключів.
 *
 * Порядок рішень для кожного модуля:
 *  1. `alwaysOn` — завжди true, збережене значення ігнорується;
 *  2. `restrictedTo` не пускає роль — завжди false, збережене ігнорується;
 *  3. явно записаний boolean;
 *  4. значення ключа-попередника (`inheritsFrom`) для старих записів;
 *  5. дефолт за роллю.
 */
export function normalizeModuleAccess(
  value: unknown,
  accessRole?: string | null,
  jobRole?: string | null
): ModuleAccess {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const ctx: RoleContext = { accessRole, jobRole };
  const defaults = defaultModuleAccess(ctx);
  const result = {} as ModuleAccess;

  MODULE_DEFINITIONS.forEach((item) => {
    if (item.alwaysOn) {
      result[item.key] = true;
      return;
    }
    // Роль поза списком уповноважених — збережене значення не має значення.
    if (item.restrictedTo && !item.restrictedTo(ctx)) {
      result[item.key] = false;
      return;
    }
    const stored = input[item.key];
    if (typeof stored === "boolean") {
      result[item.key] = stored;
      return;
    }
    if (item.inheritsFrom) {
      const legacy = input[item.inheritsFrom];
      if (typeof legacy === "boolean") {
        result[item.key] = legacy;
        return;
      }
    }
    result[item.key] = defaults[item.key];
  });

  return result;
}

/**
 * Ролі, яким фінанси відкриті НЕЗАЛЕЖНО від галочки в `module_access`.
 *
 * Це не зручність, а дзеркало бази: доступ до фінансових таблиць обмежений
 * RLS-функцією `has_finance_access`, і якщо інтерфейс порахує інакше, людина
 * побачить розділ, у якому кожен запит поверне порожньо. Тримаємо в реєстрі,
 * бо копій цієї умови вже було дві — у гейті маршруту й на сторінці доступів.
 */
export function hasDefaultFinanceAccess(accessRole?: string | null, jobRole?: string | null) {
  const role = (jobRole ?? "").trim().toLowerCase();
  return (
    (accessRole ?? "").trim().toLowerCase() === "owner" ||
    role === "seo" ||
    role === "accountant" ||
    role === "chief_accountant"
  );
}

/** true, якщо модуль дозволений. Незаписаний ключ трактуємо як «дозволено». */
export function hasModuleAccess(access: Partial<ModuleAccess> | null | undefined, key: ModuleKey) {
  const definition = DEFINITION_BY_KEY.get(key);
  if (definition?.alwaysOn) return true;
  /**
   * Для обмежених модулів правило перевернуте: потрібен ЯВНИЙ true.
   *
   * Саме через «незаписаний ключ = дозволено» приватні розділи досі гейтились
   * повз реєстр, вручну: новий ключ відкрив би розділ усім, у кого в
   * `module_access` лежить старий JSON без нього. Явний true ставить лише
   * normalizeModuleAccess — і лише після перевірки `restrictedTo`.
   */
  if (definition?.restrictedTo) return access?.[key] === true;
  return access?.[key] !== false;
}

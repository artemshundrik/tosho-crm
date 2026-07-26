/**
 * Єдиний реєстр модулів застосунку — джерело правди для доступів.
 *
 * До 2026-07-26 цей список був продубльований у шести місцях (бібліотека
 * довідника, TeamMembersPage, union у AppLayout, дві netlify-функції, SQL-дефолт)
 * і вже встиг розійтися: 13 ключів проти 10 проти 8 проти 7. Тепер усе, що
 * стосується модулів — ключі, підписи, порядок у UI, дефолти за роллю — живе
 * тут, а решта файлів імпортує.
 *
 * **Додаючи модуль**, достатньо дописати рядок у MODULE_DEFINITIONS і привʼязати
 * `moduleKey` до пункту сайдбару та до ModuleRouteGate у App.tsx.
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
  | "pulse";

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
const ownerSeoOrAccountant = (ctx: RoleContext) =>
  isOwner(ctx) || ["seo", "accountant", "chief_accountant"].includes(job(ctx));

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
  /** Чи ввімкнений за замовчуванням, якщо в module_access нічого не записано. */
  defaultFor?: (ctx: RoleContext) => boolean;
  /**
   * Ключ, від якого успадкувати значення для старих записів, де цього ключа
   * ще не існувало. Без цього розділення одного модуля на кілька мовчки
   * забрало б доступ у всіх, хто його мав.
   */
  inheritsFrom?: ModuleKey;
};

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  { key: "overview", label: "Огляд", group: "orders", defaultFor: () => true },
  // Чотири пункти «замовлень» раніше сиділи на спільному ключі `orders`, тож
  // не можна було дати прорахунки без відвантаження. Розділили — а старі
  // записи успадковують те саме значення, щоб ніхто нічого не втратив.
  { key: "customers", label: "Замовники", group: "orders", inheritsFrom: "orders" },
  { key: "quotes", label: "Прорахунки", group: "orders", inheritsFrom: "orders" },
  { key: "orders", label: "Замовлення", group: "orders", defaultFor: () => true },
  { key: "shipping", label: "До відвантаження", group: "orders", inheritsFrom: "orders" },

  // Дефолти нижче навмисно повторюють ті, що діяли до реєстру: каталог,
  // логістика й підрядники були вимкнені всім, крім власника.
  { key: "catalog", label: "Каталог", group: "operations" },
  { key: "logistics", label: "Логістика", group: "operations" },
  { key: "design", label: "Дизайн", group: "operations", defaultFor: () => true },
  { key: "contractors", label: "Підрядники та постачальники", group: "operations", defaultFor: isOwner },
  { key: "stock", label: "Склад", group: "operations", defaultFor: ownerOrSeo },
  { key: "marketing", label: "Маркетинг", group: "operations", defaultFor: (ctx) => ownerOrSeo(ctx) || job(ctx) === "marketer" },

  { key: "finance", label: "Фінанси", group: "finance", defaultFor: ownerSeoOrAccountant },
  { key: "vchasno", label: "Вчасно — завантаження", group: "finance", defaultFor: ownerSeoOrAccountant },
  {
    key: "vchasno_send",
    label: "Вчасно — надсилання",
    group: "finance",
    hint: "Надсилання контрагенту — лише уповноважена особа",
    defaultFor: (ctx) => isOwner(ctx) || job(ctx) === "chief_accountant",
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
    // Збігається з тими, хто має це зараз (owner + два SEO), тож перенесення
    // зі старого ключа `team` нікого не позбавляє доступу.
    defaultFor: ownerOrSeo,
  },
  { key: "nova_poshta", label: "Нова Пошта", group: "account", defaultFor: ownerOrSeo },
  { key: "pulse", label: "Пульс команди", group: "account", hint: "Аналітика активності", defaultFor: ownerOrSeo },
];

export const MODULE_KEYS = MODULE_DEFINITIONS.map((item) => item.key);

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

/**
 * Доступи «за замовчуванням» для ролі — коли в module_access порожньо.
 * Використовується і як база для нормалізації, і для нових запрошень.
 */
export function defaultModuleAccess(ctx: RoleContext = {}): ModuleAccess {
  const result = {} as ModuleAccess;
  MODULE_DEFINITIONS.forEach((item) => {
    result[item.key] = item.alwaysOn ? true : (item.defaultFor?.(ctx) ?? false);
  });
  return result;
}

/**
 * Приводить збережений JSON до повного набору ключів.
 *
 * Порядок рішень для кожного модуля:
 *  1. `alwaysOn` — завжди true, збережене значення ігнорується;
 *  2. явно записаний boolean;
 *  3. значення ключа-попередника (`inheritsFrom`) для старих записів;
 *  4. дефолт за роллю.
 */
export function normalizeModuleAccess(
  value: unknown,
  accessRole?: string | null,
  jobRole?: string | null
): ModuleAccess {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const ctx: RoleContext = { accessRole, jobRole };
  const result = {} as ModuleAccess;

  MODULE_DEFINITIONS.forEach((item) => {
    if (item.alwaysOn) {
      result[item.key] = true;
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
    result[item.key] = item.defaultFor?.(ctx) ?? false;
  });

  return result;
}

/** true, якщо модуль дозволений. Незаписаний ключ трактуємо як «дозволено». */
export function hasModuleAccess(access: Partial<ModuleAccess> | null | undefined, key: ModuleKey) {
  if (DEFINITION_BY_KEY.get(key)?.alwaysOn) return true;
  return access?.[key] !== false;
}

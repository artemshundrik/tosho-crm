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
    defaultFor: ownerOrSeo,
  },
  { key: "pulse", label: "Пульс команди", group: "account", hint: "Аналітика активності", defaultFor: ownerOrSeo },
  {
    key: "dev",
    label: "Dev",
    group: "account",
    hint: "Беклог доробок, релізи, здоровʼя системи",
    // Дефолт і обмеження — той самий предикат, що вже стоїть на «Складі» й
    // «Маркетингу». Дефолтом, а не галочкою вручну: інакше про доступ для
    // другого SEO згадають у найкращому разі через тиждень після найму.
    defaultFor: ownerOrSeo,
    // Дошку доробок і релізи база віддає лише власнику й SEO. Без цього
    // обмеження увімкнена галочка привела б людину на порожній екран.
    restrictedTo: ownerOrSeo,
  },
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
    if (item.alwaysOn) {
      result[item.key] = true;
      return;
    }
    if (item.restrictedTo && !item.restrictedTo(ctx)) {
      result[item.key] = false;
      return;
    }
    result[item.key] = item.defaultFor?.(ctx) ?? false;
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
    result[item.key] = item.defaultFor?.(ctx) ?? false;
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

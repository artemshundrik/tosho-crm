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

import { formatJobRole } from "./jobRoles";

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
  | "payroll"
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
   * Роль вирішує ПОВНІСТЮ: перемикач заблокований в обидва боки, збережене
   * значення не читається взагалі.
   *
   * Це не те саме, що `restrictedTo`. Там роль лише не дає ВВІМКНУТИ, а
   * всередині дозволених ролей галочка ще щось означає. Тут вона не означає
   * нічого: доступ ріже сама база, і будь-яке інше показання інтерфейсу —
   * обіцянка, якої ніхто не виконає. Саме через таку обіцянку 26.08.2026
   * бухгалтерка не бачила «Фінансів» при ввімкненому й заблокованому
   * перемикачі.
   */
  roleDecides?: (ctx: RoleContext) => boolean;
  /**
   * Роль дає доступ ЗАВЖДИ — зняти не можна, але решті людей перемикач
   * лишається звичайним. Проміжний випадок між `alwaysOn` і `roleDecides`.
   */
  forcedFor?: (ctx: RoleContext) => boolean;
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
  {
    key: "contractors",
    label: "Підрядники та постачальники",
    group: "operations",
    // Було зашито в TeamMembersPage окремим `if`. Тепер тут — щоб сторінка
    // доступів і меню читали одне й те саме.
    forcedFor: isOwner,
  },
  { key: "stock", label: "Склад", group: "operations", forcedFor: ownerOrSeo },
  { key: "marketing", label: "Маркетинг", group: "operations" },

  {
    key: "finance",
    label: "Фінанси",
    group: "finance",
    // Дзеркало `tosho.has_finance_access`: власник, SEO і три бухгалтерські
    // посади. Галочка тут не важить нічого — вирішує посада.
    roleDecides: (ctx) => hasDefaultFinanceAccess(ctx.accessRole, ctx.jobRole),
  },
  {
    key: "payroll",
    label: "Виплати команді",
    group: "finance",
    hint: "Зарплати, ставки й статус виплат — вкладка всередині «Фінансів»",
    // Вужче за «Фінанси» навмисно: бухгалтер веде рахунки й витрати, але не
    // бачить, хто скільки отримує (рішення CEO 26.08.2026). Дзеркало
    // `tosho.has_payroll_access` і політик `tosho.payroll_entries`.
    roleDecides: (ctx) => hasPayrollAccess(ctx.accessRole, ctx.jobRole),
  },
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
  // Прорахунки логісту потрібні: у них лежить, що саме й куди їде, ще до того
  // як прорахунок став замовленням.
  logistics: ["overview", "customers", "quotes", "orders", "shipping", "catalog", "logistics"],

  // — Бухгалтерія —
  // Усі три бухгалтерські посади мають «Фінанси» (рішення CEO 26.08.2026), але
  // жодна не має «Виплат команді»: зарплати колег — це власник і SEO.
  junior_accountant: [...ACCOUNTING_MENU, "finance"],
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
 *  2. `roleDecides` — відповідь дає роль, збережене не читається взагалі;
 *  3. `restrictedTo` не пускає роль — завжди false, збережене ігнорується;
 *  4. `forcedFor` дає роль — завжди true, зняти не можна;
 *  5. явно записаний boolean;
 *  6. значення ключа-попередника (`inheritsFrom`) для старих записів;
 *  7. дефолт за роллю.
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
    // Роль вирішує повністю — і «так», і «ні».
    if (item.roleDecides) {
      result[item.key] = item.roleDecides(ctx);
      return;
    }
    // Роль поза списком уповноважених — збережене значення не має значення.
    if (item.restrictedTo && !item.restrictedTo(ctx)) {
      result[item.key] = false;
      return;
    }
    if (item.forcedFor && item.forcedFor(ctx)) {
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
    role === "chief_accountant" ||
    role === "junior_accountant"
  );
}

/**
 * Виплати команді — ВУЖЧИЙ контур усередині Фінансів: власник і SEO, більше ніхто.
 *
 * Бухгалтер веде рахунки, витрати й податки, але не бачить, хто скільки
 * отримує. Це не «фінанси суворіше» — це інше питання й інша відповідь, тому й
 * функція окрема. Дзеркало `tosho.has_payroll_access` і політик
 * `tosho.payroll_entries`: розійдуться — людина побачить вкладку, у якій кожен
 * запит поверне порожньо.
 */
export function hasPayrollAccess(accessRole?: string | null, jobRole?: string | null) {
  return (
    (accessRole ?? "").trim().toLowerCase() === "owner" ||
    (jobRole ?? "").trim().toLowerCase() === "seo"
  );
}

/**
 * Що показати біля перемикача модуля в «Ролях і доступах».
 *
 * НАВІЩО ОКРЕМА ФУНКЦІЯ. Сторінка доступів роками показувала перемикачі, які
 * нічого не вмикали: у «Фінансах» галочка не важила (вирішувала посада), у
 * «Складі» й «Підрядниках» вона стояла заблокованою без жодного пояснення, а
 * «Виплат команді» в списку не було взагалі — хоча це найвужчий доступ у CRM.
 * Людина бачила галочку й розумно вважала, що та керує. Тепер кожен рядок
 * каже правду: або перемикач справді керує, або він заблокований і поруч
 * написано ЧОМУ.
 *
 * Одна функція на всі модулі навмисно: доти ці правила лежали трьома
 * локальними `if`-ами в TeamMembersPage — і саме тому розійшлися з меню.
 */
export type ModuleLock = {
  /** Значення, яке справді діє (не те, що лежить у профілі). */
  checked: boolean;
  /** Перемикач заблокований — його рішення ухвалене не тут. */
  locked: boolean;
  /** Чому саме так, людською мовою. null — перемикач вільний. */
  reason: string | null;
};

/** «Власник» / «Посада «Бухгалтер»» — підмет для пояснення. */
function roleSubject(ctx: RoleContext): string {
  if (isOwner(ctx)) return "Власник";
  const label = formatJobRole(ctx.jobRole);
  return label ? `Посада «${label}»` : "Ця посада";
}

export function describeModuleLock(
  key: ModuleKey,
  access: Partial<ModuleAccess> | null | undefined,
  ctx: RoleContext
): ModuleLock {
  const definition = DEFINITION_BY_KEY.get(key);
  if (!definition) return { checked: false, locked: true, reason: null };

  if (definition.alwaysOn) {
    return { checked: true, locked: true, reason: "Доступний усім — вимкнути не можна" };
  }

  if (definition.roleDecides) {
    const allowed = definition.roleDecides(ctx);
    return {
      checked: allowed,
      locked: true,
      reason: allowed
        ? `${roleSubject(ctx)} має цей доступ завжди — вимкнути не можна`
        : `${roleSubject(ctx)} цього не має — дані закриті в самій базі`,
    };
  }

  if (definition.restrictedTo && !definition.restrictedTo(ctx)) {
    return {
      checked: false,
      locked: true,
      reason: `${roleSubject(ctx)} цього не має — дані закриті в самій базі`,
    };
  }

  if (definition.forcedFor && definition.forcedFor(ctx)) {
    return { checked: true, locked: true, reason: `${roleSubject(ctx)} — вимкнути не можна` };
  }

  return { checked: hasModuleAccess(access, key), locked: false, reason: null };
}

/**
 * Чи показувати пункт модуля в меню.
 *
 * Винесено з AppLayout, бо тут це можна перевірити тестом, а в тілі гіганта —
 * ні. Рішення про маршрут (ModuleRouteGate у App.tsx) має спиратись на ті самі
 * правила: розбіжність між ними означає «розділ працює, але його не знайти».
 */
export function isModuleVisibleInMenu(
  key: ModuleKey,
  access: Partial<ModuleAccess> | null | undefined,
  ctx: { accessRole?: string | null; jobRole?: string | null; isSuperAdmin: boolean }
): boolean {
  const definition = DEFINITION_BY_KEY.get(key);
  /**
   * Роль вирішує повністю — галочку не питаємо взагалі.
   *
   * Саме тут і був розрив: сторінка доступів показувала перемикач «Фінансів»
   * увімкненим і заблокованим, гейт маршруту пускав за посадою, а меню
   * шанувало давнє `false` у профілі — і пункт зникав у людини, яка доступ
   * мала (26.08.2026).
   */
  if (definition?.roleDecides) {
    return definition.roleDecides({ accessRole: ctx.accessRole, jobRole: ctx.jobRole });
  }
  /**
   * Обмежений модуль («Dev») — рішення лише за нормалізованим доступом.
   *
   * Гілку власника нижче тут проходити НЕ можна: вона повертає true для
   * будь-якого ключа, і перший же модуль, до якого власника не пускає база,
   * показав би пункт у меню повз власне обмеження.
   */
  if (definition?.restrictedTo) return hasModuleAccess(access, key);

  /**
   * Явно знята галочка ховає пункт навіть у власника.
   *
   * Це не обмеження прав: доступ лишається (роут-гейт пропускає, RLS не
   * змінюється) — ховається саме пункт меню.
   */
  const hiddenExplicitly = access?.[key] === false;

  if (ctx.isSuperAdmin) return !hiddenExplicitly;
  return hasModuleAccess(access, key);
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

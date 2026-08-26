import { hasModuleAccess, type ModuleAccess, type ModuleKey } from "./moduleAccess";

/**
 * Реєстр можливостей CRM — джерело правди для розділу «Можливості».
 *
 * Живе в коді, а не в БД, свідомо: опис і кроки мають деплоїтися разом із
 * самою фічею, інакше текст тихо розходиться з інтерфейсом.
 *
 * **Додаючи можливість:** допиши рядок сюди і, якщо її використання можна
 * порахувати, — гілку в `tosho.refresh_feature_adoption()`
 * (scripts/feature-adoption-schema.sql) з ТИМ САМИМ ключем. Розбіжність
 * зловить `npm run check:feature-keys`.
 *
 * Стартуємо з трьох можливостей, потрібних усім (рішення CEO 2026-08-04):
 * заміри по проду показали, що Telegram-бот підключили 5 із 17, а голосовим
 * вводом за весь час скористалась одна людина тричі.
 */

export type FeatureKey =
  | "telegram_bot"
  | "voice_dictation"
  | "task_chat"
  | "absence_request"
  | "command_palette"
  | "nova_poshta_address"
  | "dropbox_folders";

/**
 * Розділ каталогу. Рейка ліворуч і лічильники в ній рахуються з цього поля,
 * тож новий розділ зʼявляється сам, щойно перша можливість його вкаже.
 */
export type FeatureCategory = "core" | "sales" | "design" | "ai" | "finance" | "team";

export const FEATURE_CATEGORY_ORDER: FeatureCategory[] = [
  "core",
  "sales",
  "design",
  "ai",
  "finance",
  "team",
];

export const FEATURE_CATEGORY_LABEL: Record<FeatureCategory, string> = {
  core: "Для всіх",
  sales: "Продажі та клієнти",
  design: "Дизайн і виробництво",
  ai: "AI-можливості",
  finance: "Фінанси та документи",
  team: "Команда",
};

export type FeatureDefinition = {
  key: FeatureKey;
  label: string;
  category: FeatureCategory;
  /** Один рядок людською мовою: що це дає, а не як влаштоване. */
  summary: string;
  /** Рівно три кроки «як зробити вперше». */
  steps: readonly [string, string, string];
  /** Модуль, від якого залежить доступ. `null` — доступно всім. */
  moduleKey: ModuleKey | null;
  /** Додаткове звуження всередині модуля. Порожньо — весь модуль. */
  jobRoles?: readonly string[];
  /** Куди веде кнопка «Спробувати». */
  route: string;
  /** ISO-дата появи — для фільтра «Нові». */
  since?: string;
  /**
   * Чи є проба використання в SQL. Для частини можливостей автора зміни в БД
   * не видно (напр. точки доставки в картці клієнта), тож особистий стан для
   * них не показуємо взагалі — краще нічого, ніж «не пробував» навмання.
   */
  measurable?: boolean;
};

export const FEATURE_DEFINITIONS: readonly FeatureDefinition[] = [
  {
    key: "telegram_bot",
    label: "Telegram-бот і помічник",
    category: "core",
    summary:
      "Один бот робить дві речі: шле робочі сповіщення в звичайний чат і відповідає на питання про задачі, дедлайни й воронку. Ним же оформлюють лікарняний і відпустку.",
    steps: [
      "Підключи акаунт: кнопка нижче, далі Start у боті",
      "Обери, про що писати — у CRM або командою /settings прямо в чаті",
      "Питай його звичайною мовою: «що горить сьогодні», «хворію», /help",
    ],
    moduleKey: null,
    route: "/profile",
    measurable: true,
  },
  {
    key: "voice_dictation",
    label: "Диктування голосом",
    category: "core",
    summary: "Наговори завдання — CRM розшифрує запис і сама почистить текст від зайвого.",
    steps: [
      "Постав курсор у поле «Технічне завдання»",
      "Натисни мікрофон праворуч і говори звичайним темпом",
      "Зупини запис — текст зʼявиться вже причесаним",
    ],
    moduleKey: null,
    route: "/design",
    since: "2026-07-01",
    measurable: true,
  },
  {
    key: "task_chat",
    label: "Обговорення в задачі",
    category: "core",
    summary: "Чат біля дизайн-задачі: домовленості лишаються там, де робота, а не в особистих.",
    steps: [
      "Відкрий дизайн-задачу — чат уже в правій колонці",
      "Пиши як завжди; згадка людини надішле їй сповіщення",
      "Важливе закріпи, щоб не загубилося",
    ],
    moduleKey: null,
    route: "/design",
    measurable: true,
  },
  {
    key: "absence_request",
    label: "Заявка на відсутність",
    category: "core",
    summary:
      "Відпустка чи лікарняний оформлюються з CRM: керівнику приходить погодження, а дні самі лягають у планер.",
    steps: [
      "Команда → вкладка «Відсутності» → «Подати заявку»",
      "Обери тип і дати — залишок днів порахується сам",
      "Стежити за рішенням можна там само, воно прийде сповіщенням",
    ],
    moduleKey: "team",
    route: "/team",
    measurable: true,
  },
  {
    key: "command_palette",
    label: "Швидкий перехід ⌘K",
    category: "core",
    summary:
      "Одне вікно замість блукання меню: набери назву клієнта, номер прорахунку чи розділ — і одразу опинишся там.",
    steps: [
      "Натисни ⌘K (на Windows — Ctrl+K) будь-де в CRM",
      "Почни писати: назву замовника, номер прорахунку або розділ",
      "Enter — і ти на місці; стрілками можна ходити списком",
    ],
    moduleKey: null,
    route: "/overview",
    // Натискання клавіш ніде не пишуться, тож стан не показуємо.
    measurable: false,
  },
  {
    key: "nova_poshta_address",
    label: "Підказки адрес",
    category: "sales",
    summary:
      "Місто й вулицю підказує довідник Нової Пошти — це вся Україна, а не лише їхні відділення. Не треба відкривати чужий сайт і копіювати руками.",
    steps: [
      "Відкрий картку замовника → вкладка «Логістика»",
      "СПОЧАТКУ місто: набери «Киї» й обери зі списку — без міста вулиці не шукаються",
      "Далі допиши вулицю — підказки підхопляться вже по обраному місту",
    ],
    moduleKey: "customers",
    route: "/orders/customers",
    since: "2026-07-21",
    // У картці замовника немає колонки автора зміни, тож достовірної проби
    // «хто саме заповнював» не існує — краще без стану, ніж навмання.
    measurable: false,
  },
  {
    key: "dropbox_folders",
    label: "Папки Dropbox замовника",
    category: "sales",
    summary:
      "У замовника своя папка з підпапкою «Бренд»: макети й вихідники лежать за однаковою структурою, а не в кого де.",
    steps: [
      "Замовники → меню в рядку клієнта → «Створити папку Dropbox»",
      "Якщо папка вже є на диску — «Прив'язати папку Dropbox»",
      "Далі «Відкрити папку» відкриває її одним кліком із картки",
    ],
    moduleKey: "customers",
    route: "/orders/customers",
    measurable: false,
  },
] as const;

export const FEATURE_KEYS: FeatureKey[] = FEATURE_DEFINITIONS.map((item) => item.key);

export const MEASURABLE_FEATURE_KEYS: FeatureKey[] = FEATURE_DEFINITIONS.filter(
  (item) => item.measurable
).map((item) => item.key);

export type FeatureViewerContext = {
  access: ModuleAccess | undefined;
  accessRole: string | null;
  jobRole: string | null;
};

/** Власник — над модульними гейтами, як `isSuperAdmin` у сайдбарі. */
function isOwner(ctx: FeatureViewerContext): boolean {
  return (ctx.accessRole ?? "").trim().toLowerCase() === "owner";
}

/**
 * Власник і CEO не звужуються за посадою — це задум, а не діра в правах.
 * Повторює хелпер `ownerOrSeo` із moduleAccess.ts.
 */
function isPrivileged(ctx: FeatureViewerContext): boolean {
  if (isOwner(ctx)) return true;
  return (ctx.jobRole ?? "").trim().toLowerCase() === "seo";
}

export function isFeatureVisible(def: FeatureDefinition, ctx: FeatureViewerContext): boolean {
  // Власник бачить усе — так само, як у сайдбарі, де гілка isSuperAdmin
  // обходить перевірку модуля. Дефолти посад (ROLE_MENUS у moduleAccess.ts)
  // власнику й так віддають усе, але покладатись на них тут не варто: у
  // контекст може прийти запис із бази, де щось знято руками.
  if (isOwner(ctx)) return true;

  // Увага: hasModuleAccess дозволяє за замовчуванням — відсутній ключ читається
  // як «доступ є». Тому сюди має приходити повний набір із defaultModuleAccess
  // чи normalizeModuleAccess, де кожен ключ проставлений явно.
  if (def.moduleKey && !hasModuleAccess(ctx.access, def.moduleKey)) return false;
  if (!def.jobRoles?.length) return true;
  if (isPrivileged(ctx)) return true;
  return def.jobRoles.includes((ctx.jobRole ?? "").trim().toLowerCase());
}

export function visibleFeatures(ctx: FeatureViewerContext): FeatureDefinition[] {
  return FEATURE_DEFINITIONS.filter((def) => isFeatureVisible(def, ctx));
}

export type FeatureGroup = {
  category: FeatureCategory;
  label: string;
  features: FeatureDefinition[];
};

/**
 * Групує можливості за розділами у сталому порядку. Порожні розділи
 * відкидаємо: у рейці не має бути пунктів, які нікуди не ведуть.
 */
export function groupFeatures(features: FeatureDefinition[]): FeatureGroup[] {
  return FEATURE_CATEGORY_ORDER.map((category) => ({
    category,
    label: FEATURE_CATEGORY_LABEL[category],
    features: features.filter((def) => def.category === category),
  })).filter((group) => group.features.length > 0);
}

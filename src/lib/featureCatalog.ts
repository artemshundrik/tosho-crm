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

export type FeatureKey = "telegram_bot" | "voice_dictation" | "task_chat";

export type FeatureDefinition = {
  key: FeatureKey;
  label: string;
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
    label: "Telegram-бот",
    summary: "Дедлайни, нагадування по клієнтах і події команди приходять у звичайний чат.",
    steps: [
      "Профіль → «Сповіщення» → «Підключити Telegram»",
      "Натисни кнопку — бот відкриється сам і напише «готово»",
      "Там же обери, про що писати, а про що ні",
    ],
    moduleKey: null,
    route: "/profile",
    measurable: true,
  },
  {
    key: "voice_dictation",
    label: "Диктування голосом",
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

/**
 * Власник і SEO бачать усе — це задум, а не діра в правах.
 * Повторює хелпер `ownerOrSeo` із moduleAccess.ts.
 */
function isPrivileged(ctx: FeatureViewerContext): boolean {
  const access = (ctx.accessRole ?? "").trim().toLowerCase();
  if (access === "owner") return true;
  return (ctx.jobRole ?? "").trim().toLowerCase() === "seo";
}

export function isFeatureVisible(def: FeatureDefinition, ctx: FeatureViewerContext): boolean {
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

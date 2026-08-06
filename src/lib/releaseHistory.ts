/**
 * Історія релізів: переклад технічних комітів на людську мову й підсумки за
 * період.
 *
 * НАВІЩО ОКРЕМО ВІД «Що нового»: стрічка показує ВИДИМЕ — те, що помітить
 * людина. Історія релізів показує ЗРОБЛЕНЕ, включно з дрібницями, яких у
 * стрічці свідомо немає. Це два різні питання й дві різні аудиторії.
 */

export type ReleaseChange = {
  sha: string;
  type: string;
  scope: string | null;
  subject: string;
};

export type Release = {
  id: string;
  releasedAt: string;
  title: string | null;
  changes: ReleaseChange[];
};

/** Типи комітів людською. Порядок — за важливістю для читача. */
export const CHANGE_TYPE_ORDER = ["feat", "fix", "perf", "refactor", "style", "other"] as const;

export const CHANGE_TYPE_LABEL: Record<string, string> = {
  feat: "нове",
  fix: "виправлення",
  perf: "швидкодія",
  refactor: "переробка",
  style: "оформлення",
  test: "тести",
  other: "інше",
};

/** Тон типу — щоб зведення читалось із першого погляду. */
export const CHANGE_TYPE_TONE: Record<string, string> = {
  feat: "bg-success-soft text-success-foreground",
  fix: "bg-warning-soft text-warning-foreground",
  perf: "bg-info-soft text-info-foreground",
  refactor: "bg-secondary text-muted-foreground",
  style: "bg-secondary text-muted-foreground",
  test: "bg-secondary text-muted-foreground",
  other: "bg-secondary text-muted-foreground",
};

/** Заливка смуги розподілу. Кольори ті самі, що в чипах типів. */
export const CHANGE_TYPE_BAR: Record<string, string> = {
  feat: "bg-success/70",
  fix: "bg-warning/65",
  perf: "bg-info/60",
  refactor: "bg-muted-foreground/30",
  style: "bg-muted-foreground/22",
  test: "bg-muted-foreground/22",
  other: "bg-muted-foreground/16",
};

/**
 * Скоупи комітів → назви розділів CRM. Невідомий скоуп показуємо як є:
 * краще технічне слово, ніж вигадана назва.
 *
 * Кілька скоупів навмисно ведуть на ту саму назву (np і nova-poshta, finance
 * і finances): це один розділ CRM, який у комітах називали по-різному, і в
 * підсумках вони мають рахуватись разом. Зведення групує за НАЗВОЮ, тож
 * склейка відбувається сама.
 */
export const SCOPE_LABEL: Record<string, string> = {
  // Продукт
  features: "Можливості",
  updates: "Анонси",
  quotes: "Прорахунки",
  orders: "Замовлення",
  customers: "Замовники",
  contractors: "Підрядники",
  catalog: "Каталог",
  marketing: "Маркетинг",
  print: "Друк",
  // Дизайн
  design: "Дизайн",
  "design-task": "Дизайн-задача",
  "design/team": "Дизайн і команда",
  designers: "Дизайнери",
  // Люди й гроші
  team: "Команда",
  payroll: "Виплати",
  finances: "Фінанси",
  finance: "Фінанси",
  profile: "Профіль",
  invites: "Запрошення",
  invite: "Запрошення",
  access: "Доступи",
  auth: "Доступи",
  admin: "Адмінка",
  // Спілкування
  chat: "Обговорення",
  telegram: "Telegram",
  bot: "Telegram-бот",
  notifications: "Сповіщення",
  digests: "Дайджести",
  digest: "Дайджести",
  // Логістика
  np: "Нова Пошта",
  "nova-poshta": "Нова Пошта",
  address: "Адреси",
  logistics: "Логістика",
  dropbox: "Dropbox",
  // Каркас і оформлення
  ui: "Інтерфейс",
  nav: "Навігація",
  sidebar: "Бічне меню",
  layout: "Каркас",
  kanban: "Дошка",
  tokens: "Дизайн-токени",
  fonts: "Шрифти",
  // Під капотом
  ops: "Інфраструктура",
  functions: "Серверні функції",
  hooks: "Серверні хуки",
  "deploy-hook": "Деплой",
  bundle: "Збірка",
  app: "Застосунок",
  observability: "Спостережність",
};

export function scopeLabel(scope: string | null): string {
  if (!scope) return "Інше";
  return SCOPE_LABEL[scope] ?? scope;
}

export function typeLabel(type: string): string {
  return CHANGE_TYPE_LABEL[type] ?? type;
}

export type PeriodSummary = {
  releases: number;
  changes: number;
  /** Скільки чого, у порядку CHANGE_TYPE_ORDER. */
  byType: Array<{ type: string; count: number }>;
  /** Найбільш зачеплені розділи, від найбільшого. */
  topScopes: Array<{ scope: string; count: number }>;
};

/** Невідомий тип падає в «інше», а не губиться — сума завжди сходиться. */
function countByType(changes: ReleaseChange[]): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const change of changes) {
    const type = CHANGE_TYPE_ORDER.includes(change.type as (typeof CHANGE_TYPE_ORDER)[number])
      ? change.type
      : "other";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return CHANGE_TYPE_ORDER.filter((type) => counts.has(type)).map((type) => ({
    type,
    count: counts.get(type) as number,
  }));
}

export function summarize(releases: Release[], scopeLimit = 4): PeriodSummary {
  const all = releases.flatMap((release) => release.changes);
  const scopeCounts = new Map<string, number>();

  for (const change of all) {
    const scope = scopeLabel(change.scope);
    scopeCounts.set(scope, (scopeCounts.get(scope) ?? 0) + 1);
  }

  return {
    releases: releases.length,
    changes: all.length,
    byType: countByType(all),
    topScopes: Array.from(scopeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, scopeLimit)
      .map(([scope, count]) => ({ scope, count })),
  };
}

/** Зміна, відірвана від свого релізу, тож дату несе з собою. */
export type ScopedChange = ReleaseChange & { releasedAt: string };

export type ScopeBucket = {
  /** Назва розділу людською — вона ж ключ склейки різних скоупів. */
  scope: string;
  total: number;
  /** Розподіл за типами, у порядку CHANGE_TYPE_ORDER. */
  byType: Array<{ type: string; count: number }>;
  changes: ScopedChange[];
};

/**
 * Розподіл роботи за розділами — головне питання історії релізів. «Скільки
 * зроблено» без «куди пішло» нічого не пояснює: 112 змін за місяць виглядають
 * однаково, чи то був один великий розділ, чи дванадцять дрібних.
 */
export function scopeBreakdown(releases: Release[]): ScopeBucket[] {
  const buckets = new Map<string, ScopeBucket>();

  for (const release of releases) {
    for (const change of release.changes) {
      const scope = scopeLabel(change.scope);
      const bucket = buckets.get(scope) ?? { scope, total: 0, byType: [], changes: [] };
      bucket.total += 1;
      bucket.changes.push({ ...change, releasedAt: release.releasedAt });
      buckets.set(scope, bucket);
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => ({ ...bucket, byType: countByType(bucket.changes) }))
    .sort((a, b) => b.total - a.total || a.scope.localeCompare(b.scope, "uk"));
}

/**
 * Скільки різних днів було роботи. Не дорівнює кількості релізів: відновлена
 * історія має один запис на день, а нові релізи пишуться на кожен пуш, тож в
 * один день їх може бути кілька.
 */
export function workingDays(releases: Release[]): number {
  return new Set(releases.map((release) => release.releasedAt.slice(0, 10))).size;
}

/**
 * Зміна до попереднього періоду, у відсотках. Null, якщо порівнювати нема з
 * чим — показувати «+100%» на першому місяці було б брехнею.
 */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Порівняння ТЕМПУ, а не підсумків.
 *
 * НАВІЩО САМЕ ТАК: поточний місяць завжди недожитий, а найдавніший у вибірці
 * обрізаний межею відновлення історії. Порівняння сум дає дичину — 112 змін за
 * 6 днів проти 161 за 9 читається як «−30%, роботи стало менше», хоча темп
 * насправді трохи вищий. Змін за день від довжини періоду не залежить.
 */
export function paceDelta(current: Release[], previous: Release[]): number | null {
  const rate = (releases: Release[]) => {
    const days = workingDays(releases);
    if (days === 0) return 0;
    return releases.reduce((sum, release) => sum + release.changes.length, 0) / days;
  };
  return deltaPercent(rate(current), rate(previous));
}

/**
 * Назви місяців у трьох відмінках. Intl дає лише називний, а в тексті нам
 * потрібні всі три: «Серпень 2026», «змін у серпні», «темп до липня». З Intl
 * виходило б «змін у серпень», і це помітно з першого погляду.
 *
 * Ключ періоду скрізь у форматі YYYY-MM.
 */
const MONTH_NOMINATIVE = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"]; // prettier-ignore
const MONTH_LOCATIVE = ["січні","лютому","березні","квітні","травні","червні","липні","серпні","вересні","жовтні","листопаді","грудні"]; // prettier-ignore
const MONTH_GENITIVE = ["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"]; // prettier-ignore

function monthIndex(key: string): number | null {
  const month = Number(key.slice(5, 7));
  return month >= 1 && month <= 12 ? month - 1 : null;
}

/** «Серпень 2026» — заголовок розділу. */
export function monthTitle(key: string): string {
  const index = monthIndex(key);
  return index === null ? key : `${MONTH_NOMINATIVE[index]} ${key.slice(0, 4)}`;
}

/** «серпні» — для «змін у …». */
export function monthIn(key: string): string {
  const index = monthIndex(key);
  return index === null ? key : MONTH_LOCATIVE[index];
}

/** «липня» — для «темп до …». */
export function monthOf(key: string): string {
  const index = monthIndex(key);
  return index === null ? key : MONTH_GENITIVE[index];
}

/** Групування за місяцем — саме в такому масштабі питають «скільки зроблено». */
export function groupByMonth(releases: Release[]): Array<{ key: string; releases: Release[] }> {
  const map = new Map<string, Release[]>();
  for (const release of releases) {
    const key = release.releasedAt.slice(0, 7);
    const list = map.get(key) ?? [];
    list.push(release);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => ({ key, releases: list }));
}

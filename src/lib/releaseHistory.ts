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

/**
 * Скоупи комітів → назви розділів CRM. Невідомий скоуп показуємо як є:
 * краще технічне слово, ніж вигадана назва.
 */
export const SCOPE_LABEL: Record<string, string> = {
  features: "Можливості",
  updates: "Анонси",
  nav: "Навігація",
  ui: "Інтерфейс",
  quotes: "Прорахунки",
  orders: "Замовлення",
  customers: "Замовники",
  design: "Дизайн",
  finances: "Фінанси",
  team: "Команда",
  profile: "Профіль",
  address: "Адреси",
  catalog: "Каталог",
  marketing: "Маркетинг",
  telegram: "Telegram",
  auth: "Доступи",
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

export function summarize(releases: Release[], scopeLimit = 4): PeriodSummary {
  const typeCounts = new Map<string, number>();
  const scopeCounts = new Map<string, number>();
  let changes = 0;

  for (const release of releases) {
    for (const change of release.changes) {
      changes += 1;
      const type = CHANGE_TYPE_ORDER.includes(change.type as (typeof CHANGE_TYPE_ORDER)[number])
        ? change.type
        : "other";
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      const scope = scopeLabel(change.scope);
      scopeCounts.set(scope, (scopeCounts.get(scope) ?? 0) + 1);
    }
  }

  return {
    releases: releases.length,
    changes,
    byType: CHANGE_TYPE_ORDER.filter((type) => typeCounts.has(type)).map((type) => ({
      type,
      count: typeCounts.get(type) as number,
    })),
    topScopes: Array.from(scopeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, scopeLimit)
      .map(([scope, count]) => ({ scope, count })),
  };
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

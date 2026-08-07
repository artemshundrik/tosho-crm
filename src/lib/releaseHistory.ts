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
  /**
   * Час самого коміта. Необов'язковий: записи, зроблені до того, як recorder
   * почав його зберігати, його не мають — там показуємо зміну без часу, а не
   * підставляємо час релізу, бо це були б вигадані хвилини.
   */
  at?: string;
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
 * Заливка смуги розподілу — з канонічної палітри графіків, а не зі статусних
 * токенів: warning-foreground це темна печена помаранч для тексту попередження,
 * і в смузі вона виглядає брудно.
 *
 * Кольорами позначені лише два типи, які насправді читають: нове й
 * виправлення. Решта — сірим одним тоном, бо це 26 змін із 273, і три різні
 * відтінки сірого в легенді лише засмічують її. Точний розклад видно в чипах,
 * коли розділ розгорнути.
 */
export const CHANGE_TYPE_BAR: Record<string, string> = {
  feat: "bg-chart-3",
  fix: "bg-chart-7",
  perf: "bg-muted-foreground/35",
  refactor: "bg-muted-foreground/35",
  style: "bg-muted-foreground/35",
  test: "bg-muted-foreground/35",
  other: "bg-muted-foreground/35",
};

/** Легенда: два кольори плюс «решта» одним рядком. */
export function legendTotals(
  byType: Array<{ type: string; count: number }>
): Array<{ type: string; label: string; count: number }> {
  const named = byType.filter((item) => item.type === "feat" || item.type === "fix");
  const rest = byType
    .filter((item) => item.type !== "feat" && item.type !== "fix")
    .reduce((sum, item) => sum + item.count, 0);

  return [
    ...named.map((item) => ({ type: item.type, label: typeLabel(item.type), count: item.count })),
    ...(rest > 0 ? [{ type: "other", label: "решта", count: rest }] : []),
  ];
}

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
  releases: "Релізи",
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

export type DayGroup = {
  /** YYYY-MM-DD */
  day: string;
  changes: ScopedChange[];
  byType: Array<{ type: string; count: number }>;
};

/**
 * Один день = один запис, навіть якщо пушів того дня було кілька. Людина питає
 * «що зроблено сьогодні», а не «що було в третьому пуші».
 */
export function groupByDay(releases: Release[]): DayGroup[] {
  const map = new Map<string, ScopedChange[]>();

  for (const release of releases) {
    const day = release.releasedAt.slice(0, 10);
    const list = map.get(day) ?? [];
    for (const change of release.changes) {
      list.push({ ...change, releasedAt: change.at ?? release.releasedAt });
    }
    map.set(day, list);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, changes]) => ({
      day,
      changes: changes.sort((a, b) => a.releasedAt.localeCompare(b.releasedAt)),
      byType: countByType(changes),
    }));
}

/**
 * Часті слова, які збігаються в будь-яких двох темах і тому нічого не кажуть
 * про спорідненість. «коли» тут теж: як окреме слово воно порожнє, а всередині
 * лапок його ловить окреме правило.
 */
const NOISE_STEMS = new Set([
  "біль",
  "коли",
  "нема",
  "післ",
  "пере",
  "чере",
  "тепе",
  "тіль",
  "ютьс",
  "ться",
  "може",
  "було",
  "буде",
  "одра",
  "разо",
]);

/**
 * Грубий стем: чотирьох літер вистачає, щоб «версія», «версій» і «версії»
 * зійшлися, і мало, щоб «версія» злилася з «верстка». Повноцінна морфологія
 * тут не потрібна — ми не шукаємо сенс, лише спорідненість двох рядків.
 */
function stems(subject: string): Set<string> {
  const words = subject
    .toLowerCase()
    .replace(/[«»„“”"'(),.:;—–\-/]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4)
    .map((word) => word.slice(0, 4))
    .filter((stem) => !NOISE_STEMS.has(stem) && !/^\d+$/.test(stem));
  return new Set(words);
}

/** Фрази в лапках — найсильніша ознака спільної теми: це назва самої фічі. */
function quoted(subject: string): Set<string> {
  return new Set(
    [...subject.matchAll(/«([^»]{3,40})»/g)].map((match) => match[1].trim().toLowerCase())
  );
}

function intersects(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const item of a) if (b.has(item)) count += 1;
  return count;
}

export type Thread = {
  id: string;
  /** Заголовок = тема головної зміни. Нічого не вигадуємо. */
  title: string;
  lead: ScopedChange;
  rest: ScopedChange[];
  count: number;
  scopes: string[];
  byType: Array<{ type: string; count: number }>;
  from: string;
  to: string;
};

/**
 * Склейка змін одного дня в сюжети.
 *
 * НАВІЩО: три окремі коміти про «коли був» — це насправді одна закінчена
 * справа. Списком із тринадцяти рядків це читається як шум; п'ятьма сюжетами —
 * як зроблена робота. Саме заради цього розділ і існує.
 *
 * Спорідненими вважаємо зміни зі спільною фразою в лапках або з двома
 * спільними основами слів. Заголовок беремо в головної зміни (нове важливіше
 * за виправлення, за рівності — раніше за часом), а не вигадуємо: вигаданий
 * заголовок гірший за технічний, бо йому не можна вірити.
 */
export function buildThreads(changes: ScopedChange[]): Thread[] {
  const items = changes.map((change) => ({
    change,
    stems: stems(change.subject),
    quoted: quoted(change.subject),
  }));

  // Union-find: спорідненість транзитивна, інакше ланцюжок A–B–C розпадеться.
  const parent = items.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const sharedQuote = intersects(items[i].quoted, items[j].quoted) > 0;
      const sharedStems = intersects(items[i].stems, items[j].stems);
      if (sharedQuote || sharedStems >= 2) union(i, j);
    }
  }

  const clusters = new Map<number, ScopedChange[]>();
  items.forEach((item, index) => {
    const root = find(index);
    const list = clusters.get(root) ?? [];
    list.push(item.change);
    clusters.set(root, list);
  });

  const rank = (change: ScopedChange) => (change.type === "feat" ? 0 : change.type === "fix" ? 1 : 2);

  return Array.from(clusters.values())
    .map((group) => {
      const sorted = [...group].sort((a, b) => a.releasedAt.localeCompare(b.releasedAt));
      const lead = [...sorted].sort((a, b) => rank(a) - rank(b))[0];
      return {
        id: lead.sha,
        title: lead.subject,
        lead,
        rest: sorted.filter((change) => change.sha !== lead.sha),
        count: sorted.length,
        scopes: Array.from(new Set(sorted.map((change) => scopeLabel(change.scope)))),
        byType: countByType(sorted),
        from: sorted[0].releasedAt,
        to: sorted[sorted.length - 1].releasedAt,
      };
    })
    .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
}

export type MonthTotals = {
  key: string;
  changes: number;
  days: number;
  perDay: number;
  /** Найраніший день місяця у вибірці — щоб позначити обрізаний початок. */
  firstDay: string;
};

/**
 * Підсумки по місяцях для смуги «місяць до місяця».
 *
 * ГОЧА: місяці у вибірці майже ніколи не повні — поточний ще триває, а
 * найдавніший обрізаний межею відновлення історії. Смуга за обсягом це
 * показує чесно тільки разом із підписом, скільки днів у місяці враховано;
 * firstDay існує саме для того, щоб такий місяць було чим позначити. Без
 * підпису коротша смуга читається як «менше працювали», і це неправда.
 */
export function monthTotals(groups: Array<{ key: string; releases: Release[] }>): MonthTotals[] {
  return groups.map((group) => {
    const days = workingDays(group.releases);
    const changes = group.releases.reduce((sum, release) => sum + release.changes.length, 0);
    const dates = group.releases.map((release) => release.releasedAt.slice(0, 10)).sort();
    return {
      key: group.key,
      changes,
      days,
      perDay: days === 0 ? 0 : Math.round((changes / days) * 10) / 10,
      firstDay: dates[0] ?? `${group.key}-01`,
    };
  });
}

export type ScopeComparison = {
  scope: string;
  current: number;
  previous: number;
  /** Наскільки більше чи менше, у штуках. */
  delta: number;
  byType: Array<{ type: string; count: number }>;
  /** Зміни обох періодів, найновіші першими. */
  changes: ScopedChange[];
};

/**
 * Зіставлення розділів двох періодів: скільки в кожному цього місяця, скільки
 * було минулого. Саме тут видно, куди перемістилась робота — підсумки цього
 * не кажуть.
 *
 * Порядок: спершу за поточним місяцем, потім за минулим, щоб розділи, які
 * цього місяця не чіпали, не губились унизу без пояснення.
 */
export function compareScopes(current: Release[], previous: Release[]): ScopeComparison[] {
  const currentBuckets = new Map(scopeBreakdown(current).map((b) => [b.scope, b]));
  const previousBuckets = new Map(scopeBreakdown(previous).map((b) => [b.scope, b]));
  const scopes = new Set([...currentBuckets.keys(), ...previousBuckets.keys()]);

  return Array.from(scopes)
    .map((scope) => {
      const now = currentBuckets.get(scope);
      const before = previousBuckets.get(scope);
      return {
        scope,
        current: now?.total ?? 0,
        previous: before?.total ?? 0,
        delta: (now?.total ?? 0) - (before?.total ?? 0),
        byType: now?.byType ?? before?.byType ?? [],
        changes: [...(now?.changes ?? []), ...(before?.changes ?? [])].sort((a, b) =>
          b.releasedAt.localeCompare(a.releasedAt)
        ),
      };
    })
    .sort(
      (a, b) =>
        b.current - a.current || b.previous - a.previous || a.scope.localeCompare(b.scope, "uk")
    );
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

// Стек CRM — спільна логіка для сторінки, крона й нічного звіту.
//
// ЧОМУ ОДИН МОДУЛЬ НА ТРЬОХ. Той самий набір пакетів оцінюють три різні місця:
// сторінка «Стек» малює рядки, крон питає npm і пише в базу, звіт «Система за
// ніч» переказує стан одним рядком. Дві копії правила «що вважати major»
// розійшлися б за місяць — і бот почав би заспокоювати там, де сторінка
// червоніє. Так уже було з порогами здоров'я (див. systemHealthThresholds).
//
// Модуль навмисно БЕЗ імпортів з `@/`: netlify-функції збираються власним
// tsconfig без аліасів і тягнуть його відносним шляхом, як _systemHealth тягне
// systemHealthThresholds.

import { pluralUk, pluralWordUk } from "./lastSeen";

/* ─────────────────────────── типи знімка ─────────────────────────── */

/** Поверх будівлі. Порядок тут = порядок на сторінці, згори вниз. */
export type StackLayer = "screen" | "data" | "build" | "platform";

export type StackPackageSnapshot = {
  name: string;
  /** ВСТАНОВЛЕНА версія (з package-lock), а не діапазон із package.json. */
  version: string;
  layer: StackLayer;
  dev: boolean;
  /** Коли ми востаннє рухали версію цього пакета — з історії package.json. */
  bumpedAt: string | null;
  /**
   * Лого пакета: фавікон домену проєкту або аватарка організації на GitHub.
   * null — покажемо монограму, це нормальний, а не поламаний стан.
   */
  iconUrl?: string | null;
  /**
   * Шар вгадано евристикою, а не вписано явно. Присутність цього поля валить
   * pre-push: сторінка про будову CRM не має цю будову вигадувати.
   */
  layerGuessed?: boolean;
};

/** Те, що знає про себе репозиторій. Генерує scripts/build-stack-snapshot.mjs. */
export type StackSnapshot = {
  generatedAt: string;
  packages: StackPackageSnapshot[];
  /** Назви перевірок з гака pre-push, у порядку запуску. */
  guards: string[];
  tests: number | null;
  testFiles: number | null;
  lintStubs: number | null;
  node: string;
  netlifyFunctions: number;
  sourceLines: number;
};

/* ────────────────────── типи того, що знає npm ────────────────────── */

export type AdvisorySeverity = "low" | "moderate" | "high" | "critical";

export type StackAdvisory = {
  title: string;
  severity: AdvisorySeverity;
  url?: string | null;
};

/** Рядок tosho.stack_versions — відповідь npm, покладена кроном у базу. */
export type StackVersionRow = {
  name: string;
  latest_version: string | null;
  latest_seen_at: string | null;
  checked_at: string | null;
  advisories: StackAdvisory[] | null;
  /**
   * Версія, про яку питали npm, складаючи `advisories`.
   *
   * Без неї дірки безпеки — це відповідь невідомо про що. Саме так сторінка
   * один раз і збрехала: після оновлення pdfjs чипс «свіже» стояв поруч із
   * червоним «діра безпеки · висока», бо в рядку лежала відповідь про
   * попередню версію.
   */
  advisories_version: string | null;
};

/* ──────────────────────────── стан пакета ─────────────────────────── */

/**
 * Наскільки ми відстали. Слово «unknown» — це не помилка, а чесна відповідь:
 * крон ще не питав про цей пакет (щойно додали) або npm не відповів.
 */
export type StackState = "fresh" | "patch" | "minor" | "major" | "unknown";

export type StackItem = StackPackageSnapshot & {
  latest: string | null;
  /** Коли МИ вперше побачили цю нову версію — «висить третій місяць». */
  latestSeenAt: string | null;
  checkedAt: string | null;
  state: StackState;
  advisories: StackAdvisory[];
  /** Найгірша серед дірок безпеки; null — дірок немає. */
  worstSeverity: AdvisorySeverity | null;
};

const SEVERITY_ORDER: AdvisorySeverity[] = ["low", "moderate", "high", "critical"];

export const SEVERITY_LABEL: Record<AdvisorySeverity, string> = {
  low: "низька",
  moderate: "середня",
  high: "висока",
  critical: "критична",
};

/* ───────────────────────── порівняння версій ──────────────────────── */

type Parsed = { parts: number[]; pre: string | null };

/**
 * Розбір версії без залежності від `semver`.
 *
 * Ставити пакет заради трьох чисел через крапку означало б додати рядок на
 * сторінку, яка існує саме для того, щоб залежностей було менше.
 */
export function parseVersion(value: string | null | undefined): Parsed | null {
  if (!value) return null;
  const match = String(value)
    .trim()
    .replace(/^[v=^~]+/, "")
    .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null };
}

/** −1 / 0 / 1. Передрелізна версія завжди молодша за таку саму фінальну. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (left.parts[i] !== right.parts[i]) return left.parts[i] < right.parts[i] ? -1 : 1;
  }
  if (left.pre === right.pre) return 0;
  if (left.pre && !right.pre) return -1;
  if (!left.pre && right.pre) return 1;
  return (left.pre ?? "") < (right.pre ?? "") ? -1 : 1;
}

/**
 * Наскільки болісний переїзд.
 *
 * ГОЧА НУЛЬОВОГО МАЖОРА. У версіях 0.x semver дозволяє ламати сумісність у
 * МІНОРІ — саме тому `^0.560.0` не пускає навіть 0.561.0. Тож для таких
 * пакетів (у нас це lucide-react) стрибок мінора чесно рахується як major:
 * інакше сторінка обіцяла б безпечне оновлення там, де воно може зламати
 * збірку. Це не перестраховка, а той самий контракт, за яким живе npm.
 */
export function classifyState(current: string | null | undefined, latest: string | null | undefined): StackState {
  const from = parseVersion(current);
  const to = parseVersion(latest);
  if (!from || !to) return "unknown";
  if (compareVersions(current, latest) >= 0) return "fresh";
  if (from.parts[0] !== to.parts[0]) return "major";
  if (from.parts[0] === 0 && from.parts[1] !== to.parts[1]) return "major";
  if (from.parts[1] !== to.parts[1]) return "minor";
  return "patch";
}

/**
 * Дірки — від найважчої до найлегшої.
 *
 * Порядок тут не косметика: рядок пакета показує ЗАГОЛОВОК першої дірки поруч
 * із чипсом найгіршої важкості. У `vite` їх пʼять — і поки порядок був як у
 * npm, чипс казав «висока», а підпис під ним описував зовсім іншу, помірну.
 * Сортування знімає це розходження в одному місці замість кожного споживача.
 */
function sortAdvisories(advisories: StackAdvisory[]): StackAdvisory[] {
  return [...advisories].sort(
    (a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity)
  );
}

function worstOf(advisories: StackAdvisory[]): AdvisorySeverity | null {
  let worst: AdvisorySeverity | null = null;
  for (const advisory of advisories) {
    if (!SEVERITY_ORDER.includes(advisory.severity)) continue;
    if (!worst || SEVERITY_ORDER.indexOf(advisory.severity) > SEVERITY_ORDER.indexOf(worst)) {
      worst = advisory.severity;
    }
  }
  return worst;
}

/** Знімок репозиторію + відповідь npm → рядки, які малює сторінка. */
export function buildStackItems(snapshot: StackSnapshot, rows: StackVersionRow[]): StackItem[] {
  const byName = new Map(rows.map((row) => [row.name, row]));
  return snapshot.packages.map((pkg) => {
    const row = byName.get(pkg.name);
    /**
     * Дірки показуємо ЛИШЕ якщо їх питали саме про цю версію.
     *
     * Оновили пакет — попередня відповідь npm стосується вже неіснуючого в нас
     * стану, і показувати її означає лякати даремно. Мовчання тут чесніше:
     * наступний прохід крона перепитає й покаже правду. Рядок без
     * `advisories_version` (записаний до появи колонки) теж вважаємо застарілим.
     */
    const advisoriesMatchVersion = Boolean(row?.advisories_version) && row?.advisories_version === pkg.version;
    const advisories = advisoriesMatchVersion
      ? sortAdvisories(Array.isArray(row?.advisories) ? row.advisories : [])
      : [];
    return {
      ...pkg,
      latest: row?.latest_version ?? null,
      latestSeenAt: row?.latest_seen_at ?? null,
      checkedAt: row?.checked_at ?? null,
      state: classifyState(pkg.version, row?.latest_version),
      advisories,
      worstSeverity: worstOf(advisories),
    };
  });
}

/* ──────────────────────────── групування ─────────────────────────── */

export const LAYER_ORDER: StackLayer[] = ["screen", "data", "build", "platform"];

/**
 * Колір шару — ІДЕНТИЧНІСТЬ, а не стан.
 *
 * Тому беруться категоріальні `chart-*` (та сама палітра, що в кошиках
 * «Витрат»), а не семантичні success/warning: зелений тут означає «Платформа»,
 * і плутати його з «усе добре» не можна. Стан живе окремо — у чипсах на рядку.
 */
export const LAYER_META: Record<StackLayer, { label: string; hint: string; dot: string; tile: string }> = {
  screen: { label: "Екран", hint: "малює інтерфейс", dot: "bg-chart-1", tile: "bg-chart-1/12 text-chart-1" },
  data: { label: "Дані", hint: "через це ходять дані", dot: "bg-chart-7", tile: "bg-chart-7/12 text-chart-7" },
  build: { label: "Збірка", hint: "збирає й перевіряє", dot: "bg-chart-4", tile: "bg-chart-4/15 text-chart-4" },
  platform: { label: "Платформа", hint: "працює поза браузером", dot: "bg-chart-6", tile: "bg-chart-6/12 text-chart-6" },
};

/** Групи вкладки «за терміновістю»: що з цим робити просто зараз. */
export type StackUrgency = "breaking" | "available" | "fresh";

export const URGENCY_ORDER: StackUrgency[] = ["breaking", "available", "fresh"];

export const URGENCY_META: Record<StackUrgency, { label: string; dot: string; tile: string }> = {
  breaking: { label: "Ламає код", dot: "bg-destructive", tile: "bg-destructive/10 text-destructive" },
  available: { label: "Є нове, не ламає", dot: "bg-warning-solid", tile: "bg-warning-soft text-warning-foreground" },
  fresh: { label: "Свіже", dot: "bg-success-solid", tile: "bg-success-soft text-success-foreground" },
};

export function urgencyOf(item: StackItem): StackUrgency {
  if (item.state === "major") return "breaking";
  if (item.state === "minor" || item.state === "patch") return "available";
  return "fresh";
}

/**
 * Порядок усередині групи: спершу дірки безпеки, далі болючіші оновлення,
 * і аж тоді за абеткою. Пакет із дірою не має ховатись у хвості списку через
 * те, що його назва починається на «w».
 */
const STATE_WEIGHT: Record<StackState, number> = { major: 0, minor: 1, patch: 2, unknown: 3, fresh: 4 };

export function sortItems(items: StackItem[]): StackItem[] {
  return [...items].sort((a, b) => {
    const securityDiff = Number(Boolean(b.worstSeverity)) - Number(Boolean(a.worstSeverity));
    if (securityDiff !== 0) return securityDiff;
    if (STATE_WEIGHT[a.state] !== STATE_WEIGHT[b.state]) return STATE_WEIGHT[a.state] - STATE_WEIGHT[b.state];
    return a.name.localeCompare(b.name);
  });
}

export type StackGroup<K extends string> = { key: K; items: StackItem[] };

export function groupByLayer(items: StackItem[]): StackGroup<StackLayer>[] {
  return LAYER_ORDER.map((key) => ({ key, items: sortItems(items.filter((item) => item.layer === key)) })).filter(
    (group) => group.items.length > 0
  );
}

export function groupByUrgency(items: StackItem[]): StackGroup<StackUrgency>[] {
  return URGENCY_ORDER.map((key) => ({ key, items: sortItems(items.filter((item) => urgencyOf(item) === key)) })).filter(
    (group) => group.items.length > 0
  );
}

/* ───────────────────────────── підсумки ──────────────────────────── */

export type StackTotals = {
  total: number;
  major: number;
  minor: number;
  patch: number;
  fresh: number;
  unknown: number;
  /** Скільки пакетів мають хоч одну відкриту дірку безпеки. */
  vulnerable: number;
  worstSeverity: AdvisorySeverity | null;
  /** Найсвіжіший момент перевірки серед усіх рядків — «перевірено N тому». */
  checkedAt: string | null;
};

export function stackTotals(items: StackItem[]): StackTotals {
  const totals: StackTotals = {
    total: items.length,
    major: 0,
    minor: 0,
    patch: 0,
    fresh: 0,
    unknown: 0,
    vulnerable: 0,
    worstSeverity: null,
    checkedAt: null,
  };
  for (const item of items) {
    totals[item.state] += 1;
    if (item.worstSeverity) {
      totals.vulnerable += 1;
      if (
        !totals.worstSeverity ||
        SEVERITY_ORDER.indexOf(item.worstSeverity) > SEVERITY_ORDER.indexOf(totals.worstSeverity)
      ) {
        totals.worstSeverity = item.worstSeverity;
      }
    }
    if (item.checkedAt && (!totals.checkedAt || item.checkedAt > totals.checkedAt)) {
      totals.checkedAt = item.checkedAt;
    }
  }
  return totals;
}

/** Скільки пакетів у шарі відстають — для смужок «наскільки відстаємо». */
export function layerLag(items: StackItem[]): { layer: StackLayer; behind: number; total: number }[] {
  return LAYER_ORDER.map((layer) => {
    const inLayer = items.filter((item) => item.layer === layer);
    return {
      layer,
      behind: inLayer.filter((item) => item.state === "major" || item.state === "minor" || item.state === "patch")
        .length,
      total: inLayer.length,
    };
  }).filter((row) => row.total > 0);
}

/* ─────────────────────────── людські підписи ─────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * «9 днів тому», «2 місяці тому», «торік».
 *
 * Власний форматер, а не formatLastSeenAgo: той після 30 днів перемикається на
 * точну дату, бо для присутності людини «14.03.2026» інформативніше за «5
 * місяців тому». Тут навпаки — питання «давно не чіпали?», і саме тривалість є
 * відповіддю, а календарне число нічого не додає.
 */
export function formatAgoCoarse(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor(Math.max(0, now.getTime() - then) / DAY_MS);
  if (days <= 0) return "сьогодні";
  if (days === 1) return "вчора";
  if (days < 31) return `${pluralUk(days, "день", "дні", "днів")} тому`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${pluralUk(months, "місяць", "місяці", "місяців")} тому`;
  const years = Math.floor(days / 365);
  return years === 1 ? "торік" : `${pluralUk(years, "рік", "роки", "років")} тому`;
}

/**
 * Рядок для нічного звіту «Система за ніч» і для бота.
 *
 * НАВІЩО ВІН ЗАВЖДИ, А НЕ ЛИШЕ КОЛИ ПОГАНО. Щогодинний алерт мовчить, поки
 * немає червоного, — і його мовчання двозначне: або все добре, або ланцюжок
 * зламався. Рядок у звіті є щодня, тож «дірок безпеки немає» — це доказ, що
 * механізм живий. Той самий урок, що з журналом помилок (REQ-100).
 */
export function stackSummaryText(totals: StackTotals): string {
  if (totals.total === 0) return "Стек: знімок порожній";
  if (totals.checkedAt === null)
    return `Стек: ${totals.total} ${pluralWordUk(totals.total, "залежність", "залежності", "залежностей")}, npm ще не питали`;

  const updates = totals.major + totals.minor + totals.patch;
  const head =
    updates === 0
      ? "усе свіже"
      : `${updates} ${pluralWordUk(updates, "оновлення", "оновлення", "оновлень")}${
          totals.major > 0 ? ` (${totals.major} ${pluralWordUk(totals.major, "ламає", "ламають", "ламають")} код)` : ""
        }`;

  const security =
    totals.vulnerable > 0
      ? `${totals.vulnerable} ${pluralWordUk(totals.vulnerable, "діра", "діри", "дір")} безпеки (${
          SEVERITY_LABEL[totals.worstSeverity ?? "low"]
        })`
      : "дірок безпеки немає";

  return `Стек: ${head}, ${security}`;
}

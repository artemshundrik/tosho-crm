// Канонічні пороги здоров'я системи.
//
// ЄДИНЕ джерело для трьох споживачів: сторінки Observability, ранкового
// тех-дайджесту і бота («що не працює?»). Доти пороги жили в трьох копіях і
// вже встигли розійтися: сторінка рахувала dead tuples парою «рядки + частка»,
// дайджест — лише часткою, а вкладення міряли то в байтах, то в штуках. Три
// відповіді на одне питання = недовіра до всіх трьох.
//
// Модуль свідомо чистий: жодного React, Supabase чи браузерних API — його
// імпортує і фронтенд, і Netlify-функція (`netlify/functions/_systemHealth.ts`).

export type HealthTone = "good" | "warning" | "danger" | "neutral";

const TONE_RANK: Record<HealthTone, number> = { neutral: 0, good: 1, warning: 2, danger: 3 };

export function worstHealthTone(tones: HealthTone[]): HealthTone {
  return tones.reduce<HealthTone>((worst, t) => (TONE_RANK[t] > TONE_RANK[worst] ? t : worst), "good");
}

// --- Storage ----------------------------------------------------------------

export const PRO_STORAGE_LIMIT_BYTES = 100 * 1024 ** 3;
export const STORAGE_WARN_PERCENT = 70;
export const STORAGE_DANGER_PERCENT = 90;

export function classifyStorageUsage(percentOfLimit: number): HealthTone {
  if (percentOfLimit >= STORAGE_DANGER_PERCENT) return "danger";
  if (percentOfLimit >= STORAGE_WARN_PERCENT) return "warning";
  return "good";
}

// --- Бекапи -----------------------------------------------------------------

export const BACKUP_WARN_HOURS = 8 * 24;
export const BACKUP_DANGER_HOURS = 16 * 24;

/** `ageHours = null` — успішного бекапу ще не було. */
export function classifyBackupAge(params: { ageHours: number | null; lastRunFailed: boolean }): HealthTone {
  if (params.lastRunFailed) return "danger";
  if (params.ageHours === null) return "warning";
  if (params.ageHours > BACKUP_DANGER_HOURS) return "danger";
  if (params.ageHours > BACKUP_WARN_HOURS) return "warning";
  return "good";
}

// --- Dead tuples ------------------------------------------------------------

// Пара «абсолютні рядки + частка» замість самої частки: на маленькій таблиці
// 100% сміття — це кілька рядків і жодної проблеми.
//
// Один рівень, а не два. Нижчий (200 рядків + 10%) спрацьовував на службових
// таблицях типу refresh_tokens, які постійно перезаписуються, — і давав жовтий
// щоранку. Постійний сигнал привчає не дивитись, тож поріг має ловити реальний
// bloat, а не звичайну роботу autovacuum.
export const DEAD_TUPLE_WARN_ROWS = 1000;
export const DEAD_TUPLE_WARN_PERCENT = 20;

/**
 * Таблиці, які постійно перезаписуються і тому завжди «брудні». Тримати їх у
 * перевірці означає миготіння: частка стрибає до 100% і назад між двома
 * запитами, а алерт, який блимає, гірший за відсутній.
 */
export const DEAD_TUPLE_IGNORED_TABLES: ReadonlyArray<{ schema: string; table: string }> = [
  { schema: "public", table: "user_presence" },
  { schema: "tosho", table: "admin_observability_snapshots" },
];

export function isDeadTupleTableIgnored(schema?: string | null, table?: string | null): boolean {
  const s = (schema ?? "").trim();
  const t = (table ?? "").trim();
  return DEAD_TUPLE_IGNORED_TABLES.some((row) => row.schema === s && row.table === t);
}

/**
 * НІКОЛИ не danger — свідомо.
 *
 * Dead tuples прибирає autovacuum; це обслуговування, а не аварія. Червоний тон
 * вмикає миттєвий алерт, а будити людину вночі через bloat немає сенсу. У
 * ранковому звіті сигнал лишається жовтим і нікуди не зникає.
 */
export function classifyDeadTuples(params: { worstDeadRows: number; highestDeadRatio: number; hasData: boolean }): HealthTone {
  if (!params.hasData) return "neutral";
  if (params.worstDeadRows >= DEAD_TUPLE_WARN_ROWS && params.highestDeadRatio >= DEAD_TUPLE_WARN_PERCENT) return "warning";
  return "good";
}

// --- Deadlocks --------------------------------------------------------------

/** Ось це справжня аварія: конкуренція за блокування прямо зараз. */
export function classifyDeadlocks(deadlocks: number): HealthTone {
  return deadlocks > 0 ? "danger" : "good";
}

// --- Гігієна вкладень -------------------------------------------------------

export const ATTACHMENT_RECLAIM_HIGH_BYTES = 100 * 1024 ** 2;
export const ATTACHMENT_ORPHAN_HIGH_BYTES = 500 * 1024 ** 2;
export const ATTACHMENT_ORPHAN_WARN_BYTES = 100 * 1024 ** 2;
export const ATTACHMENT_MISSING_PREVIEWS_HIGH = 100;

/** Теж ніколи не danger: прибирання сміття — не інцидент (див. classifyDeadTuples). */
export function classifyAttachmentHygiene(params: {
  safeReclaimableBytes: number;
  orphanBytes: number;
  missingPreviews: number;
}): HealthTone {
  const heavy =
    params.safeReclaimableBytes >= ATTACHMENT_RECLAIM_HIGH_BYTES ||
    params.orphanBytes >= ATTACHMENT_ORPHAN_HIGH_BYTES ||
    params.missingPreviews >= ATTACHMENT_MISSING_PREVIEWS_HIGH;
  if (heavy) return "warning";
  const any =
    params.safeReclaimableBytes > 0 ||
    params.orphanBytes >= ATTACHMENT_ORPHAN_WARN_BYTES ||
    params.missingPreviews > 0;
  return any ? "warning" : "good";
}

// --- AI-кости ---------------------------------------------------------------

export const AI_WARN_USD = 5;
export const AI_DANGER_USD = 15;

export function classifyAiCost(costUsd: number): HealthTone {
  if (costUsd > AI_DANGER_USD) return "danger";
  if (costUsd > AI_WARN_USD) return "warning";
  return "good";
}

// --- Бюджет AI (куплені кредити) ---

export const AI_BUDGET_WARN_PERCENT = 70;
export const AI_BUDGET_DANGER_PERCENT = 90;

/**
 * Витрачено від куплених кредитів. Червоне тут виправдане: коли кредити
 * закінчаться, API віддаватиме помилку, тобто AI-функції CRM просто стануть.
 */
export function classifyAiBudget(percentUsed: number): HealthTone {
  if (percentUsed >= AI_BUDGET_DANGER_PERCENT) return "danger";
  if (percentUsed >= AI_BUDGET_WARN_PERCENT) return "warning";
  return "good";
}

// --- Cron -------------------------------------------------------------------

export const CRON_WARN_FAILURES = 1;
export const CRON_DANGER_FAILURES = 3;
// 26, а не 24: щоденний джоб перед своїм наступним запуском законно підходить
// впритул до доби, і рівний поріг давав би червоне на рівному місці.
export const CRON_STALE_HOURS = 26;
/**
 * Скільки таймаутів pg_net за добу вже означають системну повільність.
 *
 * Виклики fire-and-forget: 30 с — це «не дочекались відповіді», а не «джоб
 * упав». Поодинокі (2-3 на тисячі викликів) — фон, і саме вони щоранку давали
 * порожній жовтий рядок «HTTP-помилок: 1». 12 за добу — це вже частіше ніж раз
 * на дві години, тобто щось справді не встигає.
 */
export const CRON_HTTP_TIMEOUT_WARN = 12;

/** `hoursSinceLastRun = null` — джоб щойно створено, першого запуску ще не було. */
export function classifyCronJob(params: { hoursSinceLastRun: number | null; failures: number }): HealthTone {
  if (params.hoursSinceLastRun === null) return "warning";
  if (params.hoursSinceLastRun > CRON_STALE_HOURS) return "danger";
  if (params.failures >= CRON_DANGER_FAILURES) return "danger";
  if (params.failures >= CRON_WARN_FAILURES) return "warning";
  return "good";
}

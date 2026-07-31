import type { SupabaseClient } from "@supabase/supabase-js";

// Пороги — зі спільного модуля, який використовує й сторінка Observability.
// Тримати їх тут власною копією означало б, що сторінка, звіт і бот з часом
// почнуть давати різні оцінки одному стану — а це вбиває довіру до всіх трьох.
import {
  PRO_STORAGE_LIMIT_BYTES,
  classifyAiBudget,
  classifyAiCost,
  classifyAttachmentHygiene,
  classifyBackupAge,
  classifyCronJob,
  classifyDeadTuples,
  classifyDeadlocks,
  classifyStorageUsage,
  worstHealthTone,
  type HealthTone,
} from "../../src/lib/systemHealthThresholds";
import { collectDropboxHealth, hasDropboxProblems } from "./_lib/dropboxHealth";

// Сигнали здоров'я системи — ЄДИНЕ джерело для ранкового тех-дайджесту і для
// питань у боті («що не працює?»).

export type Tone = HealthTone;
/**
 * Код сигналу — стабільний ідентифікатор, незалежний від тексту.
 *
 * Потрібен, щоб бот міг ПОЯСНИТИ конкретну проблему («що це значить?»).
 * Матчити пояснення по тексту було б крихко: варто переписати формулювання —
 * і довідка мовчки відвалюється.
 */
export type SignalCode =
  | "backup"
  | "storage"
  | "database"
  | "dead_tuples"
  | "cron_never_ran"
  | "cron_stale"
  | "cron_failures"
  | "cron_http_failures"
  | "cron_ok"
  | "ai_cost"
  | "attachments"
  | "audit_trigger"
  | "dropbox";

export type Signal = { tone: Tone; text: string; code?: SignalCode };

export const TONE_EMOJI: Record<Tone, string> = { neutral: "⚪️", good: "🟢", warning: "🟡", danger: "🔴" };

export function worstTone(signals: Signal[]): Tone {
  return worstHealthTone(signals.map((s) => s.tone));
}

export function isProblem(signal: Signal): boolean {
  return signal.tone === "warning" || signal.tone === "danger";
}

// Снапшот Observability пишеться раз на добу джобом; старіші дані про
// orphan-вкладення в звіт не тягнемо взагалі.
const SNAPSHOT_MAX_AGE_DAYS = 7;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

function formatHoursAgo(hours: number | null): string {
  if (hours === null) return "невідомо";
  if (hours < 48) return `${Math.round(hours)} год тому`;
  return `${Math.round(hours / 24)} дн тому`;
}

type BackupRunRow = {
  section: string;
  status: "success" | "failed";
  finished_at: string;
  error_message?: string | null;
};

function backupSignal(runs: BackupRunRow[], section: string, label: string, now: Date): Signal {
  const sectionRuns = runs
    .filter((r) => r.section === section)
    .sort((a, b) => new Date(b.finished_at).getTime() - new Date(a.finished_at).getTime());
  const latest = sectionRuns[0] ?? null;
  const latestSuccess = sectionRuns.find((r) => r.status === "success") ?? null;
  const ageHours = latestSuccess
    ? Math.max(0, (now.getTime() - new Date(latestSuccess.finished_at).getTime()) / 3_600_000)
    : null;

  const tone = classifyBackupAge({ ageHours, lastRunFailed: latest?.status === "failed" });
  if (latest?.status === "failed") {
    return {
      tone,
      code: "backup" as const,
      text: `Backup ${label}: останній run впав${latest.error_message ? ` — ${latest.error_message}` : ""}`,
    };
  }
  if (ageHours === null) return { tone, code: "backup", text: `Backup ${label}: жодного успішного run-у ще не записано` };
  if (tone === "good") return { tone, code: "backup", text: `${label} ✅ ${formatHoursAgo(ageHours)}` };
  return { tone, code: "backup", text: `Backup ${label}: останній успішний ${formatHoursAgo(ageHours)}` };
}

type CronJobRow = {
  jobname?: string | null;
  failures?: number | null;
  runs?: number | null;
  hours_since_last_run?: number | null;
};

function cronSignals(jobs: CronJobRow[], httpFailures: number | null): Signal[] {
  if (jobs.length === 0) return [{ tone: "neutral", text: "Cron: статус недоступний" }];

  const signals: Signal[] = [];
  let healthy = 0;

  for (const job of jobs) {
    const name = (job.jobname ?? "—").trim();
    const failures = num(job.failures);
    const hoursSince = job.hours_since_last_run == null ? null : num(job.hours_since_last_run);
    const tone = classifyCronJob({ hoursSinceLastRun: hoursSince, failures });

    if (tone === "good") {
      healthy += 1;
      continue;
    }
    // Порожня історія ≠ поламаний джоб: щойно заплановане завдання ще не мало
    // першого запуску.
    if (hoursSince === null) {
      signals.push({ tone, code: "cron_never_ran", text: `Cron ${name}: ще жодного запуску` });
      continue;
    }
    if (failures > 0) {
      signals.push({ tone, code: "cron_failures", text: `Cron ${name}: ${failures} збоїв за добу` });
      continue;
    }
    signals.push({ tone, code: "cron_stale", text: `Cron ${name}: не запускався ${Math.round(hoursSince)} год` });
  }

  if (healthy > 0) {
    signals.push({ tone: "good", code: "cron_ok", text: `Cron: ${healthy}/${jobs.length} джобів без збоїв за добу` });
  }
  if (httpFailures !== null && httpFailures > 0) {
    signals.push({ tone: "warning", code: "cron_http_failures", text: `HTTP-помилок від cron-викликів: ${httpFailures}` });
  }
  return signals;
}

/**
 * Цілісність даних — те, що не падає з помилкою, а тихо бреше.
 *
 * Аудит статусів прорахунку тримає тригер у базі
 * (`scripts/quote-status-audit-trigger.sql`). Перевіряємо його НАЯВНІСТЬ —
 * факт, а не здогадку.
 *
 * Спершу тут була спроба вивести поломку з даних: «прорахунки змінюються, а
 * історія мовчить». Вона дала хибну тривогу одразу після встановлення тригера,
 * і причина принципова: `updated_at` рухається від будь-якого редагування, не
 * лише від зміни статусу.
 */
function dataIntegritySignals(metrics: Record<string, unknown>): Signal[] {
  if (metrics.quote_audit_trigger_ok === false) {
    return [
      {
        tone: "danger",
        code: "audit_trigger",
        text: "Тригер аудиту статусів прорахунків відсутній або вимкнений — історія змін втрачається",
      },
    ];
  }
  return [];
}

export type SystemSignalsOptions = {
  /** Межі доби, за яку рахувати AI-кости (зазвичай «вчора» для ранкового звіту). */
  aiFromIso: string;
  aiToIso: string;
  aiLabel: string;
  teamIds: string[];
};

/** Повний набір сигналів: бекапи, storage, база, cron, AI, вкладення, цілісність. */
export async function collectSystemSignals(
  admin: SupabaseClient,
  now: Date,
  options: SystemSignalsOptions
): Promise<Signal[]> {
  const [metricsResult, backupsResult, aiResult, budgetResult, spentResult, snapshotResult] = await Promise.all([
    admin.schema("tosho").rpc("get_admin_digest_metrics"),
    admin
      .schema("tosho")
      .from("backup_runs")
      .select("section,status,finished_at,error_message")
      .in("section", ["storage", "database"])
      .order("finished_at", { ascending: false })
      .limit(40),
    admin
      .schema("tosho")
      .from("ai_usage")
      .select("cost_usd")
      .gte("created_at", options.aiFromIso)
      .lt("created_at", options.aiToIso)
      .limit(20000),
    admin.schema("tosho").from("cron_config").select("value").eq("key", "ai_credit_balance_usd").maybeSingle(),
    admin.schema("tosho").from("ai_usage").select("cost_usd").limit(100000),
    admin
      .schema("tosho")
      .from("admin_observability_snapshots")
      .select(
        "captured_at,attachment_possible_orphan_original_count,attachment_possible_orphan_original_bytes,attachment_missing_variants_count,attachment_safe_reclaimable_bytes"
      )
      .order("captured_for_date", { ascending: false })
      .limit(1),
  ]);

  if (metricsResult.error) throw new Error(`get_admin_digest_metrics: ${metricsResult.error.message}`);
  if (backupsResult.error) throw new Error(`backup_runs: ${backupsResult.error.message}`);

  const metrics = (metricsResult.data ?? {}) as Record<string, unknown>;
  const backups = (backupsResult.data ?? []) as BackupRunRow[];
  const signals: Signal[] = [];

  // 1. Бекапи.
  const dbBackup = backupSignal(backups, "database", "база", now);
  const filesBackup = backupSignal(backups, "storage", "файли", now);
  if (dbBackup.tone === "good" && filesBackup.tone === "good") {
    signals.push({ tone: "good", code: "backup", text: `Бекапи: ${dbBackup.text} · ${filesBackup.text}` });
  } else {
    signals.push(dbBackup, filesBackup);
  }

  // 2. Storage від ліміту Pro.
  const storageBytes = num(metrics.storage_bytes);
  const storagePercent = (storageBytes / PRO_STORAGE_LIMIT_BYTES) * 100;
  signals.push({
    tone: classifyStorageUsage(storagePercent),
    code: "storage",
    text: `Storage: ${storagePercent.toFixed(1)}% від ліміту Pro (${formatBytes(storageBytes)})`,
  });

  // 3. База: розмір, deadlocks, dead tuples.
  const dbSize = num(metrics.database_size_bytes);
  const deadlocks = num(metrics.deadlocks);
  const deadRatio = num(metrics.dead_tuple_max_ratio);
  const deadRows = num(metrics.dead_tuple_worst_rows);
  const deadTable = typeof metrics.dead_tuple_worst_table === "string" ? metrics.dead_tuple_worst_table : null;

  const deadlockTone = classifyDeadlocks(deadlocks);
  const deadTupleTone = classifyDeadTuples({
    worstDeadRows: deadRows,
    highestDeadRatio: deadRatio,
    hasData: deadTable !== null,
  });

  if (deadlockTone === "danger") {
    signals.push({ tone: deadlockTone, code: "database", text: `База: ${formatBytes(dbSize)} · deadlocks ${deadlocks}` });
  } else if (deadTupleTone === "warning") {
    signals.push({
      tone: deadTupleTone,
      code: "dead_tuples",
      text: `Dead tuples ${deadRatio.toFixed(0)}%${deadTable ? ` у ${deadTable}` : ""} — потрібен vacuum`,
    });
  } else {
    signals.push({ tone: "good", code: "database", text: `База: ${formatBytes(dbSize)} · deadlocks 0 · dead tuples у нормі` });
  }

  // 4. Cron.
  const cronJobs = Array.isArray(metrics.cron_jobs) ? (metrics.cron_jobs as CronJobRow[]) : [];
  const httpFailures = metrics.cron_http_failures_24h == null ? null : num(metrics.cron_http_failures_24h);
  signals.push(...cronSignals(cronJobs, httpFailures));

  // 5. AI-кости. Помилку запиту не ховаємо за «$0.00».
  if (aiResult.error) {
    signals.push({ tone: "neutral", text: "AI-кости: дані недоступні" });
  } else {
    const aiCost = ((aiResult.data ?? []) as Array<{ cost_usd?: number | string | null }>).reduce(
      (sum, row) => sum + num(row.cost_usd),
      0
    );
    signals.push({ tone: classifyAiCost(aiCost), code: "ai_cost", text: `AI ${options.aiLabel}: $${aiCost.toFixed(2)}` });
  }

  // Залишок куплених кредитів OpenAI. Коли вони скінчаться, API почне віддавати
  // помилку і AI-функції CRM просто стануть — тож попереджаємо заздалегідь.
  const creditBalance = num((budgetResult.data as { value?: string } | null)?.value);
  if (creditBalance > 0 && !spentResult.error) {
    const spent = ((spentResult.data ?? []) as Array<{ cost_usd?: number | string | null }>).reduce(
      (sum, row) => sum + num(row.cost_usd),
      0
    );
    const percent = (spent / creditBalance) * 100;
    signals.push({
      tone: classifyAiBudget(percent),
      text:
        `Кредити OpenAI: витрачено $${spent.toFixed(2)} із $${creditBalance.toFixed(2)} ` +
        `(${percent.toFixed(percent < 10 ? 1 : 0)}%)`,
    });
  }

  // 6. Гігієна вкладень — лише зі свіжого снапшота.
  const snapshot = ((snapshotResult.data ?? []) as Array<{
    captured_at?: string | null;
    attachment_possible_orphan_original_count?: number | null;
    attachment_possible_orphan_original_bytes?: number | null;
    attachment_missing_variants_count?: number | null;
    attachment_safe_reclaimable_bytes?: number | null;
  }>)[0];
  if (snapshot?.captured_at) {
    const ageDays = (now.getTime() - new Date(snapshot.captured_at).getTime()) / 86_400_000;
    if (ageDays <= SNAPSHOT_MAX_AGE_DAYS) {
      const orphans = num(snapshot.attachment_possible_orphan_original_count);
      const missing = num(snapshot.attachment_missing_variants_count);
      const tone = classifyAttachmentHygiene({
        safeReclaimableBytes: num(snapshot.attachment_safe_reclaimable_bytes),
        orphanBytes: num(snapshot.attachment_possible_orphan_original_bytes),
        missingPreviews: missing,
      });
      signals.push(
        tone === "good"
          ? { tone, code: "attachments", text: "Вкладення: сміття не накопичується" }
          : { tone, code: "attachments", text: `Вкладення: ${orphans} orphan-файлів, ${missing} без прев'ю — час прибрати` }
      );
    }
  }

  // 7. Цілісність даних.
  signals.push(...dataIntegritySignals(metrics));

  // 8. Зв'язок CRM ↔ Dropbox.
  signals.push(await dropboxSignal(admin));

  return signals;
}

/**
 * Одна річ, яку тут перевіряємо: чи не розірвався зв'язок карток CRM із теками.
 * Прив'язка в нікуди або дві теки на одного клієнта означають, що файли тихо
 * розповзаються по різних місцях, і помічають це зазвичай через півроку.
 *
 * Статистику по задачах свідомо не рахуємо: вона тягне metadata всіх дизайн-
 * задач, а сигнали збираються щогодини. Повні числа — у команді /dropbox.
 *
 * Dropbox — зовнішній сервіс, і його недоступність не привід валити весь звіт
 * про стан системи. Тому будь-яка помилка тут гаситься в сірий сигнал.
 */
async function dropboxSignal(admin: SupabaseClient): Promise<Signal> {
  try {
    const health = await collectDropboxHealth(admin as never, { includeTaskStats: false });
    const linked = health.linkedCustomers + health.linkedLeads;
    if (!hasDropboxProblems(health)) {
      return { tone: "good", code: "dropbox", text: `Dropbox: ${health.folders} тек, ${linked} прив'язок — зв'язок цілий` };
    }
    const parts: string[] = [];
    if (health.brokenLinks.length > 0) parts.push(`${health.brokenLinks.length} прив'язок веде в нікуди`);
    if (health.duplicateFolders.length > 0) parts.push(`${health.duplicateFolders.length} дублів тек`);
    return { tone: "warning", code: "dropbox", text: `Dropbox: ${parts.join(", ")}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "невідома помилка";
    return { tone: "neutral", code: "dropbox", text: `Dropbox: стан недоступний (${message})` };
  }
}

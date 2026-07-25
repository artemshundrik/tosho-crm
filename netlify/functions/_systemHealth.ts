import type { SupabaseClient } from "@supabase/supabase-js";

// Сигнали здоров'я системи — ЄДИНЕ джерело для ранкового тех-дайджесту і для
// питань у боті («що не працює?»). Тримати разом принципово: якби пороги жили
// у двох місцях, звіт і бот почали б суперечити один одному, і довіри до обох
// не стало б.

export type Tone = "good" | "warning" | "danger" | "neutral";
export type Signal = { tone: Tone; text: string };

const TONE_RANK: Record<Tone, number> = { neutral: 0, good: 1, warning: 2, danger: 3 };
export const TONE_EMOJI: Record<Tone, string> = { neutral: "⚪️", good: "🟢", warning: "🟡", danger: "🔴" };

export function worstTone(signals: Signal[]): Tone {
  return signals.reduce<Tone>((worst, s) => (TONE_RANK[s.tone] > TONE_RANK[worst] ? s.tone : worst), "good");
}

export function isProblem(signal: Signal): boolean {
  return signal.tone === "warning" || signal.tone === "danger";
}

// Пороги. Бекапи / storage / dead tuples збігаються з тим, що рахує сторінка
// Observability, щоб цифри не розходились.
const PRO_STORAGE_LIMIT_BYTES = 100 * 1024 ** 3;
const STORAGE_WARN_PERCENT = 70;
const STORAGE_DANGER_PERCENT = 90;
const BACKUP_WARN_HOURS = 8 * 24;
const BACKUP_DANGER_HOURS = 16 * 24;
const DEAD_TUPLE_WARN_PERCENT = 20;
const DEAD_TUPLE_DANGER_PERCENT = 40;
const ORPHAN_DANGER_COUNT = 200;
const CRON_WARN_FAILURES = 1;
const CRON_DANGER_FAILURES = 3;
// 26, а не 24: щоденний джоб перед своїм наступним запуском законно підходить
// впритул до доби, і рівний поріг давав би 🔴 на рівному місці.
const CRON_STALE_HOURS = 26;
const AI_WARN_USD = 5;
const AI_DANGER_USD = 15;
// Снапшот Observability пишеться лише коли адмін тисне «Оновити», тож старіші
// дані про orphan-вкладення не показуємо взагалі.
const SNAPSHOT_MAX_AGE_DAYS = 7;
// Скільки днів тишi в журналі статусів вважаємо підозрілими.
const STATUS_LOG_STALE_DAYS = 3;

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

  if (latest?.status === "failed") {
    return {
      tone: "danger",
      text: `Backup ${label}: останній run впав${latest.error_message ? ` — ${latest.error_message}` : ""}`,
    };
  }
  if (ageHours === null) return { tone: "warning", text: `Backup ${label}: жодного успішного run-у ще не записано` };
  if (ageHours > BACKUP_DANGER_HOURS) {
    return { tone: "danger", text: `Backup ${label}: останній успішний ${formatHoursAgo(ageHours)}` };
  }
  if (ageHours > BACKUP_WARN_HOURS) {
    return { tone: "warning", text: `Backup ${label}: останній успішний ${formatHoursAgo(ageHours)}` };
  }
  return { tone: "good", text: `${label} ✅ ${formatHoursAgo(ageHours)}` };
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

    // Порожня історія ≠ поламаний джоб: щойно заплановане завдання ще не мало
    // першого запуску. Це жовтий сигнал «перевір завтра», а не червоний.
    if (hoursSince === null) {
      signals.push({ tone: "warning", text: `Cron ${name}: ще жодного запуску` });
      continue;
    }
    if (hoursSince > CRON_STALE_HOURS) {
      signals.push({ tone: "danger", text: `Cron ${name}: не запускався ${Math.round(hoursSince)} год` });
      continue;
    }
    if (failures >= CRON_DANGER_FAILURES) {
      signals.push({ tone: "danger", text: `Cron ${name}: ${failures} збоїв за добу` });
      continue;
    }
    if (failures >= CRON_WARN_FAILURES) {
      signals.push({ tone: "warning", text: `Cron ${name}: ${failures} збоїв за добу` });
      continue;
    }
    healthy += 1;
  }

  if (healthy > 0) {
    signals.push({ tone: "good", text: `Cron: ${healthy}/${jobs.length} джобів без збоїв за добу` });
  }
  if (httpFailures !== null && httpFailures > 0) {
    signals.push({ tone: "warning", text: `HTTP-помилок від cron-викликів: ${httpFailures}` });
  }
  return signals;
}

/**
 * Цілісність даних — те, що не падає з помилкою, а тихо бреше.
 *
 * 1. Журнал змін статусу прорахунку (`activity_log`, action='змінив статус')
 *    зламався 2026-07-01: прорахунки статуси міняли, записів немає. Ловимо це
 *    доказово — рахуємо прорахунки, які змінювались ПІСЛЯ останнього запису в
 *    журналі й уже не в статусі «новий». Якщо такі є, журнал точно відстає.
 * 2. `quotes.decided_at` не заповнюється взагалі, тому «коли затвердили»
 *    доводиться визначати обхідними шляхами.
 */
async function dataIntegritySignals(admin: SupabaseClient, teamIds: string[], now: Date): Promise<Signal[]> {
  const signals: Signal[] = [];
  if (teamIds.length === 0) return signals;

  const [logResult, approvedResult] = await Promise.all([
    admin
      .from("activity_log")
      .select("created_at")
      .eq("action", "змінив статус")
      .eq("entity_type", "quotes")
      .order("created_at", { ascending: false })
      .limit(1),
    admin
      .schema("tosho")
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .in("team_id", teamIds)
      .eq("status", "approved")
      .is("decided_at", null),
  ]);

  const newestLog = ((logResult.data ?? []) as Array<{ created_at?: string | null }>)[0]?.created_at ?? null;
  if (!newestLog) {
    signals.push({ tone: "warning", text: "Журнал змін статусу прорахунків порожній" });
  } else {
    const ageDays = (now.getTime() - new Date(newestLog).getTime()) / 86_400_000;
    if (ageDays > STATUS_LOG_STALE_DAYS) {
      // Докази: чи є прорахунки, що рухались уже після останнього запису.
      const { count } = await admin
        .schema("tosho")
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .in("team_id", teamIds)
        .gt("updated_at", newestLog)
        .neq("status", "new");
      const moved = count ?? 0;
      if (moved > 0) {
        signals.push({
          tone: "danger",
          text: `Журнал змін статусу прорахунків не пишеться ${Math.round(ageDays)} дн (${moved} прорахунків змінились після останнього запису)`,
        });
      } else {
        signals.push({
          tone: "neutral",
          text: `Статуси прорахунків не змінювались ${Math.round(ageDays)} дн`,
        });
      }
    }
  }

  const withoutDecidedAt = approvedResult.count ?? 0;
  if (withoutDecidedAt > 0) {
    signals.push({
      tone: "warning",
      text: `decided_at не заповнено у ${withoutDecidedAt} затверджених прорахунків`,
    });
  }

  return signals;
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
  const [metricsResult, backupsResult, aiResult, snapshotResult, integrity] = await Promise.all([
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
    admin
      .schema("tosho")
      .from("admin_observability_snapshots")
      .select("captured_at,attachment_possible_orphan_original_count,attachment_missing_variants_count")
      .order("captured_for_date", { ascending: false })
      .limit(1),
    dataIntegritySignals(admin, options.teamIds, now),
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
    signals.push({ tone: "good", text: `Бекапи: ${dbBackup.text} · ${filesBackup.text}` });
  } else {
    signals.push(dbBackup, filesBackup);
  }

  // 2. Storage від ліміту Pro.
  const storageBytes = num(metrics.storage_bytes);
  const storagePercent = (storageBytes / PRO_STORAGE_LIMIT_BYTES) * 100;
  signals.push({
    tone:
      storagePercent >= STORAGE_DANGER_PERCENT ? "danger" : storagePercent >= STORAGE_WARN_PERCENT ? "warning" : "good",
    text: `Storage: ${storagePercent.toFixed(1)}% від ліміту Pro (${formatBytes(storageBytes)})`,
  });

  // 3. База: розмір, deadlocks, dead tuples.
  const dbSize = num(metrics.database_size_bytes);
  const deadlocks = num(metrics.deadlocks);
  const deadRatio = num(metrics.dead_tuple_max_ratio);
  const deadTable = typeof metrics.dead_tuple_worst_table === "string" ? metrics.dead_tuple_worst_table : null;

  if (deadlocks > 0) {
    signals.push({ tone: "danger", text: `База: ${formatBytes(dbSize)} · deadlocks ${deadlocks}` });
  } else if (deadRatio >= DEAD_TUPLE_DANGER_PERCENT) {
    signals.push({
      tone: "danger",
      text: `Dead tuples ${deadRatio.toFixed(0)}%${deadTable ? ` у ${deadTable}` : ""} — потрібен vacuum`,
    });
  } else if (deadRatio >= DEAD_TUPLE_WARN_PERCENT) {
    signals.push({ tone: "warning", text: `Dead tuples ${deadRatio.toFixed(0)}%${deadTable ? ` у ${deadTable}` : ""}` });
  } else {
    signals.push({ tone: "good", text: `База: ${formatBytes(dbSize)} · deadlocks 0 · dead tuples у нормі` });
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
    signals.push({
      tone: aiCost > AI_DANGER_USD ? "danger" : aiCost > AI_WARN_USD ? "warning" : "good",
      text: `AI ${options.aiLabel}: $${aiCost.toFixed(2)}`,
    });
  }

  // 6. Гігієна вкладень — лише зі свіжого снапшота.
  const snapshot = ((snapshotResult.data ?? []) as Array<{
    captured_at?: string | null;
    attachment_possible_orphan_original_count?: number | null;
    attachment_missing_variants_count?: number | null;
  }>)[0];
  if (snapshot?.captured_at) {
    const ageDays = (now.getTime() - new Date(snapshot.captured_at).getTime()) / 86_400_000;
    if (ageDays <= SNAPSHOT_MAX_AGE_DAYS) {
      const orphans = num(snapshot.attachment_possible_orphan_original_count);
      const missing = num(snapshot.attachment_missing_variants_count);
      if (orphans >= ORPHAN_DANGER_COUNT) {
        signals.push({ tone: "danger", text: `Вкладення: ${orphans} orphan-файлів, ${missing} без прев'ю` });
      } else if (orphans > 0 || missing > 0) {
        signals.push({ tone: "warning", text: `Вкладення: ${orphans} orphan, ${missing} без прев'ю` });
      } else {
        signals.push({ tone: "good", text: "Вкладення: сміття не накопичується" });
      }
    }
  }

  // 7. Цілісність даних.
  signals.push(...integrity);

  return signals;
}

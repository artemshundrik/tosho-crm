import type { SupabaseClient } from "@supabase/supabase-js";

// Пороги — зі спільного модуля, який використовує й сторінка Observability.
// Тримати їх тут власною копією означало б, що сторінка, звіт і бот з часом
// почнуть давати різні оцінки одному стану — а це вбиває довіру до всіх трьох.
import {
  CRON_HTTP_TIMEOUT_WARN,
  PRO_STORAGE_LIMIT_BYTES,
  classifyAiBudget,
  classifyAiCost,
  classifyAttachmentHygiene,
  classifyBackupAge,
  classifyCronJob,
  isSettledCronIncident,
  classifyDeadTuples,
  classifyDeadlocks,
  classifyRuntimeErrors,
  classifyStorageUsage,
  worstHealthTone,
  type HealthTone,
} from "../../src/lib/systemHealthThresholds";
import { collectDropboxHealth, hasDropboxProblems } from "./_lib/dropboxHealth";
import { STACK_SNAPSHOT } from "../../src/data/stackSnapshot.generated";
import { buildStackItems, stackSummaryText, stackTotals, type StackVersionRow } from "../../src/lib/stack";

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
  | "cron_http_timeouts"
  | "cron_ok"
  | "ai_cost"
  | "attachments"
  | "audit_trigger"
  | "runtime_errors"
  | "dropbox"
  | "stack"
  | "typescript_gate";

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
  schedule?: string | null;
  failures?: number | null;
  runs?: number | null;
  hours_since_last_run?: number | null;
  /** Скільки годин тому був ОСТАННІЙ збій. null — за добу збоїв не було. */
  hours_since_last_failure?: number | null;
};

/**
 * Останній запуск шукається у вікні 7 днів (scripts/daily-digests.sql), тож для
 * місячного джоба «немає запуску» — нормальний стан 24 дні з 30, а не поломка.
 * Саме через це у звіт щоранку лізли finance-month-close-soft (25 числа) і
 * -final (5 числа): обидва живі, просто їхній день ще не настав.
 *
 * Тому для рідкісних розкладів питаємо інше: чи МИНУВ у семиденному вікні день,
 * коли джоб мав відпрацювати. Минув і запуску немає — це справжня новина.
 * Не минув — мовчимо.
 */
/**
 * Скільки годин після пропущеного дня про це варто казати.
 *
 * Не 7 днів (вікно пошуку останнього запуску): джоб, створений ПІСЛЯ свого
 * числа, нічого не пропускав, а виглядав би винним ще тиждень — рівно так
 * finance-month-close-final потрапив у звіт 11.08, хоча його 5-те число минуло
 * ще до того, як його завели. 36 годин — це рівно один-два ранкові звіти
 * одразу після пропуску, тобто тоді, коли з цим ще можна щось зробити.
 */
const MISSED_RUN_WINDOW_HOURS = 36;

/** Розклад, який стріляє рідше за вікно пошуку останнього запуску: число в дні місяця. */
export function isRareSchedule(schedule: string | null | undefined): boolean {
  const fields = (schedule ?? "").trim().split(/\s+/);
  if (fields.length < 5) return false;
  return fields[2] !== "*" || fields[3] !== "*";
}

/**
 * Коли рідкісний джоб мав відпрацювати востаннє (мс UTC), або null.
 *
 * Розбираємо лише просту форму «хв год ЧИСЛО * *» — саме такі в нас місячні.
 * Складніші вирази (списки, кроки) сюди не доходять: краще змовчати, ніж
 * вигадати розклад.
 */
function lastRareOccurrence(schedule: string | null | undefined, now: Date): number | null {
  const fields = (schedule ?? "").trim().split(/\s+/);
  if (fields.length < 5) return null;
  const [minuteField, hourField, domField, monthField] = fields;
  if (monthField !== "*" || !/^\d+$/.test(domField)) return null;
  const minute = Number(minuteField);
  const hour = Number(hourField);
  const day = Number(domField);
  if (!Number.isFinite(minute) || !Number.isFinite(hour)) return null;

  const previous = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, minute);
  return previous <= now.getTime()
    ? previous
    : Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day, hour, minute);
}

export function missedRareRun(schedule: string | null | undefined, now: Date): boolean {
  const occurrence = lastRareOccurrence(schedule, now);
  if (occurrence === null) return false;
  const hoursSinceOccurrence = (now.getTime() - occurrence) / 3_600_000;
  return hoursSinceOccurrence <= MISSED_RUN_WINDOW_HOURS;
}

/**
 * Чи встиг рідкісний джоб відпрацювати ПІСЛЯ свого останнього спрацювання за
 * розкладом.
 *
 * Стеля «доба без запуску» описує щоденні джоби. Для місячного вона бреше:
 * 26.08.2026 власнику прилетів червоний алерт «finance-month-close-soft: не
 * запускався 27 год» — а джоб відпрацював 25-го о 06:00 рівно за розкладом і
 * повернув «1 row». Так виглядав би КОЖЕН місяць: шість днів червоного, доки
 * успішний запуск не випаде із семиденного вікна пошуку й гілка «жодного
 * запуску» не візьме своє.
 */
export function ranSinceLastRareOccurrence(
  schedule: string | null | undefined,
  now: Date,
  hoursSinceLastRun: number
): boolean {
  const occurrence = lastRareOccurrence(schedule, now);
  if (occurrence === null) return false;
  return now.getTime() - hoursSinceLastRun * 3_600_000 >= occurrence;
}

/**
 * «35 хв тому» / «4 год тому». Хвилини лише поки менше години: на добовому
 * лічильнику точність до хвилини нічого не додає, а рядок робить довшим.
 */
function formatAgo(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return "";
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes} хв тому`;
  }
  return `${Math.round(hours)} год тому`;
}

export function cronSignals(
  jobs: CronJobRow[],
  httpFailures: number | null,
  httpTimeouts: number | null,
  now: Date
): Signal[] {
  if (jobs.length === 0) return [{ tone: "neutral", text: "Cron: статус недоступний" }];

  const signals: Signal[] = [];
  let healthy = 0;

  for (const job of jobs) {
    const name = (job.jobname ?? "—").trim();
    const failures = num(job.failures);
    const hoursSince = job.hours_since_last_run == null ? null : num(job.hours_since_last_run);
    const hoursSinceFailure =
      job.hours_since_last_failure == null ? null : num(job.hours_since_last_failure);
    const tone = classifyCronJob({
      hoursSinceLastRun: hoursSince,
      failures,
      hoursSinceLastFailure: hoursSinceFailure,
    });

    if (tone === "good") {
      healthy += 1;
      continue;
    }
    // Порожня історія ≠ поламаний джоб: у місячного вона порожня майже завжди,
    // бо вікно пошуку — тиждень. Питаємо, чи минув його день (див. missedRareRun).
    if (hoursSince === null) {
      if (isRareSchedule(job.schedule)) {
        if (!missedRareRun(job.schedule, now)) {
          healthy += 1;
          continue;
        }
        signals.push({
          tone,
          code: "cron_never_ran",
          text: `Cron ${name}: день за розкладом минув, а запуску не було`,
        });
        continue;
      }
      signals.push({ tone, code: "cron_never_ran", text: `Cron ${name}: жодного запуску за 7 днів` });
      continue;
    }
    if (failures > 0) {
      // Минулу аварію називаємо минулою. Інакше нічні збої світять червоним до
      // наступного вечора, бо рахуються за добу, — і за пів дня привчають, що
      // червоне можна не читати.
      const settled = isSettledCronIncident({
        hoursSinceLastRun: hoursSince,
        hoursSinceLastFailure: hoursSinceFailure,
      });
      /**
       * КОЛИ був останній збій — кажемо ЗАВЖДИ, а не лише коли він минув.
       *
       * 20.08.2026 о 12:20 прилетіло «158 збоїв за добу» червоним: 152 з них
       * сталися вночі в одному вікні, а свіжих було шість. З рядка цього не
       * було видно взагалі, і власник справедливо спитав, чому «знову», якщо
       * виправляли. Лічильник за добу без позначки часу — це напівправда.
       */
      const when = formatAgo(hoursSinceFailure);
      const tail = settled
        ? `, останній ${when} — відтоді працює`
        : when
          ? `, останній ${when}`
          : "";
      signals.push({ tone, code: "cron_failures", text: `Cron ${name}: ${failures} збоїв за добу${tail}` });
      continue;
    }
    // Рідкісний розклад міряємо його ж розкладом, а не добою: джоб, який
    // відпрацював після останнього спрацювання за розкладом, здоровий, хай і
    // «мовчить» третій тиждень поспіль.
    if (isRareSchedule(job.schedule) && ranSinceLastRareOccurrence(job.schedule, now, hoursSince)) {
      healthy += 1;
      continue;
    }
    signals.push({ tone, code: "cron_stale", text: `Cron ${name}: не запускався ${Math.round(hoursSince)} год` });
  }

  if (healthy > 0) {
    signals.push({ tone: "good", code: "cron_ok", text: `Cron: ${healthy}/${jobs.length} джобів без збоїв за добу` });
  }
  if (httpFailures !== null && httpFailures > 0) {
    signals.push({
      tone: "warning",
      code: "cron_http_failures",
      text: `Cron-виклики з помилкою (4xx/5xx): ${httpFailures} за добу`,
    });
  }
  // Таймаут pg_net — це «не дочекались відповіді за 30 с», а не «робота не
  // виконалась»: виклики fire-and-forget, функція біжить далі сама. За добу їх
  // буває 2-3 на кілька тисяч викликів, і щоразу це давало жовтий рядок «HTTP-
  // помилок: 1», за яким не стояло нічого. Тепер кажемо лише про СИСТЕМНУ
  // повільність, коли таймаути стають регулярними.
  if (httpTimeouts !== null && httpTimeouts >= CRON_HTTP_TIMEOUT_WARN) {
    signals.push({
      tone: "warning",
      code: "cron_http_timeouts",
      text: `Cron-виклики не вкладаються у 30 с: ${httpTimeouts} за добу`,
    });
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
  const httpTimeouts = metrics.cron_http_timeouts_24h == null ? null : num(metrics.cron_http_timeouts_24h);
  signals.push(...cronSignals(cronJobs, httpFailures, httpTimeouts, now));

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

  // 9. Падіння інтерфейсу в людей.
  signals.push(await runtimeErrorsSignal(admin, options.teamIds ?? [], now));

  // 10. Стек: чи не відстали залежності й чи немає відкритих дірок безпеки.
  signals.push(await stackSignal(admin));

  return signals;
}

/**
 * Стан стеку одним рядком — той самий, що на сторінці Dev → Стек.
 *
 * ЧОМУ ЧЕРВОНИМ ТІЛЬКИ ДІРКИ БЕЗПЕКИ. Відставання на мажор — це обслуговування,
 * а не аварія: воно триває тижнями й нікого не будить. Якби воно давало
 * `danger`, щогодинний алерт гудів би місяцями, і його перестали б читати —
 * рівно те, від чого застерігає таксономія порогів («обслуговування ніколи не
 * червоне»). Дірка безпеки — інша річ: вона має свою дату й закривається.
 *
 * ЧОМУ РЯДОК Є ЗАВЖДИ. Мовчання алерту двозначне: або чисто, або ланцюжок
 * зламався. Щоденний рядок «дірок безпеки немає» знімає цю двозначність — той
 * самий урок, що з журналом помилок (REQ-100).
 */
async function stackSignal(admin: SupabaseClient): Promise<Signal> {
  try {
    const { data, error } = await admin
      .schema("tosho")
      .from("stack_versions")
      .select("name,latest_version,latest_seen_at,checked_at,advisories,advisories_version,latest_published_at");
    if (error) throw error;

    const totals = stackTotals(buildStackItems(STACK_SNAPSHOT, (data as StackVersionRow[]) ?? []));
    const text = stackSummaryText(totals);

    if (totals.vulnerable > 0) {
      const critical = totals.worstSeverity === "high" || totals.worstSeverity === "critical";
      return { tone: critical ? "danger" : "warning", code: "stack", text };
    }
    // Ніколи не перевіряли — це не «добре», а «невідомо»: сірий рядок чесніший
    // за зелений, бо зелене тут означало б перевірку, якої не було.
    if (totals.checkedAt === null) return { tone: "neutral", code: "stack", text };
    return { tone: "good", code: "stack", text };
  } catch {
    return { tone: "neutral", code: "stack", text: "Стек: дані недоступні" };
  }
}

/**
 * Скільки разів за добу в когось зламався екран.
 *
 * Навіщо рядок, якщо є щогодинний алерт. Алерт мовчить про все, що вже
 * траплялось за останні 30 днів, — і це правильно, інакше та сама поломка
 * будила б щогодини. Але наслідок: мовчання бота однаково означає і «все
 * добре», і «поломка триває третій тиждень», і «ланцюжок сповіщень зламався».
 * Рядок у нічному звіті прибирає цю двозначність: він є ЗАВЖДИ, тож «жодної
 * за добу» — це доказ, що механізм живий, а не здогад.
 *
 * Журнал більше не збирає шум розробки (REQ-100), тож кожен рядок тут —
 * зламаний екран у живої людини.
 */
async function runtimeErrorsSignal(
  admin: SupabaseClient,
  teamIds: string[],
  now: Date
): Promise<Signal> {
  if (teamIds.length === 0) {
    return { tone: "neutral", code: "runtime_errors", text: "Помилки браузера: команду не визначено" };
  }
  try {
    const fromIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .schema("tosho")
      .from("runtime_errors")
      .select("user_id")
      .in("team_id", teamIds)
      .gte("created_at", fromIso)
      .limit(1000);
    if (error) throw error;

    const rows = (data ?? []) as Array<{ user_id: string | null }>;
    if (rows.length === 0) {
      return { tone: "good", code: "runtime_errors", text: "Помилки браузера: жодної за добу" };
    }
    const people = new Set(rows.map((row) => row.user_id).filter(Boolean)).size;
    const peopleLabel = people === 1 ? "в однієї людини" : `у ${people} людей`;
    return {
      tone: classifyRuntimeErrors(rows.length),
      code: "runtime_errors",
      text: `Помилки браузера: ${rows.length} за добу ${peopleLabel}`,
    };
  } catch (error) {
    // Той самий принцип, що з Dropbox: недоступність однієї перевірки не має
    // права зробити весь звіт неправдою.
    const message = error instanceof Error ? error.message : "невідома помилка";
    return { tone: "neutral", code: "runtime_errors", text: `Помилки браузера: стан недоступний (${message})` };
  }
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

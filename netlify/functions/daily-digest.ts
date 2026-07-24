import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { isChannelEnabled, isCategoryVisibleForRole } from "./_notificationCategories";
import { escapeTelegramHtml, getTelegramBotToken, sendTelegramMessage } from "./_telegram";
import { runSaleTotal, type QuoteRunPricingRow } from "./_lib/quotePricing";

// Щоденні дайджести в Telegram — див. docs/DAILY_DIGESTS_DESIGN.md.
//
//   ?kind=tech              — системний звіт (owner/admin), ранок
//   ?kind=business_morning  — «що сьогодні» (owner/admin + SEO), ранок
//   ?kind=business_evening  — «що сталося» (owner/admin + SEO), вечір
//   ?dry=1                  — відрендерити й повернути текст, нічого не слати
//   ?force=1                — проігнорувати захист «раз на добу»
//
// Доставка навмисно НЕ через deliverNotifications: той helper завжди пише рядок
// у дзвіночок і форматує «title + body + одна кнопка». Дайджест багаторядковий,
// з кількома кнопками, і щоденний — засмічувати ним дзвіночок не треба. Гейтинг
// каналу перевикористовуємо (isChannelEnabled), щоб налаштування лишались одні.

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
};

type DigestKind = "tech" | "business_morning" | "business_evening";

type Tone = "good" | "warning" | "danger" | "neutral";

type Signal = { tone: Tone; text: string };

// ГОТЧА, підтверджена на проді: ролі лежать у tosho.memberships_view, а НЕ в
// team_member_profiles (там їх просто немає). А workspace_id ≠ team_id:
// memberships мають workspace_id, тоді як quotes/orders/leads/finance_expenses
// скоупляться операційним team_id з public.team_members. Тому учасника
// збираємо з трьох джерел і носимо обидва id.
type MemberRow = {
  userId: string;
  workspaceId: string;
  teamId: string | null;
  accessRole: string | null;
  jobRole: string | null;
};

type SettingsRow = {
  user_id: string;
  telegram_chat_id: number | null;
  telegram_enabled: boolean | null;
  channel_prefs: Record<string, Record<string, boolean>> | null;
};

const TIME_ZONE = "Europe/Kiev";
const APP_URL = process.env.PUBLIC_APP_URL || "https://tosho.pro";

// Пороги — docs/DAILY_DIGESTS_DESIGN.md §4. Бекапи/storage/dead tuples
// збігаються з тим, що рахує сторінка Observability.
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
// впритул до 24 год, і рівний поріг давав би 🔴 на рівному місці.
const CRON_STALE_HOURS = 26;
const AI_WARN_USD = 5;
const AI_DANGER_USD = 15;
// Снапшот Observability пишеться лише коли адмін тисне «Оновити», тож старіші
// дані про orphan-вкладення в щоденний звіт не тягнемо.
const SNAPSHOT_MAX_AGE_DAYS = 7;
const PAYMENT_HORIZON_DAYS = 7;
const MAX_TIMER_SESSION_SECONDS = 8 * 60 * 60;

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

// --- Дати -------------------------------------------------------------------

/** «Сьогодні» як YYYY-MM-DD у Києві. */
function todayKeyInKiev(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function zonedWallClockOffsetMs(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - utcMs;
}

/**
 * «Плаваючий» wall-clock → реальний момент у вказаній зоні.
 * Копія логіки з quote-deadline-reminders.ts: дедлайни зберігаються як час,
 * який обрав користувач, позначений +00, а не як справжній UTC-момент.
 */
function wallClockToInstant(value: string, timeZone = TIME_ZONE): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return new Date(value);
  const [, y, mo, d, hh, mm, ss] = match;
  const base = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh ?? "0"), Number(mm ?? "0"), Number(ss ?? "0"));
  let instant = base - zonedWallClockOffsetMs(base, timeZone);
  instant = base - zonedWallClockOffsetMs(instant, timeZone);
  return new Date(instant);
}

/** Межі київської доби як справжні UTC-моменти. */
function kievDayBounds(dayKey: string): { startIso: string; endIso: string } {
  return {
    startIso: wallClockToInstant(`${dayKey}T00:00:00`).toISOString(),
    endIso: wallClockToInstant(`${shiftDays(dayKey, 1)}T00:00:00`).toISOString(),
  };
}

function formatDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Intl.DateTimeFormat("uk-UA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

// --- Форматування -----------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

const CURRENCY_SYMBOL: Record<string, string> = { UAH: "₴", USD: "$", EUR: "€" };

function formatMoney(amount: number, currency = "UAH"): string {
  const rounded = Math.round(amount);
  const grouped = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(rounded);
  return `${grouped} ${CURRENCY_SYMBOL[currency.toUpperCase()] ?? currency.toUpperCase()}`;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes} хв`;
  return minutes > 0 ? `${hours} год ${minutes} хв` : `${hours} год`;
}

function formatHoursAgo(hours: number | null): string {
  if (hours === null) return "невідомо";
  if (hours < 48) return `${Math.round(hours)} год тому`;
  return `${Math.round(hours / 24)} дн тому`;
}

const TONE_RANK: Record<Tone, number> = { neutral: 0, good: 1, warning: 2, danger: 3 };
const TONE_EMOJI: Record<Tone, string> = { neutral: "⚪️", good: "🟢", warning: "🟡", danger: "🔴" };

function worstTone(signals: Signal[]): Tone {
  return signals.reduce<Tone>((worst, s) => (TONE_RANK[s.tone] > TONE_RANK[worst] ? s.tone : worst), "good");
}

function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

// --- Отримувачі -------------------------------------------------------------

type AdminClient = SupabaseClient;

async function loadMembers(admin: AdminClient): Promise<MemberRow[]> {
  const [membershipsResult, profilesResult, teamsResult] = await Promise.all([
    admin.schema("tosho").from("memberships_view").select("workspace_id,user_id,access_role,job_role").limit(10000),
    admin.schema("tosho").from("team_member_profiles").select("user_id,employment_status").limit(10000),
    admin.from("team_members").select("user_id,team_id").limit(10000),
  ]);
  if (membershipsResult.error) throw new Error(`memberships_view: ${membershipsResult.error.message}`);
  if (profilesResult.error) throw new Error(`team_member_profiles: ${profilesResult.error.message}`);
  if (teamsResult.error) throw new Error(`team_members: ${teamsResult.error.message}`);

  const statusByUser = new Map<string, string>();
  for (const row of ((profilesResult.data ?? []) as Array<{ user_id?: string | null; employment_status?: string | null }>)) {
    if (row.user_id) statusByUser.set(row.user_id, (row.employment_status ?? "").trim().toLowerCase());
  }

  const teamByUser = new Map<string, string>();
  for (const row of ((teamsResult.data ?? []) as Array<{ user_id?: string | null; team_id?: string | null }>)) {
    if (row.user_id && row.team_id) teamByUser.set(row.user_id, row.team_id);
  }

  const members: MemberRow[] = [];
  for (const row of ((membershipsResult.data ?? []) as Array<{
    workspace_id?: string | null;
    user_id?: string | null;
    access_role?: string | null;
    job_role?: string | null;
  }>)) {
    if (!row.workspace_id || !row.user_id) continue;
    // Звільнені/відхилені не отримують нічого. Відсутній профіль не привід
    // виключати — виключаємо лише за явним статусом.
    const status = statusByUser.get(row.user_id);
    if (status === "inactive" || status === "rejected") continue;
    members.push({
      userId: row.user_id,
      workspaceId: row.workspace_id,
      teamId: teamByUser.get(row.user_id) ?? null,
      accessRole: row.access_role ?? null,
      jobRole: row.job_role ?? null,
    });
  }
  return members;
}

/** Операційні team_id для бізнес-таблиць (НЕ workspace_id). */
function resolveTeamIds(members: MemberRow[]): string[] {
  return Array.from(new Set(members.map((m) => m.teamId).filter((v): v is string => Boolean(v))));
}

// --- Тех-звіт ---------------------------------------------------------------

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
    return { tone: "danger", text: `Backup ${label}: останній run впав${latest.error_message ? ` — ${latest.error_message}` : ""}` };
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
  if (jobs.length === 0) {
    return [{ tone: "neutral", text: "Cron: статус недоступний" }];
  }

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

async function buildTechDigest(admin: AdminClient, now: Date, todayKey: string) {
  const yesterdayKey = shiftDays(todayKey, -1);
  const yesterday = kievDayBounds(yesterdayKey);

  const [metricsResult, backupsResult, aiResult, snapshotResult] = await Promise.all([
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
      .gte("created_at", yesterday.startIso)
      .lt("created_at", yesterday.endIso)
      .limit(20000),
    admin
      .schema("tosho")
      .from("admin_observability_snapshots")
      .select("captured_at,attachment_possible_orphan_original_count,attachment_missing_variants_count")
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
    signals.push({ tone: "good", text: `Бекапи: ${dbBackup.text} · ${filesBackup.text}` });
  } else {
    signals.push(dbBackup, filesBackup);
  }

  // 2. Storage від ліміту Pro.
  const storageBytes = num(metrics.storage_bytes);
  const storagePercent = (storageBytes / PRO_STORAGE_LIMIT_BYTES) * 100;
  const storageText = `Storage: ${storagePercent.toFixed(1)}% від ліміту Pro (${formatBytes(storageBytes)})`;
  signals.push({
    tone:
      storagePercent >= STORAGE_DANGER_PERCENT ? "danger" : storagePercent >= STORAGE_WARN_PERCENT ? "warning" : "good",
    text: storageText,
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
    signals.push({
      tone: "warning",
      text: `Dead tuples ${deadRatio.toFixed(0)}%${deadTable ? ` у ${deadTable}` : ""}`,
    });
  } else {
    signals.push({ tone: "good", text: `База: ${formatBytes(dbSize)} · deadlocks 0 · dead tuples у нормі` });
  }

  // 4. Cron.
  const cronJobs = Array.isArray(metrics.cron_jobs) ? (metrics.cron_jobs as CronJobRow[]) : [];
  const httpFailures = metrics.cron_http_failures_24h == null ? null : num(metrics.cron_http_failures_24h);
  signals.push(...cronSignals(cronJobs, httpFailures));

  // 5. AI-кости за вчора. Помилку запиту не ховаємо за «$0.00».
  if (aiResult.error) {
    signals.push({ tone: "neutral", text: "AI-кости: дані недоступні" });
  } else {
    const aiCost = ((aiResult.data ?? []) as Array<{ cost_usd?: number | string | null }>).reduce(
      (sum, row) => sum + num(row.cost_usd),
      0
    );
    signals.push({
      tone: aiCost > AI_DANGER_USD ? "danger" : aiCost > AI_WARN_USD ? "warning" : "good",
      text: `AI за вчора: $${aiCost.toFixed(2)}`,
    });
  }

  // 6. Гігієна вкладень — лише зі свіжого снапшота (крона для нього немає).
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

  return renderTechMessage(signals, todayKey);
}

function renderTechMessage(signals: Signal[], todayKey: string) {
  const tone = worstTone(signals);
  const problems = signals.filter((s) => s.tone === "warning" || s.tone === "danger");
  const good = signals.filter((s) => s.tone === "good");
  const neutral = signals.filter((s) => s.tone === "neutral");

  const lines: string[] = [`<b>${TONE_EMOJI[tone]} Система за ніч — ${escapeTelegramHtml(formatDayLabel(todayKey))}</b>`, ""];

  if (problems.length === 0) {
    // Усе зелене — друкуємо як є, без емодзі на кожному рядку.
    for (const s of good) lines.push(escapeTelegramHtml(s.text));
  } else {
    for (const s of problems) lines.push(`${TONE_EMOJI[s.tone]} ${escapeTelegramHtml(s.text)}`);
    if (good.length > 0) {
      lines.push("", `🟢 Решта в нормі: ${escapeTelegramHtml(good.map((s) => s.text).join(" · "))}`);
    }
  }
  for (const s of neutral) lines.push(`${TONE_EMOJI[s.tone]} ${escapeTelegramHtml(s.text)}`);

  return {
    tone,
    text: lines.join("\n"),
    keyboard: [[{ text: "Відкрити Observability", url: `${APP_URL}/admin/observability` }]],
  };
}

// --- Бізнес-метрики ---------------------------------------------------------

const CLOSED_QUOTE_STATUSES = ["approved", "cancelled", "canceled", "rejected"];
const ACTIVE_DESIGN_STATUSES = ["new", "changes", "in_progress"];

type QuoteRow = {
  id: string;
  status?: string | null;
  deadline_at?: string | null;
  created_at?: string | null;
  decided_at?: string | null;
};

type DesignTaskRow = {
  id: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Сума прорахунків за їхніми run-ами (quotes.total — застарілий снапшот). */
async function sumQuotesByRuns(admin: AdminClient, quoteIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (quoteIds.length === 0) return totals;

  const { data, error } = await admin
    .schema("tosho")
    .from("quote_item_runs")
    .select(
      "quote_id,quantity,unit_price_model,unit_price_print,logistics_cost,desired_manager_income,manager_rate,fixed_cost_rate,vat_rate"
    )
    .in("quote_id", quoteIds)
    .limit(20000);
  if (error) throw new Error(`quote_item_runs: ${error.message}`);

  for (const run of ((data ?? []) as QuoteRunPricingRow[])) {
    const quoteId = run.quote_id;
    if (!quoteId) continue;
    totals.set(quoteId, (totals.get(quoteId) ?? 0) + runSaleTotal(run));
  }
  return totals;
}

async function loadActiveDesignTasks(admin: AdminClient, memberIds: string[]): Promise<DesignTaskRow[]> {
  if (memberIds.length === 0) return [];
  // Дизайн-задача — це рядок activity_log, а не таблиця; статус лежить у JSON.
  const { data, error } = await admin
    .from("activity_log")
    .select("id,entity_id,metadata")
    .eq("action", "design_task")
    .in("user_id", memberIds)
    .in("metadata->>status", ACTIVE_DESIGN_STATUSES)
    .limit(5000);
  if (error) throw new Error(`activity_log (design_task): ${error.message}`);
  return (data ?? []) as DesignTaskRow[];
}

function designDeadlineKey(task: DesignTaskRow): string | null {
  const metadata = task.metadata ?? {};
  const raw = metadata.design_deadline ?? metadata.deadline;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function pendingChangeRequests(task: DesignTaskRow): number {
  const list = (task.metadata ?? {}).design_brief_change_requests;
  if (!Array.isArray(list)) return 0;
  return list.filter((cr) => {
    const status = (cr as { status?: unknown } | null)?.status;
    return typeof status === "string" && status.trim().toLowerCase() === "pending";
  }).length;
}

async function buildBusinessMorning(admin: AdminClient, members: MemberRow[], now: Date, todayKey: string) {
  const teamIds = resolveTeamIds(members);
  const memberIds = Array.from(new Set(members.map((m) => m.userId)));
  const yesterdayKey = shiftDays(todayKey, -1);
  const yesterday = kievDayBounds(yesterdayKey);
  const today = kievDayBounds(todayKey);
  const horizonKey = shiftDays(todayKey, PAYMENT_HORIZON_DAYS);

  const [quotesResult, tasks, paymentsResult, ordersResult] = await Promise.all([
    admin
      .schema("tosho")
      .from("quotes")
      .select("id,status,deadline_at")
      .in("team_id", teamIds)
      .not("deadline_at", "is", null)
      // Груба відсічка: deadline_at — floating wall-clock, тож пряме порівняння
      // з UTC-межею доби зрізало б вечірні дедлайни (різниця до 3 год). Беремо
      // із запасом, точну межу застосовуємо нижче через wallClockToInstant.
      .lt("deadline_at", `${shiftDays(todayKey, 2)}T00:00:00Z`)
      .limit(5000),
    loadActiveDesignTasks(admin, memberIds),
    admin
      .schema("tosho")
      .from("finance_expenses")
      .select("amount,currency,next_charge_date,is_recurring")
      .in("team_id", teamIds)
      .eq("is_recurring", true)
      .not("next_charge_date", "is", null)
      .gte("next_charge_date", todayKey)
      .lte("next_charge_date", horizonKey)
      .limit(2000),
    admin
      .schema("tosho")
      .from("orders")
      .select("id,quote_id,total,created_at")
      .in("team_id", teamIds)
      .gte("created_at", yesterday.startIso)
      .lt("created_at", yesterday.endIso)
      .limit(2000),
  ]);

  if (quotesResult.error) throw new Error(`quotes: ${quotesResult.error.message}`);
  if (paymentsResult.error) throw new Error(`finance_expenses: ${paymentsResult.error.message}`);
  if (ordersResult.error) throw new Error(`orders: ${ordersResult.error.message}`);

  // Дедлайни прорахунків — floating wall-clock, тому реінтерпретуємо в Києві.
  const openQuotes = ((quotesResult.data ?? []) as QuoteRow[]).filter(
    (q) => !CLOSED_QUOTE_STATUSES.includes((q.status ?? "").trim().toLowerCase())
  );
  let quotesDueToday = 0;
  let quotesOverdue = 0;
  for (const quote of openQuotes) {
    if (!quote.deadline_at) continue;
    const instant = wallClockToInstant(quote.deadline_at);
    if (instant.getTime() < now.getTime()) quotesOverdue += 1;
    else if (instant.toISOString() < today.endIso) quotesDueToday += 1;
  }

  let designDueToday = 0;
  let designOverdue = 0;
  let pendingRevisions = 0;
  for (const task of tasks) {
    pendingRevisions += pendingChangeRequests(task);
    const deadlineKey = designDeadlineKey(task);
    if (!deadlineKey) continue;
    if (deadlineKey === todayKey) designDueToday += 1;
    else if (deadlineKey < todayKey) designOverdue += 1;
  }

  // Платежі на горизонті — групуємо за валютою.
  const paymentsByCurrency = new Map<string, { sum: number; count: number }>();
  for (const row of ((paymentsResult.data ?? []) as Array<{ amount?: number | string | null; currency?: string | null }>)) {
    const currency = (row.currency ?? "UAH").toUpperCase();
    const entry = paymentsByCurrency.get(currency) ?? { sum: 0, count: 0 };
    entry.sum += num(row.amount);
    entry.count += 1;
    paymentsByCurrency.set(currency, entry);
  }

  // Вчорашні замовлення — сума з run-ів прив'язаного прорахунку, а не з
  // orders.total (він успадковує застарілий quotes.total).
  const orders = (ordersResult.data ?? []) as Array<{ id: string; quote_id?: string | null; total?: number | string | null }>;
  const orderQuoteIds = orders.map((o) => o.quote_id).filter((v): v is string => Boolean(v));
  const orderQuoteTotals = await sumQuotesByRuns(admin, orderQuoteIds);
  const ordersSum = orders.reduce((sum, order) => {
    const fromRuns = order.quote_id ? orderQuoteTotals.get(order.quote_id) ?? 0 : 0;
    return sum + (fromRuns > 0 ? fromRuns : num(order.total));
  }, 0);

  // --- рендер ---
  const lines: string[] = [`<b>🌅 План на день — ${escapeTelegramHtml(formatDayLabel(todayKey))}</b>`];

  if (quotesDueToday > 0 || designDueToday > 0) {
    lines.push("", "<b>Дедлайни сьогодні</b>");
    if (quotesDueToday > 0) lines.push(`• Прорахунки: ${quotesDueToday}`);
    if (designDueToday > 0) lines.push(`• Макети: ${designDueToday}`);
  }

  if (quotesOverdue > 0 || designOverdue > 0 || pendingRevisions > 0) {
    lines.push("", "<b>Прострочено</b>");
    if (quotesOverdue > 0) lines.push(`• Прорахунки: ${quotesOverdue}`);
    if (designOverdue > 0) lines.push(`• Макети: ${designOverdue}`);
    if (pendingRevisions > 0) lines.push(`• Правки без відповіді: ${pendingRevisions}`);
  }

  if (paymentsByCurrency.size > 0) {
    const parts = Array.from(paymentsByCurrency.entries()).map(
      ([currency, entry]) => `${formatMoney(entry.sum, currency)} (${entry.count})`
    );
    lines.push("", `Платежі найближчі ${PAYMENT_HORIZON_DAYS} днів: ${escapeTelegramHtml(parts.join(" · "))}`);
  }

  if (orders.length > 0) {
    lines.push(`Вчора нових замовлень: ${orders.length} на ${escapeTelegramHtml(formatMoney(ordersSum))}`);
  }

  if (lines.length === 1) {
    lines.push("", "Дедлайнів, прострочень і платежів на сьогодні немає.");
  }

  const tone: Tone = quotesOverdue > 0 || designOverdue > 0 ? "warning" : "good";
  return {
    tone,
    text: lines.join("\n"),
    keyboard: [
      [
        { text: "Прорахунки", url: `${APP_URL}/orders/estimates` },
        { text: "Дизайн", url: `${APP_URL}/design` },
      ],
      [{ text: "Фінанси", url: `${APP_URL}/finances` }],
    ],
  };
}

async function buildBusinessEvening(admin: AdminClient, members: MemberRow[], now: Date, todayKey: string) {
  const teamIds = resolveTeamIds(members);
  const memberIds = Array.from(new Set(members.map((m) => m.userId)));
  const today = kievDayBounds(todayKey);

  const [leadsResult, newQuotesResult, approvedQuotesResult, ordersResult, designApprovedResult, revisionsResult, timerResult, aiResult] =
    await Promise.all([
      admin
        .schema("tosho")
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("team_id", teamIds)
        .gte("created_at", today.startIso)
        .lt("created_at", today.endIso),
      admin
        .schema("tosho")
        .from("quotes")
        .select("id")
        .in("team_id", teamIds)
        .gte("created_at", today.startIso)
        .lt("created_at", today.endIso)
        .limit(2000),
      admin
        .schema("tosho")
        .from("quotes")
        .select("id")
        .in("team_id", teamIds)
        .eq("status", "approved")
        .gte("decided_at", today.startIso)
        .lt("decided_at", today.endIso)
        .limit(2000),
      admin
        .schema("tosho")
        .from("orders")
        .select("id,quote_id,total")
        .in("team_id", teamIds)
        .gte("created_at", today.startIso)
        .lt("created_at", today.endIso)
        .limit(2000),
      admin
        .from("activity_log")
        .select("id", { count: "exact", head: true })
        .eq("action", "design_task_status")
        .eq("metadata->>to_status", "approved")
        .in("user_id", memberIds)
        .gte("created_at", today.startIso)
        .lt("created_at", today.endIso),
      admin
        .from("activity_log")
        .select("id", { count: "exact", head: true })
        .eq("action", "design_task_brief_change_request")
        .in("user_id", memberIds)
        .gte("created_at", today.startIso)
        .lt("created_at", today.endIso),
      admin
        .from("design_task_timer_sessions")
        .select("user_id,started_at,paused_at")
        .in("user_id", memberIds)
        .gte("started_at", today.startIso)
        .lt("started_at", today.endIso)
        .limit(5000),
      admin
        .schema("tosho")
        .from("ai_usage")
        .select("cost_usd")
        .gte("created_at", today.startIso)
        .lt("created_at", today.endIso)
        .limit(20000),
    ]);

  // Вечірній звіт — це цифри дня. Тихо надрукувати нулі через помилку запиту
  // гірше, ніж не надрукувати нічого: читач вирішить, що день був порожній.
  for (const [label, result] of [
    ["leads", leadsResult],
    ["quotes", newQuotesResult],
    ["quotes (approved)", approvedQuotesResult],
    ["orders", ordersResult],
    ["activity_log (design)", designApprovedResult],
    ["activity_log (revisions)", revisionsResult],
    ["design_task_timer_sessions", timerResult],
    ["ai_usage", aiResult],
  ] as const) {
    if (result.error) throw new Error(`${label}: ${result.error.message}`);
  }

  const newLeads = leadsResult.count ?? 0;

  const newQuoteIds = ((newQuotesResult.data ?? []) as Array<{ id: string }>).map((q) => q.id);
  const approvedQuoteIds = ((approvedQuotesResult.data ?? []) as Array<{ id: string }>).map((q) => q.id);
  const orders = (ordersResult.data ?? []) as Array<{ id: string; quote_id?: string | null; total?: number | string | null }>;
  const orderQuoteIds = orders.map((o) => o.quote_id).filter((v): v is string => Boolean(v));

  const runTotals = await sumQuotesByRuns(
    admin,
    Array.from(new Set([...newQuoteIds, ...approvedQuoteIds, ...orderQuoteIds]))
  );
  const sumOf = (ids: string[]) => ids.reduce((sum, id) => sum + (runTotals.get(id) ?? 0), 0);
  const ordersSum = orders.reduce((sum, order) => {
    const fromRuns = order.quote_id ? runTotals.get(order.quote_id) ?? 0 : 0;
    return sum + (fromRuns > 0 ? fromRuns : num(order.total));
  }, 0);

  const designApproved = designApprovedResult.count ?? 0;
  const newRevisions = revisionsResult.count ?? 0;

  // Таймери: кожну сесію обрізаємо до 8 год — забуті таймери інакше отруюють суму.
  const sessions = (timerResult.data ?? []) as Array<{ user_id: string; started_at: string; paused_at?: string | null }>;
  let timerSeconds = 0;
  const designers = new Set<string>();
  for (const session of sessions) {
    const start = new Date(session.started_at).getTime();
    const end = session.paused_at ? new Date(session.paused_at).getTime() : now.getTime();
    const seconds = Math.min(MAX_TIMER_SESSION_SECONDS, Math.max(0, Math.floor((end - start) / 1000)));
    if (seconds <= 0) continue;
    timerSeconds += seconds;
    designers.add(session.user_id);
  }

  const aiCost = ((aiResult.data ?? []) as Array<{ cost_usd?: number | string | null }>).reduce(
    (sum, row) => sum + num(row.cost_usd),
    0
  );

  // --- рендер ---
  const lines: string[] = [`<b>📊 День у ToSho — ${escapeTelegramHtml(formatDayLabel(todayKey))}</b>`];

  const salesLines: string[] = [];
  if (newLeads > 0) salesLines.push(`• Нові ліди: ${newLeads}`);
  if (newQuoteIds.length > 0) {
    salesLines.push(`• Нові прорахунки: ${newQuoteIds.length} на ${escapeTelegramHtml(formatMoney(sumOf(newQuoteIds)))}`);
  }
  if (approvedQuoteIds.length > 0) {
    salesLines.push(
      `• Затверджено прорахунків: ${approvedQuoteIds.length} на ${escapeTelegramHtml(formatMoney(sumOf(approvedQuoteIds)))}`
    );
  }
  if (orders.length > 0) {
    salesLines.push(`• Нові замовлення: ${orders.length} на ${escapeTelegramHtml(formatMoney(ordersSum))}`);
  }
  if (salesLines.length > 0) lines.push("", "<b>Продажі</b>", ...salesLines);

  const designLines: string[] = [];
  if (designApproved > 0) designLines.push(`• Затверджено макетів: ${designApproved}`);
  if (newRevisions > 0) designLines.push(`• Нових правок: ${newRevisions}`);
  if (timerSeconds > 0) {
    designLines.push(`• Час за таймерами: ${formatDuration(timerSeconds)} (${designers.size})`);
  }
  if (designLines.length > 0) lines.push("", "<b>Дизайн</b>", ...designLines);

  if (aiCost > 0) lines.push("", `AI за сьогодні: $${aiCost.toFixed(2)}`);

  // Порожній звіт краще за мовчанку: інакше не відрізниш вихідний від зламаного cron.
  if (lines.length === 1) lines.push("", "За сьогодні активності не було.");

  return {
    tone: "good" as Tone,
    text: lines.join("\n"),
    keyboard: [
      [
        { text: "Прорахунки", url: `${APP_URL}/orders/estimates` },
        { text: "Дизайн", url: `${APP_URL}/design` },
      ],
      [{ text: "Замовлення", url: `${APP_URL}/orders` }],
    ],
  };
}

// --- Доставка ---------------------------------------------------------------

async function sendDigest(
  admin: AdminClient,
  recipients: MemberRow[],
  category: "admin_digest" | "business_digest",
  text: string,
  keyboard: Array<Array<{ text: string; url: string }>>
) {
  if (!getTelegramBotToken()) return { delivered: 0, failed: 0, eligible: 0 };

  const userIds = recipients.map((m) => m.userId);
  if (userIds.length === 0) return { delivered: 0, failed: 0, eligible: 0 };

  const { data, error } = await admin
    .schema("tosho")
    .from("user_notification_settings")
    .select("user_id,telegram_chat_id,telegram_enabled,channel_prefs")
    .in("user_id", userIds);
  if (error) throw new Error(`user_notification_settings: ${error.message}`);

  const settings = new Map<string, SettingsRow>();
  for (const row of ((data ?? []) as SettingsRow[])) settings.set(row.user_id, row);

  let delivered = 0;
  let failed = 0;
  let eligible = 0;

  for (const userId of userIds) {
    const setting = settings.get(userId);
    if (!setting || setting.telegram_chat_id == null) continue; // Telegram не підключено
    if (setting.telegram_enabled === false) continue; // глобальний тумблер вимкнено
    if (!isChannelEnabled(setting.channel_prefs, category, "telegram")) continue; // категорію вимкнено

    eligible += 1;
    const result = await sendTelegramMessage(setting.telegram_chat_id, text, {
      parseMode: "HTML",
      replyMarkup: { inline_keyboard: keyboard },
      disablePreview: true,
    });

    if (result.ok) {
      delivered += 1;
      continue;
    }
    failed += 1;
    // 403 = бот заблокований користувачем → тиха відв'язка (як у _notificationDelivery).
    if (result.status === 403 || result.errorCode === 403) {
      await admin
        .schema("tosho")
        .from("user_notification_settings")
        .update({ telegram_chat_id: null })
        .eq("user_id", userId);
    }
  }

  return { delivered, failed, eligible };
}

// --- Handler ----------------------------------------------------------------

const VALID_KINDS: DigestKind[] = ["tech", "business_morning", "business_evening"];

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  // _cronAuth свідомо fail-open, поки CRON_SHARED_SECRET не виставлено — це
  // вікно міграції для функцій, які лише ПИШУТЬ нотифікації. Тут інакше:
  // ?dry=1 віддає готовий звіт (виторг, ліди, розмір бази) прямо в тілі
  // відповіді. Тому для дайджесту вимагаємо секрет беззастережно, щоб
  // забутий env-var не перетворився на публічний фінансовий дамп.
  if (!process.env.CRON_SHARED_SECRET) {
    return jsonResponse(503, { error: "CRON_SHARED_SECRET is not configured" });
  }
  const denial = assertCronAuthorized(event);
  if (denial) return denial;

  const query = event.queryStringParameters ?? {};
  const kind = (query.kind ?? "").trim() as DigestKind;
  if (!VALID_KINDS.includes(kind)) {
    return jsonResponse(400, { error: `Unknown kind. Expected one of: ${VALID_KINDS.join(", ")}` });
  }
  const dryRun = query.dry === "1" || query.dry === "true";
  const force = query.force === "1" || query.force === "true";

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse(500, { error: "Missing Supabase env vars" });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const now = new Date();
    const todayKey = todayKeyInKiev(now);
    const category = kind === "tech" ? "admin_digest" : "business_digest";

    const members = await loadMembers(admin);
    const recipients = members.filter((m) =>
      isCategoryVisibleForRole(category, { accessRole: m.accessRole, jobRole: m.jobRole })
    );

    const digest =
      kind === "tech"
        ? await buildTechDigest(admin, now, todayKey)
        : kind === "business_morning"
          ? await buildBusinessMorning(admin, members, now, todayKey)
          : await buildBusinessEvening(admin, members, now, todayKey);

    if (dryRun) {
      return jsonResponse(200, {
        success: true,
        dryRun: true,
        kind,
        date: todayKey,
        tone: digest.tone,
        recipients: recipients.length,
        message: digest.text,
      });
    }

    // Ідемпотентність: заявка на добу. Конфлікт = дайджест уже відправлено.
    if (!force) {
      const claim = await admin
        .schema("tosho")
        .from("digest_log")
        .insert([{ kind, digest_date: todayKey, team_id: resolveTeamIds(members)[0] ?? null, tone: digest.tone }]);
      if (claim.error) {
        const duplicate = claim.error.code === "23505" || /duplicate key/i.test(claim.error.message ?? "");
        if (duplicate) return jsonResponse(200, { success: true, skipped: "already-sent", kind, date: todayKey });
        throw new Error(`digest_log: ${claim.error.message}`);
      }
    }

    const { delivered, failed, eligible } = await sendDigest(
      admin,
      recipients,
      category,
      digest.text,
      digest.keyboard
    );

    if (!force) {
      await admin
        .schema("tosho")
        .from("digest_log")
        .update({ recipients: eligible, delivered, failed })
        .eq("kind", kind)
        .eq("digest_date", todayKey);
    }

    return jsonResponse(200, {
      success: true,
      kind,
      date: todayKey,
      tone: digest.tone,
      recipients: recipients.length,
      eligible,
      delivered,
      failed,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse(500, { error: message });
  }
};

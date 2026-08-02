import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { isChannelEnabled, isCategoryVisibleForRole } from "./_notificationCategories";
import { escapeTelegramHtml, getTelegramBotToken, sendTelegramMessage } from "./_telegram";
import { runSaleTotal, type QuoteRunPricingRow } from "./_lib/quotePricing";
import { formatLastSeen, loadPresence, shortName } from "./_teamAssistant";
import { ABSENCE_KIND_LABELS, formatAbsenceShort } from "./_lib/absenceSubmit";
import {
  TONE_EMOJI,
  collectSystemSignals,
  worstTone,
  type Signal,
  type Tone,
} from "./_systemHealth";

// Щоденні дайджести в Telegram — див. docs/DAILY_DIGESTS_DESIGN.md.
//
//   ?kind=tech              — системний звіт (owner/admin), ранок
//   ?kind=business_morning  — «що сьогодні» (owner/admin + SEO), ранок
//   ?kind=business_evening  — «що сталося» (owner/admin + SEO), вечір
//   ?dry=1                  — відрендерити й повернути текст, нічого не слати
//   ?force=1                — проігнорувати захист «раз на добу»
//   ?only=<email>           — надіслати лише одній людині (звужує коло, не
//                             розширює: рольовий гейт застосовується першим)
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
  email: string | null;
  fullName: string | null;
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
const PAYMENT_HORIZON_DAYS = 7;
const MAX_TIMER_SESSION_SECONDS = 8 * 60 * 60;
// Прорахунок «на погодженні», якого не чіпали стільки днів, — застояний.
// 30, а не 7: на проді ВСІ 54 прорахунки на погодженні старші за тиждень, тож
// поріг у 7 днів давав рядок «54 · без руху 54» — кваліфікатор, який дублює
// саме число і нічого не додає. Місяць уже відділяє живе від покинутого.
const PIPELINE_STALE_DAYS = 30;
// Прострочене рахуємо лише за останній місяць: у базі повно давно покинутих
// прорахунків із дедлайнами дворічної давнини, і без вікна цифра стає шумом.
const OVERDUE_WINDOW_DAYS = 30;
// Лід, який рухався в межах кварталу, але завмер на два тижні.
const LEAD_STALE_DAYS = 14;
const LEAD_RECENT_DAYS = 90;
// Активний співробітник, який стільки не заходив, — привід спитати, чи все гаразд.
const MEMBER_ABSENT_DAYS = 7;

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

function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

// --- Отримувачі -------------------------------------------------------------

type AdminClient = SupabaseClient;

async function loadMembers(admin: AdminClient): Promise<MemberRow[]> {
  const [membershipsResult, profilesResult, teamsResult] = await Promise.all([
    admin
      .schema("tosho")
      .from("memberships_view")
      .select("workspace_id,user_id,access_role,job_role,email")
      .limit(10000),
    // Імена беремо тут, а НЕ з memberships_view.full_name: на проді та колонка
    // порожня майже у всіх, і розбивки по людях виходили б «—».
    admin
      .schema("tosho")
      .from("team_member_profiles")
      .select("user_id,employment_status,first_name,last_name")
      .limit(10000),
    admin.from("team_members").select("user_id,team_id").limit(10000),
  ]);
  if (membershipsResult.error) throw new Error(`memberships_view: ${membershipsResult.error.message}`);
  if (profilesResult.error) throw new Error(`team_member_profiles: ${profilesResult.error.message}`);
  if (teamsResult.error) throw new Error(`team_members: ${teamsResult.error.message}`);

  const statusByUser = new Map<string, string>();
  const nameByUserId = new Map<string, string>();
  for (const row of ((profilesResult.data ?? []) as Array<{
    user_id?: string | null;
    employment_status?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  }>)) {
    if (!row.user_id) continue;
    statusByUser.set(row.user_id, (row.employment_status ?? "").trim().toLowerCase());
    const name = [row.first_name, row.last_name].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
    if (name) nameByUserId.set(row.user_id, name);
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
    email?: string | null;
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
      email: row.email ?? null,
      fullName: nameByUserId.get(row.user_id) ?? null,
    });
  }
  return members;
}

/** Операційні team_id для бізнес-таблиць (НЕ workspace_id). */
function resolveTeamIds(members: MemberRow[]): string[] {
  return Array.from(new Set(members.map((m) => m.teamId).filter((v): v is string => Boolean(v))));
}

// --- Тех-звіт ---------------------------------------------------------------

async function buildTechDigest(admin: AdminClient, now: Date, todayKey: string, teamIds: string[]) {
  const yesterdayKey = shiftDays(todayKey, -1);
  const yesterday = kievDayBounds(yesterdayKey);

  // Пороги й самі перевірки живуть у _systemHealth: той самий набір сигналів
  // віддає бот на питання «що не працює?», тож звіт і бот не розходяться.
  const signals = await collectSystemSignals(admin, now, {
    aiFromIso: yesterday.startIso,
    aiToIso: yesterday.endIso,
    aiLabel: "за вчора",
    teamIds,
  });

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

/**
 * Прорахунки, затверджені у вікні [startIso, endIso).
 *
 * Джерел три, зливаємо за id (дедуплікація робить об'єднання безпечним):
 *
 *  1. `quotes.decided_at` — з 2026-07-25 його надійно проставляє тригер
 *     `quotes_status_stamp_trg` при будь-якому шляху зміни статусу. Найточніше
 *     джерело для всього, що затверджено ПІСЛЯ цієї дати.
 *  2. `quote_status_history` — той самий тригер пише туди перехід. Дає ще й
 *     автора та нотатку.
 *  3. `quotes.status='approved'` + `updated_at` у вікні — запасний варіант для
 *     історичних записів (37 прорахунків затверджені до тригера й досі мають
 *     decided_at = NULL). Дає хибне спрацювання, якщо вже затверджений
 *     прорахунок просто відредагували, тому він лише третій.
 *
 * `activity_log` з `action='змінив статус'` більше не читаємо: його писав
 * застосунок в обхід бази, і він замовк 2026-07-01.
 */
async function approvedQuoteIds(
  admin: AdminClient,
  teamIds: string[],
  startIso: string,
  endIso: string
): Promise<string[]> {
  const [decidedResult, historyResult, snapshotResult] = await Promise.all([
    admin
      .schema("tosho")
      .from("quotes")
      .select("id")
      .in("team_id", teamIds)
      .eq("status", "approved")
      .gte("decided_at", startIso)
      .lt("decided_at", endIso)
      .limit(5000),
    admin
      .schema("tosho")
      .from("quote_status_history")
      .select("quote_id")
      .in("team_id", teamIds)
      .eq("to_status", "approved")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .limit(5000),
    // Запасний варіант для затверджених ДО появи тригера: у них decided_at
    // порожній, і крім updated_at спертися нема на що.
    admin
      .schema("tosho")
      .from("quotes")
      .select("id")
      .in("team_id", teamIds)
      .eq("status", "approved")
      .is("decided_at", null)
      .gte("updated_at", startIso)
      .lt("updated_at", endIso)
      .limit(5000),
  ]);
  if (decidedResult.error) throw new Error(`quotes (decided_at): ${decidedResult.error.message}`);
  if (historyResult.error) throw new Error(`quote_status_history: ${historyResult.error.message}`);
  if (snapshotResult.error) throw new Error(`quotes (approved fallback): ${snapshotResult.error.message}`);

  const ids = [
    ...((decidedResult.data ?? []) as Array<{ id?: string | null }>).map((r) => r.id),
    ...((historyResult.data ?? []) as Array<{ quote_id?: string | null }>).map((r) => r.quote_id),
    ...((snapshotResult.data ?? []) as Array<{ id?: string | null }>).map((r) => r.id),
  ].filter((v): v is string => Boolean(v));
  return Array.from(new Set(ids));
}

/** Перше число поточного місяця як YYYY-MM-DD (від київської «сьогодні»). */
function monthStartKey(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`;
}

/** Той самий відрізок місяця, але місяцем раніше — для порівняння «місяць до дати». */
function previousMonthRange(dayKey: string): { startKey: string; endKey: string } {
  const [y, m, d] = dayKey.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 2, 1));
  // Кламп на випадок 31-го числа у коротшому місяці.
  const daysInPrev = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(y, m - 2, Math.min(d, daysInPrev)));
  return { startKey: start.toISOString().slice(0, 10), endKey: end.toISOString().slice(0, 10) };
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

  const monthStart = monthStartKey(todayKey);
  const overdueFromIso = new Date(now.getTime() - OVERDUE_WINDOW_DAYS * 86_400_000).toISOString();

  const [
    quotesResult,
    tasks,
    paymentsResult,
    ordersResult,
    pipelineResult,
    monthQuotesResult,
    staleLeadsResult,
    recentLeadsResult,
  ] = await Promise.all([
    admin
      .schema("tosho")
      .from("quotes")
      .select("id,status,deadline_at")
      .in("team_id", teamIds)
      .not("deadline_at", "is", null)
      // Прострочене — лише за останній місяць (див. OVERDUE_WINDOW_DAYS).
      .gte("deadline_at", overdueFromIso)
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
    // Воронка: що зараз висить і скільки з цього застояло.
    admin
      .schema("tosho")
      .from("quotes")
      .select("id,status,updated_at")
      .in("team_id", teamIds)
      .in("status", ["awaiting_approval", "estimated"])
      .limit(5000),
    // Місяць до дати: скільки прорахунків завели й на яку суму.
    admin
      .schema("tosho")
      .from("quotes")
      .select("id")
      .in("team_id", teamIds)
      .gte("created_at", kievDayBounds(monthStart).startIso)
      .lt("created_at", today.endIso)
      .limit(5000),
    // Ліди, які рухались у межах кварталу, але завмерли.
    admin
      .schema("tosho")
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("team_id", teamIds)
      .gte("created_at", new Date(now.getTime() - LEAD_RECENT_DAYS * 86_400_000).toISOString())
      .lt("updated_at", new Date(now.getTime() - LEAD_STALE_DAYS * 86_400_000).toISOString()),
    // Скільки їх усього за той самий квартал — щоб застояні читались як частка.
    admin
      .schema("tosho")
      .from("leads")
      .select("id", { count: "exact", head: true })
      .in("team_id", teamIds)
      .gte("created_at", new Date(now.getTime() - LEAD_RECENT_DAYS * 86_400_000).toISOString()),
  ]);

  if (quotesResult.error) throw new Error(`quotes: ${quotesResult.error.message}`);
  if (paymentsResult.error) throw new Error(`finance_expenses: ${paymentsResult.error.message}`);
  if (ordersResult.error) throw new Error(`orders: ${ordersResult.error.message}`);
  if (pipelineResult.error) throw new Error(`quotes (pipeline): ${pipelineResult.error.message}`);
  if (monthQuotesResult.error) throw new Error(`quotes (month): ${monthQuotesResult.error.message}`);
  if (staleLeadsResult.error) throw new Error(`leads (stale): ${staleLeadsResult.error.message}`);
  if (recentLeadsResult.error) throw new Error(`leads (recent): ${recentLeadsResult.error.message}`);

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

  // Воронка.
  const pipeline = (pipelineResult.data ?? []) as Array<{ id: string; status?: string | null; updated_at?: string | null }>;
  const staleBefore = now.getTime() - PIPELINE_STALE_DAYS * 86_400_000;
  const awaitingApproval = pipeline.filter((q) => (q.status ?? "") === "awaiting_approval");
  const estimated = pipeline.filter((q) => (q.status ?? "") === "estimated");
  const awaitingStale = awaitingApproval.filter(
    (q) => q.updated_at && new Date(q.updated_at).getTime() < staleBefore
  ).length;
  const awaitingOldestDays = awaitingApproval.reduce((oldest, q) => {
    if (!q.updated_at) return oldest;
    const days = Math.floor((now.getTime() - new Date(q.updated_at).getTime()) / 86_400_000);
    return days > oldest ? days : oldest;
  }, 0);

  const monthQuoteIds = ((monthQuotesResult.data ?? []) as Array<{ id: string }>).map((q) => q.id);
  const staleLeads = staleLeadsResult.count ?? 0;

  // Вчорашні замовлення — сума з run-ів прив'язаного прорахунку, а не з
  // orders.total (він успадковує застарілий quotes.total).
  const orders = (ordersResult.data ?? []) as Array<{ id: string; quote_id?: string | null; total?: number | string | null }>;
  const orderQuoteIds = orders.map((o) => o.quote_id).filter((v): v is string => Boolean(v));

  const runTotals = await sumQuotesByRuns(admin, Array.from(new Set([...orderQuoteIds, ...monthQuoteIds])));
  const monthSum = monthQuoteIds.reduce((sum, id) => sum + (runTotals.get(id) ?? 0), 0);
  const ordersSum = orders.reduce((sum, order) => {
    const fromRuns = order.quote_id ? runTotals.get(order.quote_id) ?? 0 : 0;
    return sum + (fromRuns > 0 ? fromRuns : num(order.total));
  }, 0);

  // --- рендер ---
  const lines: string[] = [`<b>🌅 План на день — ${escapeTelegramHtml(formatDayLabel(todayKey))}</b>`];

  // Воронка йде першою: у тихий день це єдине, що взагалі має значення.
  const funnel: string[] = [];
  if (awaitingApproval.length > 0) {
    // Вік важливіший за просто кількість: 54 свіжих і 54 піврічних — різні речі.
    funnel.push(
      `• На погодженні: ${awaitingApproval.length}` +
        (awaitingStale > 0 ? ` · старші за ${PIPELINE_STALE_DAYS} днів: ${awaitingStale}` : "") +
        (awaitingOldestDays > 0 ? ` · найстарішому ${awaitingOldestDays} дн` : "")
    );
  }
  if (estimated.length > 0) funnel.push(`• Пораховано, чекає відправки: ${estimated.length}`);
  if (monthQuoteIds.length > 0) {
    funnel.push(
      `• Місяць: ${monthQuoteIds.length} нових прорахунків на ${escapeTelegramHtml(formatMoney(monthSum))}`
    );
  }
  if (funnel.length > 0) lines.push("", "<b>Воронка</b>", ...funnel);

  const todaySection: string[] = [];
  if (quotesDueToday > 0) todaySection.push(`• Дедлайни прорахунків: ${quotesDueToday}`);
  if (designDueToday > 0) todaySection.push(`• Дедлайни макетів: ${designDueToday}`);
  if (quotesOverdue > 0) todaySection.push(`• Прострочено прорахунків: ${quotesOverdue}`);
  if (designOverdue > 0) todaySection.push(`• Прострочено макетів: ${designOverdue}`);
  if (pendingRevisions > 0) todaySection.push(`• Правки без відповіді: ${pendingRevisions}`);
  if (todaySection.length > 0) lines.push("", "<b>Сьогодні</b>", ...todaySection);

  // --- Відсутності: хто поза грою сьогодні, що зміниться завтра, що висить ---
  // Джерело — журнал tosho.team_absences (workspace-скоуп, не team!): той
  // самий, що живить планер «Команди» і бот. Аудиторія цього дайджесту —
  // owner/SEO, тож і лічильник заявок на погодженні тут доречний.
  {
    const tomorrowKey = shiftDays(todayKey, 1);
    const workspaceIds = Array.from(new Set(members.map((m) => m.workspaceId)));
    const nameByUser = new Map(
      members
        .filter((m) => (m.fullName ?? "").trim())
        .map((m) => [m.userId, shortName((m.fullName ?? "").trim())])
    );

    const [currentAbs, pendingAbs] = await Promise.all([
      admin
        .schema("tosho")
        .from("team_absences")
        .select("user_id,start_date,end_date,kind")
        .in("workspace_id", workspaceIds)
        .eq("status", "approved")
        .lte("start_date", tomorrowKey)
        .gte("end_date", todayKey)
        .limit(200),
      admin
        .schema("tosho")
        .from("team_absences")
        .select("user_id,start_date,end_date,kind,created_at")
        .in("workspace_id", workspaceIds)
        .eq("status", "pending")
        .gte("end_date", todayKey)
        .limit(100),
    ]);

    type AbsRow = { user_id?: string | null; start_date?: string | null; end_date?: string | null; kind?: string | null; created_at?: string | null };
    const absKindLabel = (row: AbsRow) =>
      (ABSENCE_KIND_LABELS[(row.kind ?? "other").trim()] ?? "Відсутність").toLowerCase();

    const rows = ((currentAbs.data ?? []) as AbsRow[]).filter(
      (r) => r.user_id && r.start_date && r.end_date && nameByUser.has(r.user_id)
    );
    const outToday = rows.filter((r) => r.start_date! <= todayKey);
    const startTomorrow = rows.filter((r) => r.start_date === tomorrowKey);
    const backTomorrow = outToday.filter((r) => r.end_date === todayKey);

    const absenceSection: string[] = [];
    if (outToday.length > 0) {
      const parts = outToday.map((r) => {
        const until = r.end_date === todayKey ? "останній день" : `до ${formatAbsenceShort(r.end_date!)}`;
        return `${nameByUser.get(r.user_id!)} (${absKindLabel(r)}, ${until})`;
      });
      absenceSection.push(`• Сьогодні відсутні: ${escapeTelegramHtml(parts.join(" · "))}`);
    }
    const tomorrowBits: string[] = [];
    if (backTomorrow.length > 0) {
      tomorrowBits.push(`повертається ${backTomorrow.map((r) => nameByUser.get(r.user_id!)).join(", ")}`);
    }
    if (startTomorrow.length > 0) {
      tomorrowBits.push(
        startTomorrow.map((r) => `${nameByUser.get(r.user_id!)} — ${absKindLabel(r)}`).join(" · ")
      );
    }
    if (tomorrowBits.length > 0) {
      absenceSection.push(`• Завтра: ${escapeTelegramHtml(tomorrowBits.join(" · "))}`);
    }

    const pendingRows = ((pendingAbs.data ?? []) as AbsRow[]).filter(
      (r) => r.user_id && nameByUser.has(r.user_id)
    );
    if (pendingRows.length > 0) {
      const oldestDays = pendingRows.reduce((oldest, r) => {
        if (!r.created_at) return oldest;
        const days = Math.floor((now.getTime() - new Date(r.created_at).getTime()) / 86_400_000);
        return days > oldest ? days : oldest;
      }, 0);
      absenceSection.push(
        `• ⏳ Заявок без рішення: ${pendingRows.length}` +
          (oldestDays > 0 ? ` (найстаршій ${oldestDays} дн)` : "")
      );
    }

    if (absenceSection.length > 0) lines.push("", "<b>Відсутності</b>", ...absenceSection);
  }

  const tail: string[] = [];

  // Хто давно не заходив. Свідомо в ранковому звіті, а не в «що не працює»:
  // це управлінський сигнал, а не аварія системи.
  const presence = await loadPresence(admin);
  const absentBefore = now.getTime() - MEMBER_ABSENT_DAYS * 86_400_000;
  const absent = members
    .map((m) => ({ member: m, lastSeen: presence.get(m.userId)?.lastSeenAt ?? null }))
    .filter((r) => !r.lastSeen || new Date(r.lastSeen).getTime() < absentBefore)
    .sort((a, b) => (a.lastSeen ?? "").localeCompare(b.lastSeen ?? ""));
  if (absent.length > 0) {
    const names = absent
      .slice(0, 5)
      .map((r) => `${(r.member.fullName ?? "").trim() || "—"} (${formatLastSeen(r.lastSeen, now)})`)
      .join(" · ");
    tail.push(
      `😴 Не заходили ${MEMBER_ABSENT_DAYS}+ днів: ${absent.length} — ${escapeTelegramHtml(names)}` +
        (absent.length > 5 ? ` …і ще ${absent.length - 5}` : "")
    );
  }

  // «120 з 121» читається як «база холодна», а голе «120» — як випадкове число.
  if (staleLeads > 0) {
    const recentLeads = recentLeadsResult.count ?? 0;
    tail.push(
      `Ліди без руху ${LEAD_STALE_DAYS}+ днів: ${staleLeads}` +
        (recentLeads > staleLeads ? ` з ${recentLeads}` : " — уся база за квартал")
    );
  }
  if (paymentsByCurrency.size > 0) {
    const parts = Array.from(paymentsByCurrency.entries()).map(
      ([currency, entry]) => `${formatMoney(entry.sum, currency)} (${entry.count})`
    );
    tail.push(`Платежі найближчі ${PAYMENT_HORIZON_DAYS} днів: ${escapeTelegramHtml(parts.join(" · "))}`);
  }
  if (orders.length > 0) {
    tail.push(`Вчора нових замовлень: ${orders.length} на ${escapeTelegramHtml(formatMoney(ordersSum))}`);
  }
  if (tail.length > 0) lines.push("", ...tail);

  if (lines.length === 1) {
    lines.push("", "Порожня воронка, дедлайнів і платежів на сьогодні немає.");
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

  const monthStart = monthStartKey(todayKey);
  const prevMonth = previousMonthRange(todayKey);

  const [
    leadsResult,
    leadsWeekResult,
    newQuotesResult,
    approvedTodayIds,
    approvedMonthIds,
    approvedPrevMonthIds,
    ordersResult,
    designApprovedResult,
    revisionsResult,
    timerResult,
    aiResult,
    activeTasks,
  ] = await Promise.all([
      admin
        .schema("tosho")
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("team_id", teamIds)
        .gte("created_at", today.startIso)
        .lt("created_at", today.endIso),
      admin
        .schema("tosho")
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("team_id", teamIds)
        .gte("created_at", new Date(now.getTime() - 7 * 86_400_000).toISOString())
        .lt("created_at", today.endIso),
      admin
        .schema("tosho")
        .from("quotes")
        .select("id,assigned_to,created_by")
        .in("team_id", teamIds)
        .gte("created_at", today.startIso)
        .lt("created_at", today.endIso)
        .limit(2000),
      approvedQuoteIds(admin, teamIds, today.startIso, today.endIso),
      approvedQuoteIds(admin, teamIds, kievDayBounds(monthStart).startIso, today.endIso),
      approvedQuoteIds(
        admin,
        teamIds,
        kievDayBounds(prevMonth.startKey).startIso,
        kievDayBounds(prevMonth.endKey).endIso
      ),
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
      loadActiveDesignTasks(admin, memberIds),
    ]);

  // Вечірній звіт — це цифри дня. Тихо надрукувати нулі через помилку запиту
  // гірше, ніж не надрукувати нічого: читач вирішить, що день був порожній.
  for (const [label, result] of [
    ["leads", leadsResult],
    ["leads (week)", leadsWeekResult],
    ["quotes", newQuotesResult],
    ["orders", ordersResult],
    ["activity_log (design)", designApprovedResult],
    ["activity_log (revisions)", revisionsResult],
    ["design_task_timer_sessions", timerResult],
    ["ai_usage", aiResult],
  ] as const) {
    if (result.error) throw new Error(`${label}: ${result.error.message}`);
  }

  const newLeads = leadsResult.count ?? 0;
  const weekLeads = leadsWeekResult.count ?? 0;

  const newQuotes = (newQuotesResult.data ?? []) as Array<{
    id: string;
    assigned_to?: string | null;
    created_by?: string | null;
  }>;
  const newQuoteIds = newQuotes.map((q) => q.id);
  const orders = (ordersResult.data ?? []) as Array<{ id: string; quote_id?: string | null; total?: number | string | null }>;
  const orderQuoteIds = orders.map((o) => o.quote_id).filter((v): v is string => Boolean(v));

  const runTotals = await sumQuotesByRuns(
    admin,
    Array.from(new Set([...newQuoteIds, ...approvedTodayIds, ...approvedMonthIds, ...approvedPrevMonthIds, ...orderQuoteIds]))
  );
  const sumOf = (ids: string[]) => ids.reduce((sum, id) => sum + (runTotals.get(id) ?? 0), 0);

  // Найбільша угода дня — щоб цифра «затверджено» мала обличчя.
  let topDeal: { name: string; amount: number } | null = null;
  if (approvedTodayIds.length > 0) {
    const { data: dealRows } = await admin
      .schema("tosho")
      .from("quotes")
      .select("id,customer_name,number")
      .in("id", approvedTodayIds)
      .limit(2000);
    for (const row of ((dealRows ?? []) as Array<{ id: string; customer_name?: string | null; number?: string | null }>)) {
      const amount = runTotals.get(row.id) ?? 0;
      if (amount <= 0) continue;
      if (!topDeal || amount > topDeal.amount) {
        topDeal = { name: (row.customer_name ?? "").trim() || row.number || "Без назви", amount };
      }
    }
  }

  // Хто завів прорахунки сьогодні (assigned_to, інакше автор).
  const nameByUser = new Map(members.map((m) => [m.userId, (m.fullName ?? m.email ?? "").trim()]));
  const quotesByManager = new Map<string, number>();
  for (const quote of newQuotes) {
    const owner = quote.assigned_to || quote.created_by;
    if (!owner) continue;
    quotesByManager.set(owner, (quotesByManager.get(owner) ?? 0) + 1);
  }
  const ordersSum = orders.reduce((sum, order) => {
    const fromRuns = order.quote_id ? runTotals.get(order.quote_id) ?? 0 : 0;
    return sum + (fromRuns > 0 ? fromRuns : num(order.total));
  }, 0);

  const designApproved = designApprovedResult.count ?? 0;
  const newRevisions = revisionsResult.count ?? 0;

  // Таймери: кожну сесію обрізаємо до 8 год — забуті таймери інакше отруюють суму.
  const sessions = (timerResult.data ?? []) as Array<{ user_id: string; started_at: string; paused_at?: string | null }>;
  let timerSeconds = 0;
  const secondsByDesigner = new Map<string, number>();
  for (const session of sessions) {
    const start = new Date(session.started_at).getTime();
    const end = session.paused_at ? new Date(session.paused_at).getTime() : now.getTime();
    const seconds = Math.min(MAX_TIMER_SESSION_SECONDS, Math.max(0, Math.floor((end - start) / 1000)));
    if (seconds <= 0) continue;
    timerSeconds += seconds;
    secondsByDesigner.set(session.user_id, (secondsByDesigner.get(session.user_id) ?? 0) + seconds);
  }

  const tasksInRevision = activeTasks.filter(
    (t) => ((t.metadata ?? {}).status ?? "") === "changes"
  ).length;

  const aiCost = ((aiResult.data ?? []) as Array<{ cost_usd?: number | string | null }>).reduce(
    (sum, row) => sum + num(row.cost_usd),
    0
  );

  // --- рендер ---
  const lines: string[] = [`<b>📊 День у ToSho — ${escapeTelegramHtml(formatDayLabel(todayKey))}</b>`];

  const salesLines: string[] = [];
  if (newLeads > 0) salesLines.push(`• Нові ліди: ${newLeads} (за тиждень: ${weekLeads})`);
  if (newQuoteIds.length > 0) {
    salesLines.push(`• Нові прорахунки: ${newQuoteIds.length} на ${escapeTelegramHtml(formatMoney(sumOf(newQuoteIds)))}`);
  }
  if (approvedTodayIds.length > 0) {
    salesLines.push(
      `• Затверджено: ${approvedTodayIds.length} на ${escapeTelegramHtml(formatMoney(sumOf(approvedTodayIds)))}`
    );
  }
  if (topDeal) {
    salesLines.push(
      `• Найбільша угода: ${escapeTelegramHtml(topDeal.name)} — ${escapeTelegramHtml(formatMoney(topDeal.amount))}`
    );
  }
  if (orders.length > 0) {
    salesLines.push(`• Нові замовлення: ${orders.length} на ${escapeTelegramHtml(formatMoney(ordersSum))}`);
  }
  if (quotesByManager.size > 1) {
    const parts = Array.from(quotesByManager.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([userId, count]) => `${nameByUser.get(userId) || "—"} ${count}`);
    salesLines.push(`• Менеджери: ${escapeTelegramHtml(parts.join(" · "))}`);
  }
  if (salesLines.length > 0) lines.push("", "<b>Продажі</b>", ...salesLines);

  // Місяць до дати — головна цифра для CEO: має значення навіть у тихий день.
  if (approvedMonthIds.length > 0 || approvedPrevMonthIds.length > 0) {
    const monthSum = sumOf(approvedMonthIds);
    const prevSum = sumOf(approvedPrevMonthIds);
    lines.push("", "<b>Місяць до дати</b>");
    lines.push(`• Затверджено: ${approvedMonthIds.length} на ${escapeTelegramHtml(formatMoney(monthSum))}`);
    if (approvedPrevMonthIds.length > 0) {
      const deltaRaw = prevSum > 0 ? ((monthSum - prevSum) / prevSum) * 100 : null;
      let deltaText = "";
      if (deltaRaw !== null) {
        const rounded = Math.round(deltaRaw);
        // «-100%» означає нуль. Поки сума не нульова, показуємо десяту частку,
        // інакше -99,9% округлюється до «виторгу немає».
        const value = Math.abs(rounded) === 100 && monthSum > 0 ? deltaRaw.toFixed(1) : String(rounded);
        deltaText = ` (${deltaRaw >= 0 ? "+" : ""}${value}%)`;
      }
      lines.push(
        `• Минулого місяця за цей самий період: ${escapeTelegramHtml(formatMoney(prevSum))}${deltaText}`
      );
    }
  }

  const designLines: string[] = [];
  if (designApproved > 0) designLines.push(`• Затверджено макетів: ${designApproved}`);
  if (newRevisions > 0) designLines.push(`• Нових правок: ${newRevisions}`);
  if (timerSeconds > 0) {
    designLines.push(`• Час за таймерами: ${formatDuration(timerSeconds)} (${secondsByDesigner.size})`);
    if (secondsByDesigner.size > 1) {
      const parts = Array.from(secondsByDesigner.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([userId, seconds]) => `${nameByUser.get(userId) || "—"} ${formatDuration(seconds)}`);
      designLines.push(`• Топ: ${escapeTelegramHtml(parts.join(" · "))}`);
    }
  }
  if (activeTasks.length > 0) {
    designLines.push(
      `• Активних задач: ${activeTasks.length}` + (tasksInRevision > 0 ? `, з них у правках: ${tasksInRevision}` : "")
    );
  }
  if (designLines.length > 0) lines.push("", "<b>Дизайн</b>", ...designLines);

  // Хто сьогодні взагалі заходив — проста міра залученості команди.
  const presence = await loadPresence(admin);
  const seenToday = members.filter((m) => {
    const seen = presence.get(m.userId)?.lastSeenAt;
    return seen ? seen >= today.startIso : false;
  }).length;
  if (members.length > 0) {
    lines.push("", `👥 У системі сьогодні: ${seenToday} із ${members.length}`);
  }

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
    let recipients = members.filter((m) =>
      isCategoryVisibleForRole(category, { accessRole: m.accessRole, jobRole: m.jobRole })
    );

    // ?only=<email> — звузити адресатів до однієї людини (перегляд «спершу
    // собі», перш ніж вмикати розсилку на команду). Фільтр застосовується
    // ПІСЛЯ рольового гейта, тож він може лише звузити коло, ніколи не
    // розширити: людина поза своєю категорією так не отримає нічого.
    const only = (query.only ?? "").trim().toLowerCase();
    if (only) {
      recipients = recipients.filter((m) => (m.email ?? "").trim().toLowerCase() === only);
      if (recipients.length === 0) {
        return jsonResponse(404, { error: `No recipient of ${category} matches ${only}` });
      }
    }

    const digest =
      kind === "tech"
        ? await buildTechDigest(admin, now, todayKey, resolveTeamIds(members))
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

import type { SupabaseClient } from "@supabase/supabase-js";

// Рушій відповідей асистента по дизайн-задачах (docs/TELEGRAM_ASSISTANT_DESIGN.md).
//
// ВАЖЛИВО щодо ролей: модель тут НЕ рахує нічого. Вона лише перекладає питання
// у структуру DesignQuery, а всі числа беруться звичайними запитами. Інакше
// рано чи пізно вона вигадає цифру, а відрізнити її від справжньої буде ніяк.

import { escapeTelegramHtml } from "./_telegram";

export type DesignIntent =
  | "workload_now"
  | "designer_workload"
  | "team_workload"
  | "task_details"
  | "tasks_list"
  | "created_count"
  | "approved_count"
  | "revisions"
  | "time_spent"
  | "deadlines"
  | "designer_summary"
  | "stuck"
  | "help";

export type DesignPeriod =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "all";

export type DesignQuery = {
  intent: DesignIntent;
  designer?: string | null;
  status?: string | null;
  period?: DesignPeriod | null;
  limit?: number | null;
  /** Вільний текст: номер задачі, назва, ім'я клієнта — для пошукових інтентів. */
  query?: string | null;
};

const TIME_ZONE = "Europe/Kiev";
const APP_URL = process.env.PUBLIC_APP_URL || "https://tosho.pro";
const MAX_TIMER_SESSION_SECONDS = 8 * 60 * 60;
const ACTIVE_STATUSES = ["new", "changes", "in_progress"];
const DEFAULT_LIST_LIMIT = 8;

// Дзеркало src/lib/designTaskStatus.ts — тримати синхронно.
const STATUS_LABELS: Record<string, string> = {
  new: "Новий",
  changes: "Правки",
  in_progress: "В роботі",
  pm_review: "Дизайн готовий",
  client_review: "На погодженні",
  approved: "Затверджено",
  cancelled: "Скасовано",
};

const STATUS_EMOJI: Record<string, string> = {
  new: "🆕",
  changes: "✏️",
  in_progress: "🎨",
  pm_review: "👀",
  client_review: "🤝",
  approved: "✅",
  cancelled: "🚫",
};

// Слова, за якими розпізнаємо статус, якщо модель віддала його людською мовою.
const STATUS_ALIASES: Record<string, string> = {
  новий: "new",
  нові: "new",
  правки: "changes",
  "в правках": "changes",
  "в роботі": "in_progress",
  "у роботі": "in_progress",
  прогрес: "in_progress",
  "в прогресі": "in_progress",
  готовий: "pm_review",
  "на погодженні": "client_review",
  затверджено: "approved",
  скасовано: "cancelled",
};

type TaskRow = {
  id: string;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

type Member = { userId: string; name: string; jobRole: string | null; isActive: boolean };

export type AssistantAnswer = { text: string; handled: boolean };

// --- дати -------------------------------------------------------------------

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

function zonedOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utcMs;
}

/** Київська дата (YYYY-MM-DD) → справжній UTC-момент початку доби. */
function dayStartInstant(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  let instant = base - zonedOffsetMs(base);
  instant = base - zonedOffsetMs(instant);
  return new Date(instant);
}

function shiftDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Понеділок того тижня, до якого належить дата. */
function weekStart(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = (date.getUTCDay() + 6) % 7; // 0 = понеділок
  return shiftDays(dayKey, -weekday);
}

export type ResolvedPeriod = { startIso: string | null; endIso: string | null; label: string };

export function resolvePeriod(period: DesignPeriod | null | undefined, now: Date): ResolvedPeriod {
  const today = todayKeyInKiev(now);
  const bounds = (fromKey: string, toKeyExclusive: string, label: string): ResolvedPeriod => ({
    startIso: dayStartInstant(fromKey).toISOString(),
    endIso: dayStartInstant(toKeyExclusive).toISOString(),
    label,
  });

  const rollingDays = (days: number, label: string): ResolvedPeriod => ({
    startIso: new Date(now.getTime() - days * 86_400_000).toISOString(),
    endIso: dayStartInstant(shiftDays(today, 1)).toISOString(),
    label,
  });

  switch (period) {
    case "last_7_days":
      return rollingDays(7, "за останні 7 днів");
    case "last_30_days":
      return rollingDays(30, "за останні 30 днів");
    case "yesterday":
      return bounds(shiftDays(today, -1), today, "за вчора");
    case "this_week":
      return bounds(weekStart(today), shiftDays(today, 1), "за цей тиждень");
    case "last_week": {
      const start = shiftDays(weekStart(today), -7);
      return bounds(start, weekStart(today), "за минулий тиждень");
    }
    case "this_month":
      return bounds(`${today.slice(0, 7)}-01`, shiftDays(today, 1), "за цей місяць");
    case "last_month": {
      const [y, m] = today.split("-").map(Number);
      const prevStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
      return bounds(prevStart, `${today.slice(0, 7)}-01`, "за минулий місяць");
    }
    case "all":
      return { startIso: null, endIso: null, label: "за весь час" };
    case "today":
    default:
      return bounds(today, shiftDays(today, 1), "за сьогодні");
  }
}

// --- утиліти ----------------------------------------------------------------

function normalizeName(value: string): string {
  // Свідомо БЕЗ NFKD: воно ламає українські й/ї (див. пам'ятку про пошук).
  // Апострофи в базі різних видів: «Марʼяна» через U+02BC, «Дар'я» через
  // звичайний — зводимо до одного, інакше пошук по імені мовчить.
  return value
    .trim()
    .toLowerCase()
    .replace(/[ʼ‘’`´]/g, "'")
    .replace(/\s+/g, " ");
}

/**
 * Основа слова для порівняння імен у різних відмінках: «Марʼяни» → «марʼя»,
 * «Лєни» → «лєн». Українською питають «скільки у Марʼяни», а в базі лежить
 * «Марʼяна», тож точний збіг не працює майже ніколи.
 */
function nameStem(word: string): string {
  return word.slice(0, Math.max(3, word.length - 2));
}

function tokenMatches(nameToken: string, needleToken: string): boolean {
  if (nameToken === needleToken) return true;
  return nameToken.startsWith(nameStem(needleToken)) || needleToken.startsWith(nameStem(nameToken));
}

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName.trim();
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

export function resolveStatus(raw: string | null | undefined): string | null {
  const value = normalizeName(raw ?? "");
  if (!value) return null;
  if (STATUS_LABELS[value]) return value;
  return STATUS_ALIASES[value] ?? null;
}

/** Пошук людини за іменем у будь-якому відмінку. «ambiguous» — якщо збігів кілька. */
export function matchMember(members: Member[], raw: string | null | undefined): Member | "ambiguous" | null {
  const needleTokens = normalizeName(raw ?? "").split(" ").filter(Boolean);
  if (needleTokens.length === 0) return null;

  const candidates = members.filter((m) => {
    const nameTokens = normalizeName(m.name).split(" ").filter(Boolean);
    if (nameTokens.length === 0) return false;
    // Кожне слово запиту має знайти собі слово в імені — так «марʼяни
    // андроскової» не зачепить іншу Марину, а просте «марʼяни» спрацює.
    return needleTokens.every((needle) => nameTokens.some((token) => tokenMatches(token, needle)));
  });

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    // Точний збіг слова виграє над кількома наближеними.
    const exact = candidates.filter((m) => {
      const nameTokens = normalizeName(m.name).split(" ");
      return needleTokens.every((needle) => nameTokens.includes(needle));
    });
    if (exact.length === 1) return exact[0];
    return "ambiguous";
  }
  return null;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes} хв`;
  return minutes > 0 ? `${hours} год ${minutes} хв` : `${hours} год`;
}

function taskStatus(task: TaskRow): string {
  const status = (task.metadata ?? {}).status;
  return typeof status === "string" ? status : "new";
}

function taskAssignee(task: TaskRow): string | null {
  const value = (task.metadata ?? {}).assignee_user_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function taskNumber(task: TaskRow): string | null {
  const value = (task.metadata ?? {}).design_task_number;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function taskDeadlineKey(task: TaskRow): string | null {
  const metadata = task.metadata ?? {};
  const raw = metadata.design_deadline ?? metadata.deadline;
  if (typeof raw !== "string") return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function pendingRevisions(task: TaskRow): number {
  const list = (task.metadata ?? {}).design_brief_change_requests;
  if (!Array.isArray(list)) return 0;
  return list.filter((cr) => {
    const status = (cr as { status?: unknown } | null)?.status;
    return typeof status === "string" && status.trim().toLowerCase() === "pending";
  }).length;
}

/** Рядок списку: клікабельна назва + виконавець і дедлайн. */
function taskLine(task: TaskRow, personLabel: (userId: string) => string): string {
  const number = taskNumber(task);
  const title = (task.title ?? "").trim() || "(без назви)";
  const label = number ? `${number} · ${title}` : title;
  const assignee = taskAssignee(task);
  const meta: string[] = [];
  if (assignee) meta.push(personLabel(assignee));
  meta.push(STATUS_LABELS[taskStatus(task)] ?? taskStatus(task));
  const deadline = taskDeadlineKey(task);
  if (deadline) meta.push(`до ${deadline.slice(8, 10)}.${deadline.slice(5, 7)}`);
  return (
    `• <a href="${APP_URL}/design/${task.id}">${escapeTelegramHtml(label)}</a>\n` +
    `  ${escapeTelegramHtml(meta.join(" · "))}`
  );
}

// --- завантаження -----------------------------------------------------------

/**
 * Учасники з іменами.
 *
 * ГОТЧА: `memberships_view.full_name` на проді порожній майже у всіх — імена
 * лежать у `team_member_profiles.first_name/last_name`. Брати їх із в'юшки
 * означає «—» замість кожного імені й непрацюючий пошук по людині.
 */
export async function loadDesignMembers(admin: SupabaseClient, workspaceId: string): Promise<Member[]> {
  const [rolesResult, profilesResult] = await Promise.all([
    admin
      .schema("tosho")
      .from("memberships_view")
      .select("user_id,job_role")
      .eq("workspace_id", workspaceId)
      .limit(1000),
    admin
      .schema("tosho")
      .from("team_member_profiles")
      .select("user_id,first_name,last_name,employment_status")
      .eq("workspace_id", workspaceId)
      .limit(1000),
  ]);
  if (rolesResult.error) throw new Error(`memberships_view: ${rolesResult.error.message}`);
  if (profilesResult.error) throw new Error(`team_member_profiles: ${profilesResult.error.message}`);

  const nameByUser = new Map<string, string>();
  const inactive = new Set<string>();
  for (const row of ((profilesResult.data ?? []) as Array<{
    user_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    employment_status?: string | null;
  }>)) {
    if (!row.user_id) continue;
    const name = [row.first_name, row.last_name].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
    if (name) nameByUser.set(row.user_id, name);
    const status = (row.employment_status ?? "").trim().toLowerCase();
    if (status === "inactive" || status === "rejected") inactive.add(row.user_id);
  }

  return ((rolesResult.data ?? []) as Array<{ user_id?: string | null; job_role?: string | null }>)
    .filter((r) => r.user_id)
    .map((r) => ({
      userId: r.user_id as string,
      name: nameByUser.get(r.user_id as string) ?? "",
      jobRole: r.job_role ?? null,
      // Звільнених НЕ прибираємо зі списку тут, а позначаємо. Причина: зі списків
      // людей їх треба ховати (це і був баг), але історичні питання на кшталт
      // «скільки Євгенія зробила в травні» мусять і далі працювати. Тому фільтр
      // застосовують самі рендерери, а не це завантаження.
      isActive: !inactive.has(r.user_id as string),
    }));
}

async function loadTasks(
  admin: SupabaseClient,
  teamId: string,
  options?: { statuses?: string[]; createdFromIso?: string | null; createdToIso?: string | null }
): Promise<TaskRow[]> {
  let query = admin
    .from("activity_log")
    .select("id,title,metadata,created_at")
    .eq("team_id", teamId)
    .eq("action", "design_task");
  if (options?.statuses?.length) query = query.in("metadata->>status", options.statuses);
  if (options?.createdFromIso) query = query.gte("created_at", options.createdFromIso);
  if (options?.createdToIso) query = query.lt("created_at", options.createdToIso);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(5000);
  if (error) throw new Error(`activity_log (design_task): ${error.message}`);
  return (data ?? []) as TaskRow[];
}

// --- відповіді --------------------------------------------------------------

const HELP_COMMON = [
  "<b>Дизайн</b>",
  "• скільки задач у роботі?",
  "• покажи задачі в правках",
  "• хто чим завантажений?",
  "• які задачі найдовше без руху?",
  "• покажи задачу DZ-0412",
  "",
  "<b>Про себе</b>",
  "• скільки в мене задач?",
  "• скільки часу за таймерами сьогодні?",
  "• як у мене справи за тиждень?",
  "",
  "<b>Команда</b>",
  "• хто сьогодні відсутній? (або /away)",
  "• хто зараз у системі?",
  "• дай список менеджерів",
  "",
  "<b>Дедлайни</b>",
  "• які дедлайни сьогодні?",
  "• що прострочено?",
];

const HELP_SALES = [
  "",
  "<b>Прорахунки</b>",
  "• яка зараз воронка?",
  "• покажи список прорахунків",
  "• які прорахунки на погодженні?",
  "• скільки прорахунків завели за місяць?",
  "• скільки затвердили за тиждень?",
  "• що по клієнту «назва»?",
  "",
  "<b>Замовлення</b>",
  "• покажи список замовлень",
  "• що зараз у виробництві?",
  "• замовлення по клієнту «назва»",
];

const HELP_FULL = [
  "",
  "<b>Керівництву</b>",
  "• дай статистику по Владиславу",
  "• скільки витратили на AI?",
  "• що не працює?",
];

const HELP_TAIL = [
  "",
  "<b>Швидкі дії</b>",
  "• «хворію» або «лікарняний 05.08–08.08» — зафіксувати лікарняний",
  "• «day-off 15.08», «відпустка 12.08–19.08», «з дому 06.08» — заявка на погодження",
  "• або команда /absence — усе кнопками",
  "",
  "<b>Уточнення працюють</b>",
  "Спитай щось, а далі коротко: «а вчора?», «а за минулий тиждень?» —",
  "я доповню попереднє питання. Контекст живе 30 хвилин.",
  "",
  "Періоди: сьогодні, вчора, останні 7 / 30 днів, цей і минулий тиждень,",
  "цей і минулий місяць, весь час.",
];

/**
 * Довідка залежить від рівня доступу: показувати людині приклади того, чого
 * вона все одно не може спитати, — найкоротший шлях до розчарування в боті.
 */
export function helpText(params: { canUseQuotes: boolean; isFull: boolean }): string {
  return [
    "<b>Що можна питати</b>",
    "",
    ...HELP_COMMON,
    ...(params.canUseQuotes ? HELP_SALES : []),
    ...(params.isFull ? HELP_FULL : []),
    ...HELP_TAIL,
  ].join("\n");
}

/** Найширший варіант — для місць, де рівень доступу ще невідомий. */
export const HELP_TEXT = helpText({ canUseQuotes: true, isFull: true });

export async function answerDesignQuery(params: {
  admin: SupabaseClient;
  teamId: string;
  workspaceId: string;
  query: DesignQuery;
  now: Date;
}): Promise<AssistantAnswer> {
  const { admin, teamId, workspaceId, query, now } = params;

  if (query.intent === "help") return { text: HELP_TEXT, handled: true };

  const members = await loadDesignMembers(admin, workspaceId);
  const nameByUser = new Map(members.map((m) => [m.userId, m.name]));
  const departed = new Set(members.filter((m) => !m.isActive).map((m) => m.userId));
  // Звільнений із відкритими задачами — це інформація, а не сміття: роботу
  // хтось має перебрати. Тому в агрегатах його лишаємо, але позначаємо.
  const personLabel = (userId: string) =>
    `${shortName(nameByUser.get(userId) ?? "—")}${departed.has(userId) ? " (не працює)" : ""}`;

  // Резолв людини — до будь-яких підрахунків, щоб не рахувати даремно.
  let target: Member | null = null;
  if (query.designer) {
    const matched = matchMember(members, query.designer);
    if (matched === "ambiguous") {
      return {
        text: `Не зрозумів, про кого саме: «${escapeTelegramHtml(query.designer)}» підходить кільком людям. Уточни ім'я.`,
        handled: true,
      };
    }
    if (!matched) {
      return {
        text: `Не знайшов у команді «${escapeTelegramHtml(query.designer)}». Перевір ім'я.`,
        handled: true,
      };
    }
    target = matched;
  }

  const period = resolvePeriod(query.period, now);
  const status = resolveStatus(query.status);
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIST_LIMIT, 1), 15);
  const byTarget = (task: TaskRow) => !target || taskAssignee(task) === target.userId;

  switch (query.intent) {
    case "workload_now":
    case "designer_workload": {
      // Якщо статус названо прямо («скільки В РОБОТІ»), рахуємо саме його, а не
      // всі активні: інакше на питання про in_progress прилетить сума з «Новий».
      const statuses = status ? [status] : ACTIVE_STATUSES;
      const scopeWord = status ? `у статусі «${STATUS_LABELS[status] ?? status}»` : "активних";
      const tasks = (await loadTasks(admin, teamId, { statuses })).filter(byTarget);
      if (tasks.length === 0) {
        return {
          text: target
            ? `У ${escapeTelegramHtml(shortName(target.name))} зараз немає задач ${escapeTelegramHtml(scopeWord)}.`
            : `Дизайн-задач ${escapeTelegramHtml(scopeWord)} зараз немає.`,
          handled: true,
        };
      }
      const counts = new Map<string, number>();
      for (const task of tasks) counts.set(taskStatus(task), (counts.get(taskStatus(task)) ?? 0) + 1);
      const head = target
        ? `🎨 <b>${escapeTelegramHtml(shortName(target.name))}</b> — ${tasks.length} задач ${escapeTelegramHtml(scopeWord)}`
        : `🎨 <b>Дизайн-задач ${escapeTelegramHtml(scopeWord)}: ${tasks.length}</b>`;
      const lines = [head, ""];
      for (const key of statuses) {
        const count = counts.get(key) ?? 0;
        if (count > 0) lines.push(`   ${STATUS_EMOJI[key] ?? "•"} ${STATUS_LABELS[key]}: <b>${count}</b>`);
      }
      // Без розбивки по людях, якщо питали про конкретну людину.
      if (!target) {
        const perDesigner = new Map<string, number>();
        for (const task of tasks) {
          const assignee = taskAssignee(task);
          if (assignee) perDesigner.set(assignee, (perDesigner.get(assignee) ?? 0) + 1);
        }
        if (perDesigner.size > 1) {
          const parts = Array.from(perDesigner.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([userId, count]) => `${personLabel(userId)} ${count}`);
          lines.push("", `👥 По людях: ${escapeTelegramHtml(parts.join(" · "))}`);
        }
      }
      return { text: lines.join("\n"), handled: true };
    }

    case "team_workload": {
      // Хто чим завантажений — зріз по всій команді одразу.
      const tasks = await loadTasks(admin, teamId, { statuses: ACTIVE_STATUSES });
      if (tasks.length === 0) return { text: "Активних дизайн-задач зараз немає.", handled: true };

      const byDesigner = new Map<string, { total: number; changes: number }>();
      let unassigned = 0;
      for (const task of tasks) {
        const assignee = taskAssignee(task);
        if (!assignee) {
          unassigned += 1;
          continue;
        }
        const entry = byDesigner.get(assignee) ?? { total: 0, changes: 0 };
        entry.total += 1;
        if (taskStatus(task) === "changes") entry.changes += 1;
        byDesigner.set(assignee, entry);
      }

      const lines = [`🎨 <b>Завантаження дизайну</b> — ${tasks.length} активних задач`, ""];
      for (const [userId, entry] of Array.from(byDesigner.entries()).sort((a, b) => b[1].total - a[1].total)) {
        lines.push(
          `• ${escapeTelegramHtml(personLabel(userId))}: ${entry.total}` +
            (entry.changes > 0 ? ` (у правках: ${entry.changes})` : "")
        );
      }
      if (unassigned > 0) lines.push("", `🕳 Без виконавця: <b>${unassigned}</b>`);
      return { text: lines.join("\n"), handled: true };
    }

    case "task_details": {
      const needle = normalizeName(query.query ?? query.designer ?? "");
      if (!needle) return { text: "Уточни номер або назву задачі.", handled: true };

      // Шукаємо серед усіх задач, а не лише активних: питають і про закриті.
      const all = await loadTasks(admin, teamId);
      const hits = all.filter((task) => {
        const number = normalizeName(taskNumber(task) ?? "");
        const title = normalizeName(task.title ?? "");
        return (number && number.includes(needle)) || (title && title.includes(needle));
      });

      if (hits.length === 0) {
        return { text: `Не знайшов задачі за «${escapeTelegramHtml(needle)}».`, handled: true };
      }
      if (hits.length > 1) {
        const lines = [`<b>Знайшов ${hits.length} — уточни</b>`, ""];
        for (const task of hits.slice(0, limit)) lines.push(taskLine(task, personLabel));
        return { text: lines.join("\n"), handled: true };
      }

      const task = hits[0];
      const assignee = taskAssignee(task);
      const deadline = taskDeadlineKey(task);
      const pending = pendingRevisions(task);
      const created = task.created_at ? new Date(task.created_at) : null;
      const ageDays = created ? Math.floor((now.getTime() - created.getTime()) / 86_400_000) : null;

      const lines = [
        `<b>${escapeTelegramHtml([taskNumber(task), (task.title ?? "").trim() || "(без назви)"].filter(Boolean).join(" · "))}</b>`,
        "",
        `• Статус: ${STATUS_LABELS[taskStatus(task)] ?? taskStatus(task)}`,
        `• Виконавець: ${escapeTelegramHtml(assignee ? personLabel(assignee) : "не призначено")}`,
      ];
      if (deadline) lines.push(`• Дедлайн: ${deadline.slice(8, 10)}.${deadline.slice(5, 7)}`);
      if (pending > 0) lines.push(`• Правок без відповіді: ${pending}`);
      if (ageDays !== null) lines.push(`• В роботі: ${ageDays} дн`);
      lines.push("", `${APP_URL}/design/${task.id}`);
      return { text: lines.join("\n"), handled: true };
    }

    case "tasks_list": {
      const statuses = status ? [status] : ACTIVE_STATUSES;
      const tasks = (await loadTasks(admin, teamId, { statuses })).filter(byTarget);
      const scope = [
        status ? `у статусі «${STATUS_LABELS[status] ?? status}»` : "активних",
        target ? `у ${shortName(target.name)}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      if (tasks.length === 0) return { text: `Задач ${escapeTelegramHtml(scope)} немає.`, handled: true };
      const shown = tasks.slice(0, limit);
      const lines = [`📋 <b>Задачі ${escapeTelegramHtml(scope)}</b> — ${tasks.length}`, ""];
      for (const task of shown) lines.push(taskLine(task, personLabel));
      if (tasks.length > shown.length) lines.push("", `…і ще ${tasks.length - shown.length}`);
      return { text: lines.join("\n"), handled: true };
    }

    case "created_count": {
      const tasks = (
        await loadTasks(admin, teamId, { createdFromIso: period.startIso, createdToIso: period.endIso })
      ).filter(byTarget);
      const who = target ? ` у ${shortName(target.name)}` : "";
      if (tasks.length === 0) {
        return { text: `Нових дизайн-задач${escapeTelegramHtml(who)} ${period.label} не було.`, handled: true };
      }
      const lines = [
        `<b>Створено задач ${escapeTelegramHtml(period.label)}${escapeTelegramHtml(who)}: ${tasks.length}</b>`,
        "",
      ];
      for (const task of tasks.slice(0, limit)) lines.push(taskLine(task, personLabel));
      if (tasks.length > limit) lines.push("", `…і ще ${tasks.length - limit}`);
      return { text: lines.join("\n"), handled: true };
    }

    case "approved_count": {
      let statusQuery = admin
        .from("activity_log")
        .select("entity_id,metadata")
        .eq("team_id", teamId)
        .eq("action", "design_task_status")
        .eq("metadata->>to_status", "approved")
        .limit(5000);
      if (period.startIso) statusQuery = statusQuery.gte("created_at", period.startIso);
      if (period.endIso) statusQuery = statusQuery.lt("created_at", period.endIso);
      const { data, error } = await statusQuery;
      if (error) throw new Error(`activity_log (design_task_status): ${error.message}`);

      const rows = ((data ?? []) as Array<{ entity_id?: string | null; metadata?: Record<string, unknown> | null }>)
        .map((r) => ({
          taskId: typeof r.entity_id === "string" ? r.entity_id : null,
          assignee:
            typeof (r.metadata ?? {}).assignee_user_id === "string"
              ? ((r.metadata ?? {}).assignee_user_id as string)
              : null,
        }))
        .filter((r) => !target || r.assignee === target.userId);

      const who = target ? ` у ${shortName(target.name)}` : "";
      if (rows.length === 0) {
        return { text: `Затверджених макетів${escapeTelegramHtml(who)} ${period.label} немає.`, handled: true };
      }
      const lines = [
        `<b>Затверджено макетів ${escapeTelegramHtml(period.label)}${escapeTelegramHtml(who)}: ${rows.length}</b>`,
      ];
      if (!target) {
        const perDesigner = new Map<string, number>();
        for (const row of rows) {
          if (row.assignee) perDesigner.set(row.assignee, (perDesigner.get(row.assignee) ?? 0) + 1);
        }
        if (perDesigner.size > 0) {
          lines.push("");
          for (const [userId, count] of Array.from(perDesigner.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
            lines.push(`• ${escapeTelegramHtml(personLabel(userId))}: ${count}`);
          }
        }
      }
      return { text: lines.join("\n"), handled: true };
    }

    case "revisions": {
      const [logResult, activeTasks] = await Promise.all([
        (() => {
          let q = admin
            .from("activity_log")
            .select("id", { count: "exact", head: true })
            .eq("team_id", teamId)
            .eq("action", "design_task_brief_change_request");
          if (period.startIso) q = q.gte("created_at", period.startIso);
          if (period.endIso) q = q.lt("created_at", period.endIso);
          return q;
        })(),
        loadTasks(admin, teamId, { statuses: ACTIVE_STATUSES }),
      ]);
      if (logResult.error) throw new Error(`activity_log (revisions): ${logResult.error.message}`);

      const pendingTasks = activeTasks.filter(byTarget).filter((t) => pendingRevisions(t) > 0);
      const pendingTotal = pendingTasks.reduce((sum, t) => sum + pendingRevisions(t), 0);
      const lines = [`✏️ <b>Правки ${escapeTelegramHtml(period.label)}</b>`, ""];
      lines.push(`   🆕 Нових: <b>${logResult.count ?? 0}</b>`);
      lines.push(`   ⏳ Без відповіді зараз: <b>${pendingTotal}</b>`);
      if (pendingTasks.length > 0) {
        lines.push("");
        for (const task of pendingTasks.slice(0, limit)) lines.push(taskLine(task, personLabel));
      }
      return { text: lines.join("\n"), handled: true };
    }

    case "time_spent": {
      let q = admin
        .from("design_task_timer_sessions")
        .select("user_id,started_at,paused_at")
        .eq("team_id", teamId)
        .limit(5000);
      if (period.startIso) q = q.gte("started_at", period.startIso);
      if (period.endIso) q = q.lt("started_at", period.endIso);
      const { data, error } = await q;
      if (error) throw new Error(`design_task_timer_sessions: ${error.message}`);

      const perDesigner = new Map<string, number>();
      let total = 0;
      for (const s of ((data ?? []) as Array<{ user_id: string; started_at: string; paused_at?: string | null }>)) {
        if (target && s.user_id !== target.userId) continue;
        const start = new Date(s.started_at).getTime();
        const end = s.paused_at ? new Date(s.paused_at).getTime() : now.getTime();
        // Обрізаємо сесію до 8 год — забуті таймери інакше отруюють суму.
        const seconds = Math.min(MAX_TIMER_SESSION_SECONDS, Math.max(0, Math.floor((end - start) / 1000)));
        if (seconds <= 0) continue;
        total += seconds;
        perDesigner.set(s.user_id, (perDesigner.get(s.user_id) ?? 0) + seconds);
      }
      const who = target ? ` у ${shortName(target.name)}` : "";
      if (total === 0) {
        return { text: `Часу за таймерами${escapeTelegramHtml(who)} ${period.label} не зафіксовано.`, handled: true };
      }
      const lines = [
        `<b>Час за таймерами ${escapeTelegramHtml(period.label)}${escapeTelegramHtml(who)}: ${formatDuration(total)}</b>`,
      ];
      if (!target && perDesigner.size > 1) {
        lines.push("");
        for (const [userId, seconds] of Array.from(perDesigner.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
          lines.push(`• ${escapeTelegramHtml(personLabel(userId))}: ${formatDuration(seconds)}`);
        }
      }
      return { text: lines.join("\n"), handled: true };
    }

    case "deadlines": {
      const tasks = (await loadTasks(admin, teamId, { statuses: ACTIVE_STATUSES })).filter(byTarget);
      const todayKey = todayKeyInKiev(now);
      const dueToday: TaskRow[] = [];
      const overdue: TaskRow[] = [];
      for (const task of tasks) {
        const key = taskDeadlineKey(task);
        if (!key) continue;
        if (key === todayKey) dueToday.push(task);
        else if (key < todayKey) overdue.push(task);
      }
      if (dueToday.length === 0 && overdue.length === 0) {
        return { text: "Дедлайнів на сьогодні й прострочених задач немає.", handled: true };
      }
      const lines: string[] = [];
      if (dueToday.length > 0) {
        lines.push(`⏰ <b>Дедлайн сьогодні</b> — ${dueToday.length}`, "");
        for (const task of dueToday.slice(0, limit)) lines.push(taskLine(task, personLabel));
      }
      if (overdue.length > 0) {
        if (lines.length > 0) lines.push("");
        lines.push(`🔥 <b>Прострочено</b> — ${overdue.length}`, "");
        for (const task of overdue.slice(0, limit)) lines.push(taskLine(task, personLabel));
      }
      return { text: lines.join("\n"), handled: true };
    }

    case "stuck": {
      const tasks = (await loadTasks(admin, teamId, { statuses: ACTIVE_STATUSES })).filter(byTarget);
      if (tasks.length === 0) return { text: "Активних задач немає.", handled: true };
      const sorted = tasks
        .filter((t) => t.created_at)
        .sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime());
      const lines = [`🐌 <b>Найдовше в роботі</b>`, ""];
      for (const task of sorted.slice(0, limit)) {
        const days = Math.floor((now.getTime() - new Date(task.created_at as string).getTime()) / 86_400_000);
        lines.push(`${taskLine(task, personLabel)} · ${days} дн`);
      }
      return { text: lines.join("\n"), handled: true };
    }

    case "designer_summary": {
      if (!target) {
        return { text: "Уточни, про кого саме питаєш.", handled: true };
      }
      const monthPeriod = resolvePeriod("this_month", now);
      const [activeTasks, approvedResult, timerResult] = await Promise.all([
        loadTasks(admin, teamId, { statuses: ACTIVE_STATUSES }),
        admin
          .from("activity_log")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamId)
          .eq("action", "design_task_status")
          .eq("metadata->>to_status", "approved")
          .eq("metadata->>assignee_user_id", target.userId)
          .gte("created_at", monthPeriod.startIso as string)
          .lt("created_at", monthPeriod.endIso as string),
        admin
          .from("design_task_timer_sessions")
          .select("started_at,paused_at")
          .eq("team_id", teamId)
          .eq("user_id", target.userId)
          .gte("started_at", monthPeriod.startIso as string)
          .lt("started_at", monthPeriod.endIso as string)
          .limit(5000),
      ]);
      if (approvedResult.error) throw new Error(`activity_log (approved): ${approvedResult.error.message}`);
      if (timerResult.error) throw new Error(`design_task_timer_sessions: ${timerResult.error.message}`);

      const mine = activeTasks.filter((t) => taskAssignee(t) === target.userId);
      const inRevision = mine.filter((t) => taskStatus(t) === "changes").length;
      const pending = mine.reduce((sum, t) => sum + pendingRevisions(t), 0);
      let seconds = 0;
      for (const s of ((timerResult.data ?? []) as Array<{ started_at: string; paused_at?: string | null }>)) {
        const start = new Date(s.started_at).getTime();
        const end = s.paused_at ? new Date(s.paused_at).getTime() : now.getTime();
        seconds += Math.min(MAX_TIMER_SESSION_SECONDS, Math.max(0, Math.floor((end - start) / 1000)));
      }

      const lines = [
        `<b>${escapeTelegramHtml(shortName(target.name))}</b>`,
        "",
        `• Активних задач: ${mine.length}${inRevision > 0 ? ` (у правках: ${inRevision})` : ""}`,
        `• Правок без відповіді: ${pending}`,
        `• Затверджено за цей місяць: ${approvedResult.count ?? 0}`,
        `• Час за таймерами за місяць: ${formatDuration(seconds)}`,
      ];
      if (mine.length > 0) {
        lines.push("");
        for (const task of mine.slice(0, limit)) lines.push(taskLine(task, personLabel));
      }
      return { text: lines.join("\n"), handled: true };
    }

    default:
      return { text: HELP_TEXT, handled: false };
  }
}

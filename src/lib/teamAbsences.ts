import { supabase } from "@/lib/supabaseClient";
import { toneBadgeClass, type Tone } from "@/lib/statusTones";
// Типи з квотою і робочий календар живуть у чистому модулі без Supabase,
// щоб їх можна було тестувати юнітами.
import { QUOTA_ABSENCE_KINDS, type QuotaAbsenceKind } from "@/lib/teamAbsenceCalendar";

export { QUOTA_ABSENCE_KINDS };
export type { QuotaAbsenceKind };

// Team absences log (журнал відсутностей) data access.
// One entry = one person absent over a date range [startDate, endDate] with a
// reason. A single-day absence has startDate === endDate.
// Backed by tosho.team_absences (scripts/team-absences.sql + team-absences-quotas.sql).
//
// RLS: читає будь-який учасник воркспейсу, пише owner/SEO. Self-service запити
// (Фаза 2) додадуть insert самому за себе зі статусом pending.

export type TeamAbsenceKind = "sick_leave" | "day_off" | "vacation" | "other";

/**
 * pending → approved | declined; cancelled = заявник відкликав.
 *
 * ВАЖЛИВО: норму дизайнерів ріжуть ЛИШЕ approved (див. designerPayroll.ts) і
 * лише approved списує квоту (RPC team_absence_balances). Усе, що не approved,
 * існує тільки як намір.
 */
export type TeamAbsenceStatus = "pending" | "approved" | "declined" | "cancelled";

export type TeamAbsence = {
  id: string;
  userId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD, inclusive (equals startDate for one-day absences)
  kind: TeamAbsenceKind;
  status: TeamAbsenceStatus;
  comment: string | null;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  // Причини рішення тут НЕМАЄ навмисно: колонку знято з табличного select,
  // бо журнал читає вся команда. Беремо її окремо — loadAbsenceDecisionComments().
};

export const TEAM_ABSENCE_KIND_OPTIONS: Array<{ value: TeamAbsenceKind; label: string }> = [
  { value: "vacation", label: "Відпустка" },
  { value: "day_off", label: "Day-off" },
  { value: "sick_leave", label: "Лікарняний" },
  { value: "other", label: "Інше" },
];

export const TEAM_ABSENCE_KIND_LABELS: Record<TeamAbsenceKind, string> = {
  sick_leave: "Лікарняний",
  day_off: "Day-off",
  vacation: "Відпустка",
  other: "Інше",
};

/**
 * ЄДИНЕ джерело тону відсутності. Класи збираються тільки через таблиці
 * statusTones — вручну рядки `tone-*` тут не пишемо.
 *
 * Відпустка — info (спокійний синій), day-off — accent (фіолетовий),
 * лікарняний — warning (амбер). Червоний свідомо не використовуємо: буденна
 * хвороба не аварія.
 *
 * Раніше ця мапа існувала у трьох копіях (teamAbsences, teamAvailability,
 * TeamPage) і встигла розійтись: лікарняний був warning в одному файлі й
 * danger у сусідньому. Тепер копія одна — ця.
 */
export const TEAM_ABSENCE_KIND_TONE: Record<TeamAbsenceKind, Tone> = {
  vacation: "info",
  day_off: "accent",
  // Амбер (рішення CEO 2026-08-02, після проби бірюзи). Тепер він однозначний:
  // дні народження й річниці переїхали на festive, тож жовтий на сторінці
  // означає рівно одне — лікарняний.
  sick_leave: "warning",
  other: "neutral",
};

export const TEAM_ABSENCE_KIND_BADGE_CLASSES: Record<TeamAbsenceKind, string> = {
  sick_leave: toneBadgeClass[TEAM_ABSENCE_KIND_TONE.sick_leave],
  day_off: toneBadgeClass[TEAM_ABSENCE_KIND_TONE.day_off],
  vacation: toneBadgeClass[TEAM_ABSENCE_KIND_TONE.vacation],
  other: toneBadgeClass[TEAM_ABSENCE_KIND_TONE.other],
};

export function isQuotaAbsenceKind(kind: TeamAbsenceKind): kind is QuotaAbsenceKind {
  return kind !== "other";
}

export function normalizeTeamAbsenceKind(value?: string | null): TeamAbsenceKind {
  return value === "sick_leave" || value === "day_off" || value === "vacation" ? value : "other";
}

export function normalizeTeamAbsenceStatus(value?: string | null): TeamAbsenceStatus {
  return value === "pending" || value === "declined" || value === "cancelled" ? value : "approved";
}

export const TEAM_ABSENCE_STATUS_LABELS: Record<TeamAbsenceStatus, string> = {
  pending: "На погодженні",
  approved: "Погоджено",
  declined: "Відхилено",
  cancelled: "Скасовано",
};

export const TEAM_ABSENCE_STATUS_TONE: Record<TeamAbsenceStatus, Tone> = {
  pending: "warning",
  approved: "success",
  declined: "danger",
  cancelled: "neutral",
};

type TeamAbsenceRow = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  kind: string | null;
  status: string | null;
  comment: string | null;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
};

const ABSENCE_COLUMNS =
  // decision_comment свідомо відсутній: грант на цю колонку відкликано
  // (scripts/team-absences-selfservice.sql), і запит із нею впаде.
  "id, user_id, start_date, end_date, kind, status, comment, requested_by, decided_by, decided_at";

/** Статуси, які взагалі мають потрапляти на планер і в списки за замовчуванням. */
export const LIVE_ABSENCE_STATUSES: TeamAbsenceStatus[] = ["approved", "pending"];

function mapAbsenceRow(row: TeamAbsenceRow): TeamAbsence {
  return {
    id: row.id,
    userId: row.user_id,
    startDate: row.start_date,
    endDate: row.end_date,
    kind: normalizeTeamAbsenceKind(row.kind),
    status: normalizeTeamAbsenceStatus(row.status),
    comment: row.comment,
    requestedBy: row.requested_by,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
  };
}

/**
 * List absences that overlap a date window [from, to), ordered by start date.
 * An absence overlaps when start_date < to AND end_date >= from, so multi-day
 * periods that straddle the boundary still surface.
 */
export async function listTeamAbsencesInRange(params: {
  workspaceId: string;
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, exclusive
  statuses?: TeamAbsenceStatus[];
}): Promise<TeamAbsence[]> {
  const statuses = params.statuses ?? LIVE_ABSENCE_STATUSES;

  const { data, error } = await supabase
    .schema("tosho")
    .from("team_absences")
    .select(ABSENCE_COLUMNS)
    .eq("workspace_id", params.workspaceId)
    .in("status", statuses)
    .lt("start_date", params.to)
    .gte("end_date", params.from)
    .order("start_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as TeamAbsenceRow[]).map(mapAbsenceRow);
}

/** Межі місяця як [from, to) у форматі YYYY-MM-DD. */
export function monthRangeKeys(year: number, month: number /* 1-based */) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const to = `${next.y}-${String(next.m).padStart(2, "0")}-01`;
  return { from, to };
}

/** Зручна обгортка «місяць» над listTeamAbsencesInRange. */
export async function listTeamAbsencesForMonth(
  workspaceId: string,
  year: number,
  month: number, // 1-based
  statuses?: TeamAbsenceStatus[]
): Promise<TeamAbsence[]> {
  const { from, to } = monthRangeKeys(year, month);
  return listTeamAbsencesInRange({ workspaceId, from, to, statuses });
}

/** Усі записи однієї людини за рік — для вкладки «Запити». */
export async function listTeamAbsencesForUserYear(params: {
  workspaceId: string;
  userId: string;
  year: number;
}): Promise<TeamAbsence[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("team_absences")
    .select(ABSENCE_COLUMNS)
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .lt("start_date", `${params.year + 1}-01-01`)
    .gte("end_date", `${params.year}-01-01`)
    .order("start_date", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as TeamAbsenceRow[]).map(mapAbsenceRow);
}

/**
 * Внести відсутність ЗА людину. Owner/SEO — право перевіряє RLS на сервері.
 *
 * Через серверну функцію, бо раніше цей шлях МОВЧАВ: SEO ставив людині
 * відпустку, а людина дізнавалась про це, лише якщо сама відкривала CRM —
 * хоча запис міняє її баланс і ріже норму (а отже бонус).
 */
export async function createTeamAbsence(params: {
  /** Кому записуємо. Воркспейс і автора сервер бере з токена викликача. */
  userId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (>= startDate)
  kind: TeamAbsenceKind;
  comment: string | null;
  status?: TeamAbsenceStatus;
}): Promise<TeamAbsence> {
  const parsed = await callAbsenceFunction({
    action: "record",
    userId: params.userId,
    kind: params.kind,
    startDate: params.startDate,
    endDate: params.endDate,
    comment: params.comment,
    status: params.status ?? "approved",
  });

  return mapAbsenceRow(parsed.absence as TeamAbsenceRow);
}

/** Змінити чужий запис. Owner/SEO — право перевіряє RLS на сервері. */
export async function updateTeamAbsence(params: {
  id: string;
  /** Воркспейс сервер бере з членства викликача, тому в підписі його немає. */
  userId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (>= startDate)
  kind: TeamAbsenceKind;
  comment: string | null;
}): Promise<TeamAbsence> {
  const parsed = await callAbsenceFunction({
    action: "revise",
    absenceId: params.id,
    userId: params.userId,
    kind: params.kind,
    startDate: params.startDate,
    endDate: params.endDate,
    comment: params.comment,
  });

  return mapAbsenceRow(parsed.absence as TeamAbsenceRow);
}

/**
 * Прибрати запис. Owner/SEO — право перевіряє RLS на сервері.
 *
 * Воркспейс сервер бере з членства викликача, а не з аргументу — тому в
 * підписі його вже немає.
 */
export async function deleteTeamAbsence(id: string): Promise<void> {
  await callAbsenceFunction({ action: "revoke", absenceId: id });
}

/**
 * Виклик серверної функції заявок. Один рот на два боки: подання й рішення
 * ходять тим самим шляхом, бо обидва — «запис + аудит + сповіщення» одним
 * пакетом, який не можна лишити на совість вкладки.
 */
async function callAbsenceFunction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Сесія завершилась — увійдіть знову");

  const response = await fetch("/.netlify/functions/team-absence-request", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let parsed: Record<string, unknown> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  if (!response.ok) {
    if (typeof parsed.error === "string") throw new Error(parsed.error);
    // 404 з порожнім тілом = ендпойнта немає взагалі. Локально це майже завжди
    // `npm run dev`: Vite не роздає /.netlify/functions/*, і кожна дія, що ходить
    // сюди (подання, погодження, редагування, видалення), падає однаково німо.
    // Годину на це витрачати не треба — кажемо прямо.
    if (response.status === 404 && isLocalhost()) {
      throw new Error(
        "Серверної функції немає на цьому сервері. Для дій із відсутностями потрібен «npx netlify dev» (http://localhost:8888), звичайний «npm run dev» їх не піднімає."
      );
    }
    throw new Error(`HTTP ${response.status}`);
  }
  return parsed;
}

function isLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}

/**
 * Створити ВЛАСНУ заявку — через серверну функцію.
 *
 * Раніше вставку робив браузер, а сповіщення слав він же: закрив вкладку
 * відразу після «Надіслати» — заявка в базі є, а SEO про неї не знає ніколи.
 * Тепер запис і сповіщення — один серверний виклик.
 *
 * Сама вставка на сервері йде ЮЗЕРСЬКИМ клієнтом, тож RLS і тригери (квота
 * лікарняних, межі дат, «лише за себе») лишаються в грі — статус визначає
 * тип, а не клієнт, і підмінити його з фронта не вийде.
 */
export async function createOwnAbsenceRequest(params: {
  startDate: string;
  endDate: string;
  kind: Exclude<TeamAbsenceKind, "other">;
  comment: string | null;
}): Promise<TeamAbsence> {
  const parsed = await callAbsenceFunction({
    action: "submit",
    kind: params.kind,
    startDate: params.startDate,
    endDate: params.endDate,
    comment: params.comment,
  });

  const absence = parsed.absence as TeamAbsence | undefined;
  if (!absence?.id) throw new Error("Сервер не повернув заявку — оновіть сторінку");

  return {
    ...absence,
    kind: normalizeTeamAbsenceKind(absence.kind),
    status: normalizeTeamAbsenceStatus(absence.status),
    requestedBy: absence.requestedBy ?? null,
    decidedBy: absence.decidedBy ?? null,
    decidedAt: absence.decidedAt ?? null,
  };
}

/**
 * Скасувати власну заявку, поки вона на погодженні.
 *
 * Оновлюємо ТІЛЬКИ статус: тригер у БД відхилить спробу заодно посунути дати
 * чи змінити тип (scripts/team-absences-selfservice.sql).
 */
export async function cancelOwnAbsenceRequest(params: {
  workspaceId: string;
  id: string;
}): Promise<void> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("team_absences")
    .update({ status: "cancelled" })
    .eq("workspace_id", params.workspaceId)
    .eq("id", params.id)
    .eq("status", "pending")
    .select("id");

  if (error) throw error;
  // .select() навмисно: update, що не зачепив рядків, повертає error === null,
  // і UI показав би «скасовано» на заявці, яка лишилась на погодженні.
  if (!data || data.length === 0) {
    throw new Error("Заявку вже опрацьовано — оновіть сторінку");
  }
}

/**
 * Рішення по заявці — лише через серверну функцію: там і аудит, і сповіщення,
 * і перевірка «свою заявку вирішує інший».
 */
export async function decideAbsenceRequest(params: {
  absenceId: string;
  decision: "approved" | "declined";
  comment?: string | null;
}): Promise<void> {
  await callAbsenceFunction({
    action: "decide",
    absenceId: params.absenceId,
    decision: params.decision,
    comment: params.comment ?? null,
  });
}

/**
 * Причини рішень. Колонку `decision_comment` знято з табличного select
 * (вона видна всій команді), тож читаємо її окремим RPC: заявник бачить свої,
 * owner/SEO — усі.
 */
export async function loadAbsenceDecisionComments(year: number): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .schema("tosho")
    .rpc("team_absence_decisions", { p_year: year });

  if (error) throw error;

  const map = new Map<string, string>();
  (data ?? []).forEach((row) => {
    if (row.decision_comment) map.set(row.absence_id, row.decision_comment);
  });
  return map;
}

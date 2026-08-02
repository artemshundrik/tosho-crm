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
  decisionComment: string | null;
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
 * Лікарняний свідомо НЕ danger (рішення CEO 2026-07-26): червоний читався
 * надто тривожно як на буденну відсутність. Відпустка — info (спокійний
 * синій), day-off — accent (фіолетовий), бо синій уже зайнятий відпусткою.
 *
 * Раніше ця мапа існувала у трьох копіях (teamAbsences, teamAvailability,
 * TeamPage) і встигла розійтись: лікарняний був warning в одному файлі й
 * danger у сусідньому. Тепер копія одна — ця.
 */
export const TEAM_ABSENCE_KIND_TONE: Record<TeamAbsenceKind, Tone> = {
  vacation: "info",
  day_off: "accent",
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
  decision_comment: string | null;
};

const ABSENCE_COLUMNS =
  "id, user_id, start_date, end_date, kind, status, comment, requested_by, decided_by, decided_at, decision_comment";

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
    decisionComment: row.decision_comment,
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

/** Create one absence entry. Owner/SEO only (enforced by RLS). */
export async function createTeamAbsence(params: {
  workspaceId: string;
  userId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (>= startDate)
  kind: TeamAbsenceKind;
  comment: string | null;
  createdBy: string | null;
  status?: TeamAbsenceStatus;
}): Promise<TeamAbsence> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("team_absences")
    .insert({
      workspace_id: params.workspaceId,
      user_id: params.userId,
      start_date: params.startDate,
      end_date: params.endDate,
      kind: params.kind,
      status: params.status ?? "approved",
      comment: params.comment,
      created_by: params.createdBy,
      requested_by: params.createdBy,
    })
    .select(ABSENCE_COLUMNS)
    .single();

  if (error) throw error;

  return mapAbsenceRow(data as TeamAbsenceRow);
}

/** Update one absence entry. Owner/SEO only (enforced by RLS). */
export async function updateTeamAbsence(params: {
  workspaceId: string;
  id: string;
  userId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (>= startDate)
  kind: TeamAbsenceKind;
  comment: string | null;
}): Promise<TeamAbsence> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("team_absences")
    .update({
      user_id: params.userId,
      start_date: params.startDate,
      end_date: params.endDate,
      kind: params.kind,
      comment: params.comment,
    })
    .eq("workspace_id", params.workspaceId)
    .eq("id", params.id)
    .select(ABSENCE_COLUMNS)
    .single();

  if (error) throw error;

  return mapAbsenceRow(data as TeamAbsenceRow);
}

/** Delete one absence entry. Owner/SEO only (enforced by RLS). */
export async function deleteTeamAbsence(workspaceId: string, id: string): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .from("team_absences")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id);

  if (error) throw error;
}

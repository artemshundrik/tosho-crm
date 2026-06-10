import { supabase } from "@/lib/supabaseClient";

// Team absences log (журнал відсутностей) data access.
// One entry = one person absent over a date range [startDate, endDate] with a
// reason. A single-day absence has startDate === endDate.
// Backed by tosho.team_absences (see scripts/team-absences.sql).
// RLS: any workspace member can read, owner/SEO can write.

export type TeamAbsenceKind = "sick_leave" | "day_off" | "vacation" | "other";

export type TeamAbsence = {
  id: string;
  userId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD, inclusive (equals startDate for one-day absences)
  kind: TeamAbsenceKind;
  comment: string | null;
};

export const TEAM_ABSENCE_KIND_OPTIONS: Array<{ value: TeamAbsenceKind; label: string }> = [
  { value: "sick_leave", label: "Лікарняний" },
  { value: "day_off", label: "Вихідний" },
  { value: "vacation", label: "Відпустка" },
  { value: "other", label: "Інше" },
];

export const TEAM_ABSENCE_KIND_LABELS: Record<TeamAbsenceKind, string> = {
  sick_leave: "Лікарняний",
  day_off: "Вихідний",
  vacation: "Відпустка",
  other: "Інше",
};

// Tone classes match the availability badges in teamAvailability.ts so the
// same concept reads the same everywhere (sick = danger, vacation = warning).
export const TEAM_ABSENCE_KIND_BADGE_CLASSES: Record<TeamAbsenceKind, string> = {
  sick_leave: "bg-danger-soft text-danger-foreground border-danger-soft-border",
  day_off: "bg-info-soft text-info-foreground border-info-soft-border",
  vacation: "bg-warning-soft text-warning-foreground border-warning-soft-border",
  other: "bg-muted text-muted-foreground border-border",
};

export function normalizeTeamAbsenceKind(value?: string | null): TeamAbsenceKind {
  return value === "sick_leave" || value === "day_off" || value === "vacation" ? value : "other";
}

type TeamAbsenceRow = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  kind: string | null;
  comment: string | null;
};

const ABSENCE_COLUMNS = "id, user_id, start_date, end_date, kind, comment";

function mapAbsenceRow(row: TeamAbsenceRow): TeamAbsence {
  return {
    id: row.id,
    userId: row.user_id,
    startDate: row.start_date,
    endDate: row.end_date,
    kind: normalizeTeamAbsenceKind(row.kind),
    comment: row.comment,
  };
}

/**
 * List absences that overlap one workspace month, ordered by start date.
 * An absence overlaps month [from, to) when start_date < to AND end_date >= from,
 * so multi-day periods that straddle the month boundary still surface.
 */
export async function listTeamAbsencesForMonth(
  workspaceId: string,
  year: number,
  month: number // 1-based
): Promise<TeamAbsence[]> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const to = `${nextMonth.y}-${String(nextMonth.m).padStart(2, "0")}-01`;

  const { data, error } = await supabase
    .schema("tosho")
    .from("team_absences")
    .select(ABSENCE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .lt("start_date", to)
    .gte("end_date", from)
    .order("start_date", { ascending: true })
    .order("created_at", { ascending: true });

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
      comment: params.comment,
      created_by: params.createdBy,
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

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  expandSchedulesToAbsences,
  parseScheduleDays,
  type TeamWorkSchedule,
} from "../../../src/lib/teamWorkSchedule";
import type { TeamAbsence } from "../../../src/lib/teamAbsences";

/**
 * Постійні графіки роботи для серверних поверхонь: ранкового звіту й бота.
 *
 * НАВІЩО ОКРЕМО ВІД ЖУРНАЛУ. Графік — це патерн («вівторок і п'ятниця вдома»),
 * і рядків у tosho.team_absences він не створює. Тобто кожен, хто питає базу
 * «хто сьогодні з дому», без цього модуля бачить лише разові записи — і
 * ранковий звіт мовчав би про половину домашніх днів команди.
 *
 * Розгортання спільне з застосунком (src/lib/teamWorkSchedule.ts): правила
 * «свято сильніше за графік» і «відпустка перекриває графік» мусять бути одні,
 * інакше бот і сторінка почнуть розповідати різне про той самий день.
 */

type ScheduleRow = {
  id?: string | null;
  user_id?: string | null;
  days?: unknown;
  effective_from?: string | null;
  effective_to?: string | null;
};

/** Сирий рядок відсутності у формі, якою його чекають звіт і бот. */
export type SyntheticAbsenceRow = {
  user_id: string;
  start_date: string;
  end_date: string;
  kind: "wfh";
};

export async function loadWorkSchedules(
  admin: SupabaseClient,
  workspaceIds: string[]
): Promise<TeamWorkSchedule[]> {
  if (workspaceIds.length === 0) return [];
  const { data, error } = await admin
    .schema("tosho")
    .from("team_work_schedules")
    .select("id,user_id,days,effective_from,effective_to")
    .in("workspace_id", workspaceIds);
  // Мовчазна порожнеча краща за впалий ранковий звіт: графіки — доповнення до
  // журналу, а не його заміна.
  if (error) {
    console.error("team_work_schedules:", error.message);
    return [];
  }
  return ((data ?? []) as ScheduleRow[])
    .filter((row): row is ScheduleRow & { id: string; user_id: string; effective_from: string } =>
      Boolean(row.id && row.user_id && row.effective_from)
    )
    .map((row) => ({
      id: row.id,
      userId: row.user_id,
      days: parseScheduleDays(row.days),
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to ?? null,
    }));
}

/**
 * Дні «з дому» за графіком на вказані дати — у вигляді рядків журналу.
 *
 * `absences` передаємо ті, що вже прочитані з бази: розгортання має знати про
 * відпустки, інакше людина у відпустці потрапила б у рядок «🏠 З дому».
 */
export function scheduleRowsForDates(input: {
  schedules: TeamWorkSchedule[];
  dateKeys: string[];
  absences: Array<{ user_id?: string | null; start_date?: string | null; end_date?: string | null; kind?: string | null; status?: string | null }>;
  /** день → чи робочий він. Свято сильніше за графік. */
  exceptions?: Map<string, boolean>;
}): SyntheticAbsenceRow[] {
  if (input.schedules.length === 0 || input.dateKeys.length === 0) return [];

  const known: TeamAbsence[] = input.absences
    .filter((row) => row.user_id && row.start_date && row.end_date)
    .map((row) => ({
      id: "",
      userId: row.user_id as string,
      startDate: row.start_date as string,
      endDate: row.end_date as string,
      kind: (row.kind ?? "other") as TeamAbsence["kind"],
      // Журнал звіту вже відфільтрований до чинних записів, тож усе, що сюди
      // доїхало, для розгортання є погодженим.
      status: (row.status ?? "approved") as TeamAbsence["status"],
      comment: null,
      requestedBy: null,
      decidedBy: null,
      decidedAt: null,
      createdAt: null,
    }));

  const sorted = [...input.dateKeys].sort();
  return expandSchedulesToAbsences({
    schedules: input.schedules,
    from: sorted[0],
    to: sorted[sorted.length - 1],
    exceptions: input.exceptions,
    absences: known,
  })
    .filter((row) => input.dateKeys.includes(row.startDate))
    .map((row) => ({
      user_id: row.userId,
      start_date: row.startDate,
      end_date: row.endDate,
      kind: "wfh" as const,
    }));
}

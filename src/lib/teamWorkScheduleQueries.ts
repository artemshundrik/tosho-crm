/**
 * Доступ до графіків роботи (tosho.team_work_schedules).
 *
 * Окремо від чистої математики в teamWorkSchedule.ts — щоб ту можна було
 * перевіряти юнітами без Supabase, як зроблено з календарем відсутностей.
 *
 * ОДИН ЧИННИЙ ГРАФІК НА ЛЮДИНУ. Історію лишаємо (скасований графік не
 * видаляється, а закривається датою), але редактор працює з поточним: людям
 * потрібен режим на цей тиждень, а не археологія за рік.
 */

import { supabase } from "@/lib/supabaseClient";
import {
  parseScheduleDays,
  type ScheduleDays,
  type TeamWorkSchedule,
} from "@/lib/teamWorkSchedule";

type ScheduleRow = {
  id: string;
  user_id: string;
  days: unknown;
  effective_from: string;
  effective_to: string | null;
};

const SCHEDULE_COLUMNS = "id, user_id, days, effective_from, effective_to";

/**
 * team_work_schedules немає в згенерованих типах — той самий каст, що і в
 * ставках (lib/payroll.ts) та налаштуваннях Нової Пошти. Типи генеруються з
 * бази, а таблиця свіжа; каст лишається, доки їх не перегенерують.
 */
const scheduleTable = () => supabase.schema("tosho").from("team_work_schedules" as never);

function mapRow(row: ScheduleRow): TeamWorkSchedule {
  return {
    id: row.id,
    userId: row.user_id,
    days: parseScheduleDays(row.days),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

/**
 * Графіки воркспейсу, чинні хоч якийсь день у вікні [from, to].
 *
 * Закриті раніше за вікно не потрібні нікому: розгортання все одно їх
 * пропустить, а тягнути історію на планер — зайвий трафік.
 */
export async function listTeamWorkSchedules(params: {
  workspaceId: string;
  from?: string;
  to?: string;
}): Promise<TeamWorkSchedule[]> {
  let query = scheduleTable().select(SCHEDULE_COLUMNS).eq("workspace_id", params.workspaceId);

  if (params.to) query = query.lte("effective_from", params.to);
  if (params.from) query = query.or(`effective_to.is.null,effective_to.gte.${params.from}`);

  const { data, error } = await query.order("effective_from", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as ScheduleRow[]).map(mapRow);
}

/** Чинний графік людини — той, який показує й редагує картка. */
export async function loadActiveWorkSchedule(params: {
  workspaceId: string;
  userId: string;
}): Promise<TeamWorkSchedule | null> {
  const { data, error } = await scheduleTable()
    .select(SCHEDULE_COLUMNS)
    .eq("workspace_id", params.workspaceId)
    .eq("user_id", params.userId)
    .is("effective_to", null)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as unknown as ScheduleRow) : null;
}

/**
 * Зберегти графік людини.
 *
 * Чинний рядок оновлюємо на місці, а не заводимо новий: інакше кожне
 * пересування одного дня плодило б період дії, і «який графік зараз» стало б
 * питанням із відповіддю «залежить».
 */
export async function saveWorkSchedule(params: {
  workspaceId: string;
  userId: string;
  days: ScheduleDays;
  actorUserId: string | null;
  existingId?: string | null;
}): Promise<void> {
  if (params.existingId) {
    const { error } = await scheduleTable()
      .update({ days: params.days } as never)
      .eq("id", params.existingId)
      .eq("workspace_id", params.workspaceId);
    if (error) throw error;
    return;
  }

  const { error } = await scheduleTable().insert({
    workspace_id: params.workspaceId,
    user_id: params.userId,
    days: params.days,
    created_by: params.actorUserId,
  } as never);
  if (error) throw error;
}

/**
 * Прибрати графік: закриваємо вчорашнім днем, а не видаляємо.
 *
 * Видалення стерло б і минуле — планер за минулий місяць почав би показувати,
 * що людина всі ті вівторки була в офісі, хоч вона працювала з дому.
 */
export async function clearWorkSchedule(params: {
  workspaceId: string;
  scheduleId: string;
}): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const { error } = await scheduleTable()
    .update({ effective_to: yesterday.toISOString().slice(0, 10) } as never)
    .eq("id", params.scheduleId)
    .eq("workspace_id", params.workspaceId);
  if (error) throw error;
}

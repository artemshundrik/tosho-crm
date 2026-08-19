import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";

/**
 * Історія персональних ставок менеджерів.
 *
 * tosho.team_member_manager_rates тримає лише ПОТОЧНЕ значення — до появи
 * цієї історії стара ставка просто затиралась, і питання «яка ставка була в
 * людини в березні» лишалось без відповіді назавжди. Записи веде тригер
 * (scripts/manager-rate-history.sql), з клієнта таблиця тільки читається.
 */

export type ManagerRateChange = {
  id: number;
  userId: string;
  oldRate: number | null;
  newRate: number;
  changedBy: string | null;
  changedAt: string;
};

export async function loadManagerRateHistory(
  userId?: string | null,
  limit = 50
): Promise<ManagerRateChange[]> {
  const workspaceId = await resolveWorkspaceId(userId);
  if (!workspaceId) return [];

  const { data, error } = await supabase
    .schema("tosho")
    .from("team_member_manager_rate_changes")
    .select("id,user_id,old_rate,new_rate,changed_by,changed_at")
    .eq("workspace_id", workspaceId)
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (!/does not exist|relation|schema cache|could not find the table/i.test(error.message ?? "")) {
      console.error("Failed to load manager rate history", error);
    }
    return [];
  }

  return ((data ?? []) as Array<{
    id: number;
    user_id: string;
    old_rate: number | null;
    new_rate: number;
    changed_by: string | null;
    changed_at: string;
  }>).map((row) => ({
    id: row.id,
    userId: row.user_id,
    oldRate: row.old_rate === null ? null : Number(row.old_rate),
    newRate: Number(row.new_rate),
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  }));
}

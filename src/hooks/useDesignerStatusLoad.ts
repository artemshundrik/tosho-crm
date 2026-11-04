import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ACTIVE_DESIGN_STATUSES } from "@/lib/designWorkload";
import type { DesignerStatusCounts } from "@/components/design/DesignerStatusLoad";

export { DesignerStatusLoad } from "@/components/design/DesignerStatusLoad";

export type DesignerStatusLoadMap = Map<string, DesignerStatusCounts>;

/**
 * Навантаження дизайнерів за етапами для тих місць, де дошки дизайну під рукою
 * немає: «Новий прорахунок», білдер, вкладка «Дизайн» прорахунку. «Дизайн» і
 * картка задачі рахують те саме зі своїх уже завантажених задач і цей хук не
 * викликають.
 *
 * Тягне лише активні задачі (нові, в роботі, правки) і два поля з них, тож
 * запит дешевий; `enabled` — щоб не ходити в базу, поки вікно закрите.
 */
export function useDesignerStatusLoad(teamId: string | null | undefined, enabled = true) {
  const [loadById, setLoadById] = useState<DesignerStatusLoadMap>(() => new Map());
  const [scale, setScale] = useState(0);

  useEffect(() => {
    if (!enabled || !teamId) return;
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("assignee_user_id:metadata->>assignee_user_id,status:metadata->>status")
        .eq("team_id", teamId)
        .eq("action", "design_task")
        .in("metadata->>status", ACTIVE_DESIGN_STATUSES);
      if (!active) return;
      if (error) {
        console.warn("Failed to load designer status load", error);
        return;
      }
      const next: DesignerStatusLoadMap = new Map();
      for (const row of (data ?? []) as Array<{ assignee_user_id?: string | null; status?: string | null }>) {
        const assigneeId = row.assignee_user_id?.trim();
        if (!assigneeId) continue;
        const counts = next.get(assigneeId) ?? { newCount: 0, inProgressCount: 0, changesCount: 0 };
        if (row.status === "new") counts.newCount += 1;
        else if (row.status === "in_progress") counts.inProgressCount += 1;
        else if (row.status === "changes") counts.changesCount += 1;
        next.set(assigneeId, counts);
      }
      setLoadById(next);
      setScale(getDesignerStatusScale(next, Array.from(next.keys())));
    })();
    return () => {
      active = false;
    };
  }, [teamId, enabled]);

  // Масштаб — найзавантаженіший серед усіх, на кому є активні задачі.
  return { byId: loadById, scale };
}

export type DesignerStatusLoadState = ReturnType<typeof useDesignerStatusLoad>;

/** Найбільша кількість активних задач серед людей у списку — масштаб смуги. */
export const getDesignerStatusScale = (
  loadById: ReadonlyMap<string, DesignerStatusCounts>,
  memberIds: readonly string[]
) =>
  memberIds.reduce((max, id) => {
    const counts = loadById.get(id);
    return counts ? Math.max(max, counts.newCount + counts.inProgressCount + counts.changesCount) : max;
  }, 0);

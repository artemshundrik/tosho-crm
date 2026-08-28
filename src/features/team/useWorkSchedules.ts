import { useQuery } from "@tanstack/react-query";

import { listTeamWorkSchedules } from "@/lib/teamWorkScheduleQueries";
import type { TeamWorkSchedule } from "@/lib/teamWorkSchedule";

const EMPTY: TeamWorkSchedule[] = [];

/**
 * Постійні графіки роботи команди на рік (REQ-166).
 *
 * Запитом, а не ефектом зі станом: `setState` в ефекті — це борг, який ратчет
 * перед пушем рахує окремо (react-hooks/set-state-in-effect), і тут він ні до
 * чого — дані читаються один раз на рік і чудово живуть у кеші.
 *
 * Помилку ковтаємо свідомо: без графіків планер просто не покаже постійних
 * «домашніх» днів, і валити через це весь розділ відсутностей неспівмірно.
 */
export function useWorkSchedules(workspaceId: string | null, year: number): TeamWorkSchedule[] {
  const { data } = useQuery({
    queryKey: ["team-work-schedules", workspaceId, year],
    enabled: Boolean(workspaceId),
    staleTime: 10 * 60_000,
    queryFn: () =>
      listTeamWorkSchedules({
        workspaceId: workspaceId as string,
        from: `${year}-01-01`,
        to: `${year}-12-31`,
      }).catch((error) => {
        console.error("[team] work schedules load failed", error);
        return EMPTY;
      }),
  });
  return data ?? EMPTY;
}

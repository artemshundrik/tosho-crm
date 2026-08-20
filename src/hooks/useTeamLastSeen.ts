import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabaseClient";

/**
 * «Коли людину бачили востаннє» — ПОВНА історія команди, а не вікно присутності.
 *
 * НАВІЩО ОКРЕМО ВІД КОНТЕКСТУ ПРИСУТНОСТІ. `useWorkspacePresenceState` живить
 * віджет «хто зараз онлайн» і навмисно тримає лише свіже: з бази читає останні
 * 30 хвилин, а зі списку викидає всіх, крім онлайн та щойно відлучених. Для
 * підпису «заходив 3 години тому» цього замало — і поверхні, які його показують,
 * мовчали або писали туманне «заходив».
 *
 * Тут читається `user_presence` цілком: рядків десятки, це разове читання на
 * завантаження сторінки.
 *
 * ДРУГА КОПІЯ ЦЬОГО ЗАПИТУ жила в TeamPage, а Пульс на сторінці «Команда» його
 * не мав узагалі — через це в списку людей стояло «Присутність без дій» без
 * жодного часу. Тепер джерело одне.
 */
export function useTeamLastSeen(teamId: string | null): Map<string, string> {
  const [lastSeenByUser, setLastSeenByUser] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    if (!teamId) {
      setLastSeenByUser(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("user_presence")
        .select("user_id,last_seen_at")
        .eq("team_id", teamId)
        .limit(500);
      if (cancelled || error) return;
      const map = new Map<string, string>();
      ((data ?? []) as Array<{ user_id?: string | null; last_seen_at?: string | null }>).forEach((row) => {
        if (row.user_id && row.last_seen_at) map.set(row.user_id, row.last_seen_at);
      });
      setLastSeenByUser(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return lastSeenByUser;
}

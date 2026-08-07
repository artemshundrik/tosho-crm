import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { Release } from "@/lib/releaseHistory";

/**
 * Запит історії релізів окремо від компонента — щоб сторінка й тулбар могли
 * брати той самий ключ і React Query віддавав один результат, без другого
 * походу в базу.
 */

type ReleaseRow = {
  id: string;
  released_at: string;
  title: string | null;
  changes: unknown;
};

export function useReleases() {
  return useQuery({
    queryKey: ["releases"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Release[]> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("releases")
        .select("id, released_at, title, changes")
        .order("released_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return ((data ?? []) as ReleaseRow[]).map((row) => ({
        id: row.id,
        releasedAt: row.released_at,
        title: row.title,
        changes: Array.isArray(row.changes) ? (row.changes as Release["changes"]) : [],
      }));
    },
  });
}

/** Робочі години з ритму сесій Claude Code — другий прилад поруч із комітами. */
export type WorkSession = {
  day: string;
  hours: number;
  blocks: Array<{ from: number; to: number }>;
};

/**
 * Окремий запит, бо джерело інше: релізи пише деплой, а години завантажує
 * скрипт із локальної машини. Дірка в даних тут нормальна — до 20 травня
 * Claude Code не було, і сторінка показує це порожнечею, а не нулем.
 */
export function useWorkSessions() {
  return useQuery({
    queryKey: ["work-sessions"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Map<string, WorkSession>> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("work_sessions")
        .select("day, hours, blocks")
        .order("day", { ascending: false })
        .limit(400);
      if (error) throw error;
      const map = new Map<string, WorkSession>();
      for (const row of (data ?? []) as Array<{ day: string; hours: number; blocks: unknown }>) {
        map.set(row.day, {
          day: row.day,
          hours: Number(row.hours) || 0,
          blocks: Array.isArray(row.blocks) ? (row.blocks as WorkSession["blocks"]) : [],
        });
      }
      return map;
    },
  });
}

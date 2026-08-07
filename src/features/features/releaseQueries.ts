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

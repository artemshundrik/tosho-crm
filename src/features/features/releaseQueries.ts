import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { Release } from "@/lib/releaseHistory";

/**
 * Запит історії релізів окремо від компонента: перемикач періоду живе в
 * тулбарі сторінки, а самі дані — в тілі. Обидва беруть той самий ключ, тож
 * React Query віддає один результат на двох, без другого походу в базу.
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

/** Вибраний період. «Усе» лишає повну історію, місяць звужує до свого ключа. */
export type Period = { kind: "all" } | { kind: "month"; key: string };

export function filterByPeriod(releases: Release[], period: Period): Release[] {
  if (period.kind === "all") return releases;
  return releases.filter((release) => release.releasedAt.slice(0, 7) === period.key);
}

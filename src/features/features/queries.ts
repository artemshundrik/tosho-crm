import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { FeatureKey } from "@/lib/featureCatalog";
import type { FeatureAdoption } from "@/lib/featureState";

/**
 * Особистий стан по можливостях для розділу «Можливості».
 *
 * Джерело — нічний знімок `tosho.feature_adoption`; RLS віддає людині лише її
 * рядки (власнику й CEO — усі). Дані оновлюються раз на добу, тож тут не
 * потрібна ані агресивна свіжість, ані інвалідація: staleTime у 5 хвилин
 * прибирає зайві запити при переходах між сторінками.
 */

export type FeatureAdoptionMap = Partial<Record<FeatureKey, FeatureAdoption>>;

type AdoptionRow = {
  feature_key: string;
  uses: number | null;
  last_used_at: string | null;
};

export const featureAdoptionKey = (userId: string) => ["feature-adoption", userId] as const;

export function useMyFeatureAdoption(userId: string | null | undefined) {
  return useQuery({
    queryKey: featureAdoptionKey(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FeatureAdoptionMap> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("feature_adoption")
        .select("feature_key, uses, last_used_at")
        .eq("user_id", userId as string);
      if (error) throw error;

      const map: FeatureAdoptionMap = {};
      for (const row of (data ?? []) as AdoptionRow[]) {
        map[row.feature_key as FeatureKey] = {
          uses: row.uses ?? 0,
          lastUsedAt: row.last_used_at,
        };
      }
      return map;
    },
  });
}

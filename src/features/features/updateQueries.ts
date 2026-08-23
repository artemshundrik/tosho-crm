import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import type { ModuleKey } from "@/lib/moduleAccess";
import type { ProductUpdate } from "@/lib/productUpdates";

/**
 * Анонси оновлень і позначки «переглянув».
 *
 * Свіжість агресивна: людина щойно закрила модалку — стрічка й бейдж мають
 * одразу це відобразити, інакше лічильник бреше й довіра до нього зникає.
 */

const UPDATES_KEY = ["product-updates"] as const;
const READS_KEY = (userId: string) => ["product-update-reads", userId] as const;

type UpdateRow = {
  id: string;
  published_at: string;
  title: string;
  body: string;
  importance: string;
  module_key: string | null;
  feature_key: string | null;
  cta_label: string | null;
  cta_href: string | null;
};

function toUpdate(row: UpdateRow): ProductUpdate {
  return {
    id: row.id,
    publishedAt: row.published_at,
    title: row.title,
    body: row.body,
    importance: row.importance === "major" ? "major" : "minor",
    moduleKey: (row.module_key as ModuleKey | null) ?? null,
    featureKey: row.feature_key,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
  };
}

export function useProductUpdates() {
  return useQuery({
    queryKey: UPDATES_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProductUpdate[]> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("product_updates")
        .select("id, published_at, title, body, importance, module_key, feature_key, cta_label, cta_href")
        .order("published_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as UpdateRow[]).map(toUpdate);
    },
  });
}

/** Множина id, які людина вже бачила. */
export function useMyUpdateReads(userId: string | null | undefined) {
  return useQuery({
    queryKey: READS_KEY(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("product_update_reads")
        .select("update_id")
        .eq("user_id", userId as string);
      if (error) throw error;
      return new Set(((data ?? []) as Array<{ update_id: string }>).map((row) => row.update_id));
    },
  });
}

export function useMarkUpdatesRead(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { viewAs } = useAuth();

  const mutation = useMutation({
    mutationFn: async ({ ids, source }: { ids: string[]; source: "modal" | "feed" }) => {
      if (!userId || ids.length === 0) return;
      /**
       * У режимі «Дивитись як» сюди приходить `viewUserId` — чужий
       * ідентифікатор. Записавши позначку, ми забрали б у людини анонс
       * назавжди: вона його не бачила, а система вважала б, що бачила.
       * Бейдж усе одно гасне локально (onSuccess нижче), у базу нічого не йде.
       */
      if (viewAs) return;
      // ignoreDuplicates: людина могла бачити анонс і в модалці, і в стрічці —
      // перший показ важливіший, перезаписувати джерело не треба.
      const { error } = await supabase
        .schema("tosho")
        .from("product_update_reads")
        .upsert(
          ids.map((id) => ({ update_id: id, user_id: userId, source })),
          { onConflict: "update_id,user_id", ignoreDuplicates: true }
        );
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      // Оптимістично гасимо бейдж, не чекаючи мережі вдруге.
      queryClient.setQueryData<Set<string>>(READS_KEY(userId ?? ""), (prev) => {
        const next = new Set(prev ?? []);
        variables.ids.forEach((id) => next.add(id));
        return next;
      });
    },
  });

  return useCallback(
    (ids: string[], source: "modal" | "feed") => {
      if (!userId || ids.length === 0) return;
      mutation.mutate({ ids, source });
    },
    [mutation, userId]
  );
}

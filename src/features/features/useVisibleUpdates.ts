import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { defaultModuleAccess } from "@/lib/moduleAccess";
import { isUpdateVisible, type ProductUpdate } from "@/lib/productUpdates";
import { useMyUpdateReads, useProductUpdates } from "@/features/features/updateQueries";

/**
 * Анонси, відфільтровані під конкретну людину: за доступом до модуля і за
 * датою приходу в команду. Одне джерело правди для стрічки, бейджа й модалки —
 * інакше вони почали б розходитись у підрахунках.
 */

/** Коли людина зʼявилась у команді — щоб не вивалювати новачку стос старих релізів. */
function useJoinedAt(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["membership-joined-at", userId],
    enabled: Boolean(userId),
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .schema("tosho")
        .from("memberships")
        .select("created_at")
        .eq("user_id", userId as string)
        .maybeSingle();
      return (data as { created_at: string | null } | null)?.created_at ?? null;
    },
  });
}

export type VisibleUpdates = {
  /** Усе, що людині взагалі можна бачити, від найновішого. */
  visible: ProductUpdate[];
  /** З них ще не переглянуті. */
  unread: ProductUpdate[];
  /** Чи вже приїхали всі дані — до того модалку не показуємо. */
  ready: boolean;
  isRead: (id: string) => boolean;
};

export function useVisibleUpdates(): VisibleUpdates {
  const { viewUserId, moduleAccess, accessRole, jobRole } = useAuth();
  const { data: updates } = useProductUpdates();
  const { data: reads } = useMyUpdateReads(viewUserId);
  const { data: joinedAt, isPending: joinedPending } = useJoinedAt(viewUserId);

  const visible = useMemo(() => {
    if (!updates) return [];
    const ctx = {
      access: moduleAccess ?? defaultModuleAccess({ accessRole, jobRole }),
      accessRole,
      joinedAt: joinedAt ?? null,
    };
    return updates.filter((update) => isUpdateVisible(update, ctx));
  }, [updates, moduleAccess, accessRole, jobRole, joinedAt]);

  const unread = useMemo(
    () => (reads ? visible.filter((update) => !reads.has(update.id)) : []),
    [visible, reads]
  );

  return {
    visible,
    unread,
    // Поки не знаємо доступів, прочитаних і дати приходу — мовчимо: показати
    // зайве гірше, ніж показати із затримкою в пів секунди.
    ready: Boolean(updates) && Boolean(reads) && moduleAccess !== undefined && !joinedPending,
    isRead: (id: string) => Boolean(reads?.has(id)),
  };
}

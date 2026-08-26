import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { StackVersionRow } from "@/lib/stack";

/**
 * Дані сторінки «Стек» — дві половини з різних місць.
 *
 * ПОТОЧНІ ВЕРСІЇ їдуть у бандлі знімком (src/data/stackSnapshot.generated.ts):
 * їх знає репозиторій, і питати про них базу було б дивно.
 *
 * ЩО ВИЙШЛО В NPM — з `tosho.stack_versions`, куди раз на добу пише крон. З
 * браузера в реєстр не ходимо взагалі: 61 запит на кожне відкриття сторінки і
 * залежність від чужої доступності (вимога REQ-116).
 */

/** Що вийшло в npm — рядок на кожен пакет, який крон устиг перевірити. */
export function useStackVersions() {
  return useQuery({
    queryKey: ["stack-versions"],
    // Півгодини: крон ходить раз на добу, тож частіше питати нічого.
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<StackVersionRow[]> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("stack_versions")
        .select("name,latest_version,latest_seen_at,checked_at,advisories,advisories_version,latest_published_at");
      if (error) throw error;
      return (data ?? []) as StackVersionRow[];
    },
  });
}

export type StackPlatform = {
  postgres_version: string | null;
  schema_tables: number | null;
  schema_functions: number | null;
  cron_jobs: number | null;
  database_bytes: number | null;
  storage_bytes: number | null;
  storage_captured_at: string | null;
};

/**
 * Виноска про платформу: Postgres, таблиці, функції, крони, Storage.
 *
 * Через RPC, а не запитом із браузера: числа лежать у системних каталогах, до
 * яких у ролі `authenticated` доступу немає й бути не повинно. Гейт owner/CEO —
 * усередині самої функції.
 */
export function useStackPlatform() {
  return useQuery({
    queryKey: ["stack-platform"],
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<StackPlatform | null> => {
      const { data, error } = await supabase.schema("tosho").rpc("get_stack_platform");
      if (error) throw error;
      return (data as StackPlatform | null) ?? null;
    },
  });
}

/**
 * «Перевірити зараз» — та сама функція, що й у крона, лише покликана людиною.
 *
 * Токен передаємо явно: функція мусить упевнитись, що це власник або CEO,
 * інакше ендпоінт, який робить шість десятків вихідних запитів, був би
 * відкритою ручкою.
 */
export function useStackRecheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Сесія застаріла — перезайдіть у CRM.");

      const response = await fetch("/.netlify/functions/stack-versions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; checked?: number };
      if (!response.ok) throw new Error(payload.error || `Не вийшло перевірити (${response.status})`);
      return payload;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stack-versions"] });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { hasSiteListingAccess } from "@/lib/moduleAccess";
import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";

import { hasPendingDrafts, type SiteListingCandidate } from "./siteListingState";

/**
 * Запити черги «На сайт» (REQ-311#p4). RPC — у scripts/site-listing.sql, усі
 * під RLS людини. Через `supabase.schema("tosho")`, а не `db`: типи `db` —
 * перетин схем, і нові RPC він не бачить (див. пам'ятку в database.types.ts).
 */

export const siteListingKeys = {
  candidates: (slug: string) => ["site-listing", "candidates", slug] as const,
  siteCategories: ["site-listing", "site-categories"] as const,
  notifyIds: (teamId: string) => ["site-listing", "notify-ids", teamId] as const,
  audience: (userId: string) => ["site-listing", "audience", userId] as const,
};

const toNumber = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));
const toNullableNumber = (value: unknown): number | null =>
  value === null || value === undefined || value === "" ? null : Number(value);

export async function fetchSiteListingCandidates(slug: string): Promise<SiteListingCandidate[]> {
  const { data, error } = await supabase.schema("tosho").rpc("site_listing_candidates", { p_supplier: slug });
  if (error) throw error;
  // numeric із PostgREST може приїхати рядком — числа приводимо тут, один раз.
  return ((data ?? []) as unknown as SiteListingCandidate[]).map((row) => ({
    ...row,
    colors: toNumber(row.colors),
    priced_colors: toNumber(row.priced_colors),
    supplier_price_min: toNullableNumber(row.supplier_price_min),
    supplier_price_max: toNullableNumber(row.supplier_price_max),
    // `?? null`: до застосування SQL черга цих колонок не віддає зовсім.
    awaited_qty: toNullableNumber(row.awaited_qty ?? null),
    awaited_at: row.awaited_at ?? null,
  }));
}

/**
 * Поки хоч одна чернетка «готується», черга перепитує базу раз на 4 с: фонова
 * функція пише результат у рядок, а не віддає його нам.
 */
export function useSiteListingCandidates(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: siteListingKeys.candidates(slug),
    queryFn: () => fetchSiteListingCandidates(slug),
    enabled,
    staleTime: 30_000,
    refetchInterval: (query) => (hasPendingDrafts(query.state.data ?? [], Date.now()) ? 4_000 : false),
  });
}

export function useSiteCategories(enabled: boolean) {
  return useQuery({
    queryKey: siteListingKeys.siteCategories,
    queryFn: async () => {
      const { data, error } = await supabase.schema("tosho").rpc("site_listing_site_categories");
      if (error) throw error;
      return ((data ?? []) as Array<{ path: string }>).map((row) => row.path);
    },
    enabled,
    staleTime: 10 * 60_000,
  });
}

/**
 * Замовити чернетку у фонової функції. Відповідь не чекаємо й не читаємо:
 * результат функція кладе в рядок, а черга його перепитає. На проді фонова
 * функція й так відповідає 202 одразу, а в дев-сервері вона виконується
 * синхронно — і кнопка висіла б пів хвилини. Помилка мережі тут означає лише,
 * що рядок постоїть «готується» 10 хвилин і стане «не вдалося».
 */
export async function requestSiteListingDraft(itemId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Сесія застаріла — перезайдіть у CRM.");
  void fetch("/.netlify/functions/site-listing-draft-background", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ itemId }),
  }).catch(() => undefined);
}

/** «Беремо» / «Не беремо» / «Повернути в нові» (decision = null). */
export function useSiteListingDecide(slug: string, teamId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { candidate: SiteListingCandidate; decision: "take" | "skip" | null }) => {
      if (!teamId) throw new Error("Команду не визначено — перезайдіть у CRM.");
      const { data, error } = await supabase.schema("tosho").rpc("site_listing_decide", {
        p_team_id: teamId,
        p_supplier: slug,
        p_model_name: input.candidate.model_name,
        p_articles: input.candidate.articles,
        p_decision: input.decision,
      });
      if (error) throw error;
      const row = data as unknown as { id: string; draft_status: string } | null;
      if (row && input.decision === "take" && row.draft_status === "pending") {
        await requestSiteListingDraft(row.id);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: siteListingKeys.candidates(slug) }),
  });
}

/** «Спробувати ще»: знову «готується» — і знову до функції. */
export function useSiteListingRetryDraft(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("site_listing_items")
        .update({ draft_status: "pending", draft_error: null })
        .eq("id", itemId)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Рядок не оновився — можливо, немає доступу.");
      await requestSiteListingDraft(itemId);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: siteListingKeys.candidates(slug) }),
  });
}

/** Розділ, вибраний у CRM руками, і «Повернути в Беремо» з «У файлі». */
export function useSiteListingPatch(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { itemId: string; patch: { category_override?: string | null; batch_id?: null } }) => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("site_listing_items")
        .update(input.patch)
        .eq("id", input.itemId)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Рядок не оновився — можливо, немає доступу.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: siteListingKeys.candidates(slug) }),
  });
}

/**
 * Кому сповіщення про нові моделі (REQ-311#p18): збережений вибір команди.
 * null — вибору ще не робили, і тоді сповіщення йде лише власнику
 * (src/lib/siteListing/recipients.ts).
 */
export function useSiteListingNotifyIds(teamId: string | null) {
  return useQuery({
    queryKey: siteListingKeys.notifyIds(teamId ?? "none"),
    enabled: Boolean(teamId),
    staleTime: 60_000,
    queryFn: async (): Promise<string[] | null> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("site_listing_settings")
        .select("notify_user_ids")
        .eq("team_id", teamId as string)
        .maybeSingle();
      if (error) throw error;
      return data ? (data.notify_user_ids ?? []) : null;
    },
  });
}

/**
 * З кого вибирати: ті, хто бачить блок і досі працює — той самий круг, з яким
 * функція site-listing-reminders перетинає вибір. Довідник модульно
 * кешований, тож окремого запиту до бази тут зазвичай немає.
 */
export function useSiteListingAudience(userId: string | null) {
  return useQuery({
    queryKey: siteListingKeys.audience(userId ?? "none"),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const workspaceId = await resolveWorkspaceId(userId as string);
      if (!workspaceId) return [];
      const members = await listWorkspaceMembersForDisplay(workspaceId);
      return members.filter(
        (member) =>
          hasSiteListingAccess(member.accessRole, member.jobRole) &&
          member.employmentStatus !== "inactive" &&
          member.employmentStatus !== "rejected"
      );
    },
  });
}

const SAVE_NOTIFY_IDS = ["site-listing", "save-notify-ids"] as const;

/**
 * Зберегти вибір. Галочка відгукується одразу (оптимістично), а записи йдуть
 * по черзі (`scope`): два швидкі кліки не мають приїхати в базу навпаки й
 * лишити попередній стан. Перечитуємо лише після останнього запису — інакше
 * відповідь першого на мить повернула б галочку, яку вже зняли другим.
 */
export function useSiteListingSaveNotifyIds(teamId: string | null) {
  const queryClient = useQueryClient();
  const key = siteListingKeys.notifyIds(teamId ?? "none");
  return useMutation({
    mutationKey: SAVE_NOTIFY_IDS,
    scope: { id: "site-listing-notify-ids" },
    mutationFn: async (userIds: string[]) => {
      if (!teamId) throw new Error("Команду не визначено — перезайдіть у CRM.");
      const { data, error } = await supabase
        .schema("tosho")
        .from("site_listing_settings")
        .upsert({ team_id: teamId, notify_user_ids: userIds }, { onConflict: "team_id" })
        .select("team_id");
      if (error) throw error;
      if (!data?.length) throw new Error("Вибір не зберігся — можливо, немає доступу.");
    },
    onMutate: async (userIds) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<string[] | null>(key);
      queryClient.setQueryData(key, userIds);
      return { previous };
    },
    onError: (_error, _userIds, context) => {
      if (context) queryClient.setQueryData(key, context.previous ?? null);
    },
    onSettled: () =>
      queryClient.isMutating({ mutationKey: SAVE_NOTIFY_IDS }) === 1
        ? queryClient.invalidateQueries({ queryKey: key })
        : undefined,
  });
}

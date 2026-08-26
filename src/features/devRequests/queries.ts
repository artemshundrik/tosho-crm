import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";
import { isKnownModuleKey } from "@/lib/projectMap";
import { toAuditEntries, type AuditEntry } from "./history";
import type { ChecklistItem } from "./checklist";
import {
  toDevRequest,
  type DevRequest,
  type RequestKind,
  type RequestPriority,
  type RequestStatus,
  type RequestZone,
} from "./types";

const SELECT_COLUMNS =
  "id,number,team_id,title,body,kind,status,module_key,priority,zone,theme,checklist,released_at,auto_classified,is_private,author_user_id,tg_username,display_name,asked_by_count,commit_shas,created_at";

export const devRequestKeys = {
  /** teamId у ключі обов'язково — інакше кеш протікає між тенантами. */
  board: (teamId: string | null) => ["devRequests", teamId, "board"] as const,
  history: (id: string | null) => ["devRequests", id, "history"] as const,
  commitSummary: (shas: string[]) => ["devRequests", "commitSummary", shas.join(",")] as const,
};

/**
 * Дошка сама тримається свіжою — три різні шляхи, бо сценаріїв теж три.
 *
 * `refetchOnMount: "always"` — прихід на розділ. Глобальні дефолти в main.tsx
 * стоять на `false` зі staleTime 60 с, і без цього перемикання видів показувало
 * б кеш.
 *
 * `refetchOnWindowFocus` — ГОЛОВНИЙ шлях, і саме його бракувало. Картки сюди
 * прилітають ззовні: з Telegram-бота, з ендпоінта захоплення, від CEO з іншої
 * машини. Пішов у бот, надиктував задачу, повернувся у вкладку — вона вже тут.
 * Глобально ця опція вимкнена свідомо (важкі сторінки), тож вмикаємо точково.
 *
 * `refetchInterval` — для того, хто просто лишив дошку відкритою. Хвилина, і
 * лише коли вкладка видима: молотити у фоні означало б тримати з'єднання
 * заради екрана, на який ніхто не дивиться.
 *
 * Realtime тут навмисно НЕМАЄ. Він дав би секунди замість хвилини, але вимагає
 * додати таблицю в публікацію — а на дошці є приватні картки, і потік змін,
 * який обходить RLS, був би найгіршим зі способів їх показати. Двом людям
 * хвилини вистачає.
 */
export function useDevRequestBoard(teamId: string | null) {
  return useQuery({
    queryKey: devRequestKeys.board(teamId),
    enabled: Boolean(teamId),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<DevRequest[]> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("dev_requests")
        .select(SELECT_COLUMNS)
        .eq("team_id", teamId as string)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).map((row) => toDevRequest(row));
    },
  });
}

/**
 * Історія змін картки.
 *
 * Свого журналу в запитів немає — поля пише генеричний аудит-тригер
 * (tosho.audit_row_change у scripts/audit-log.sql), а читає їх RPC
 * tosho.get_audit_log. Вона SECURITY DEFINER і має власний гейт: workspace
 * owner/admin плюс окрема умова для приватних карток запитів. Тобто відмова
 * тут — нормальний, очікуваний стан, а не поломка: `retry: false`, і секція
 * в дровері просто не показується (див. DevRequestDetailsSheet).
 *
 * p_team_id передаємо разом із workspace: картки, заведені з Telegram і
 * Cowork, можуть не мати workspace_id, і без другого ключа їхня історія
 * лишилась би невидимою.
 */
export function useDevRequestHistory(request: DevRequest | null, userId: string | null) {
  const requestId = request?.id ?? null;
  const teamId = request?.teamId ?? null;

  return useQuery({
    queryKey: devRequestKeys.history(requestId),
    enabled: Boolean(requestId && userId),
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<AuditEntry[]> => {
      // workspace_id у контексті авторизації немає — резолвимо тим самим
      // кешованим помічником, що й при створенні картки.
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId) return [];
      const { data, error } = await supabase.schema("tosho").rpc("get_audit_log", {
        p_workspace_id: workspaceId,
        p_entity_type: "dev_request",
        p_entity_id: requestId as string,
        p_limit: 50,
        p_team_id: teamId ?? undefined,
      });
      if (error) throw error;
      const entries = toAuditEntries(data);

      // Ім'я того, хто змінив. RPC віддає лише user_id: колонка actor_name у
      // базі майже завжди порожня, її навмисно резолвлять на читанні. Довідник
      // модульно кешований (listWorkspaceMembersForDisplay), тож зайвого
      // запиту тут не виникає.
      if (!entries.some((entry) => entry.actorUserId && !entry.actorName)) return entries;
      const members = await listWorkspaceMembersForDisplay(workspaceId);
      const nameById = new Map(members.map((member) => [member.userId, member.label]));
      return entries.map((entry) =>
        entry.actorName || !entry.actorUserId
          ? entry
          : { ...entry, actorName: nameById.get(entry.actorUserId) ?? null }
      );
    },
  });
}

export type CreateDevRequestInput = {
  teamId: string;
  title: string;
  body: string;
  kind: RequestKind;
  /** Напрямок CRM: ключ модуля або null, якщо не визначили. */
  moduleKey: string | null;
  priority: RequestPriority | null;
  /** Що чіпає робота. null — ще не розбирали. */
  zone: RequestZone | null;
  /** Мітка-тема для групування карток однієї роботи. */
  theme: string | null;
  /** Напрямок і пріоритет так і лишились такими, як їх поставив розбір. */
  autoClassified: boolean;
  isPrivate: boolean;
  authorUserId: string;
};

export function useCreateDevRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDevRequestInput): Promise<DevRequest> => {
      // Номер видає той самий атомарний лічильник, що й рахунки: паралельні
      // виклики блокують рядок і отримують різні номери.
      //
      // p_period порожній навмисно: нумерація запитів наскрізна. Передати сюди
      // рік (як роблять рахунки) означало б, що 1 січня лічильник почне з 1 і
      // вставки почнуть падати на унікальному індексі по номеру.
      const { data: nextNumber, error: numberError } = await supabase
        .schema("tosho")
        .rpc("next_document_number", {
          p_team_id: input.teamId,
          p_kind: "dev_request",
          p_entity_key: "",
          p_period: "",
        });
      if (numberError) throw numberError;

      // workspace_id не в політиках — він потрібен лише щоб історія картки
      // читалась через tosho.get_audit_log(p_workspace_id). Резолвимо тут, бо
      // useAuth() його не віддає: у контексті є teamId, а це різні поняття.
      const workspaceId = await resolveWorkspaceId(input.authorUserId);

      const { data, error } = await supabase
        .schema("tosho")
        .from("dev_requests")
        .insert({
          number: nextNumber,
          team_id: input.teamId,
          workspace_id: workspaceId,
          title: input.title,
          body: input.body || null,
          kind: input.kind,
          status: "queued",
          // Констрейнта на module_key в базі немає навмисно (реєстр живе в
          // коді), тож останній рубіж перед записом — тут. Ключ, якого в
          // реєстрі немає, пишемо як «немає напрямку».
          module_key: isKnownModuleKey(input.moduleKey) ? input.moduleKey : null,
          priority: input.priority,
          zone: input.zone,
          theme: input.theme,
          auto_classified: input.autoClassified,
          is_private: input.isPrivate,
          author_user_id: input.authorUserId,
          created_by: input.authorUserId,
        })
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return toDevRequest(data);
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: devRequestKeys.board(created.teamId) });
    },
  });
}

export function useMoveDevRequest(teamId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RequestStatus }) => {
      // .select() обов'язковий: заблокований RLS-ом UPDATE не кидає помилки,
      // він просто чіпає 0 рядків — без цього «не зберіглось» виглядало б
      // як успіх.
      const { data, error } = await supabase
        .schema("tosho")
        .from("dev_requests")
        .update({ status })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Немає прав рухати цю картку");
    },
    /**
     * Картка переїжджає МИТТЄВО, ще до відповіді сервера.
     *
     * Раніше дошка чекала і запис, і повторний запит усього списку — тобто
     * після відпускання картка ще пів секунди стояла на старому місці й аж тоді
     * стрибала на нове. З перетягуванням, яке саме довозить картку до місця, це
     * особливо помітно: рух закінчився, а картка «не приклеїлась».
     *
     * `cancelQueries` перед правкою обов'язковий: запит, що вже летить, міг би
     * повернутись ПІСЛЯ нашої правки і мовчки затерти її старими даними.
     */
    onMutate: async ({ id, status }: { id: string; status: RequestStatus }) => {
      const key = devRequestKeys.board(teamId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DevRequest[]>(key);
      if (previous) {
        queryClient.setQueryData<DevRequest[]>(
          key,
          previous.map((request) => (request.id === id ? { ...request, status } : request))
        );
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      // Не вийшло — повертаємо дошку такою, якою вона була до перетягування.
      // Без цього картка лишилась би в колонці, куди її насправді не записали.
      if (context?.previous) {
        queryClient.setQueryData(devRequestKeys.board(teamId), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: devRequestKeys.board(teamId) });
    },
  });
}

/**
 * Пункти великої задачі — окрема мутація, а не частина правки картки.
 *
 * Відмічають їх на бігу, по одному, і гнати заради галочки повний UPDATE із
 * назвою, описом та класифікацією означало б щоразу ризикувати затерти те, що
 * поруч правив хтось інший. Тут пишеться рівно одна колонка.
 *
 * auto_classified НЕ гаситься навмисно: він про напрямок і пріоритет, а
 * відмічений пункт про них нічого не каже.
 */
export function useUpdateChecklist(teamId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, checklist }: { id: string; checklist: ChecklistItem[] }) => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("dev_requests")
        .update({ checklist })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      // Той самий привід, що й у переміщенні: 0 рядків від RLS приходить без
      // помилки, і без перевірки «зберегли» показало б успіх на нічому.
      if (!data) throw new Error("Немає прав змінювати цю картку");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: devRequestKeys.board(teamId) });
    },
  });
}

export type UpdateDevRequestInput = {
  id: string;
  title: string;
  body: string;
  kind: RequestKind;
  moduleKey: string | null;
  priority: RequestPriority | null;
  zone: RequestZone | null;
  theme: string | null;
  isPrivate: boolean;
};

/**
 * Правка картки руками.
 *
 * auto_classified тут завжди false, і це не побічний ефект, а суть: прапорець
 * означає «напрямок і пріоритет так і лишились такими, як їх поставив розбір».
 * Щойно людина відкрила вікно й зберегла — класифікацію підтверджено, навіть
 * якщо жодне поле не змінилось. Інакше статистика «наскільки розбору можна
 * довіряти» рахувала б переглянуті людиною картки як заслугу моделі.
 */
export function useUpdateDevRequest(teamId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateDevRequestInput) => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("dev_requests")
        .update({
          title: input.title,
          body: input.body || null,
          kind: input.kind,
          // Останній рубіж перед записом — той самий, що й на створенні:
          // констрейнта на module_key в базі немає, реєстр живе в коді.
          module_key: isKnownModuleKey(input.moduleKey) ? input.moduleKey : null,
          priority: input.priority,
          zone: input.zone,
          theme: input.theme,
          auto_classified: false,
          is_private: input.isPrivate,
        })
        .eq("id", input.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      // Той самий привід, що й у переміщенні: 0 рядків від RLS приходить без
      // помилки, тож без цієї перевірки «зберегли» показало б успіх на нічому.
      if (!data) throw new Error("Немає прав редагувати цю картку");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: devRequestKeys.board(teamId) });
    },
  });
}

/**
 * Видалення картки. Політику DELETE заведено окремо
 * (scripts/dev-requests-delete-policy.sql) — до неї видалення мовчки чіпало
 * 0 рядків навіть у власника.
 */
export function useDeleteDevRequest(teamId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("dev_requests")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Немає прав видалити цю картку");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: devRequestKeys.board(teamId) });
    },
  });
}

/**
 * Тема релізного коміта — готова відповідь на «що тепер працює».
 *
 * НАВІЩО. У картці лежить опис ПРОБЛЕМИ, і поле «Тепер» у вікні картки для
 * чату лишалось порожнім, поки хтось не перепише опис руками. А тема коміта за
 * домовленістю (CLAUDE.md) пишеться саме як результат з погляду людини —
 * «різні тиражі показуються окремими рядками» — тобто це той самий рядок.
 * Раніше туди підставляли НАЗВУ картки, і виходило «Було: X → Тепер: X»;
 * тема коміта, на відміну від назви, у найгіршому разі неповна, але ніколи не
 * описує проблему замість результату.
 *
 * Беремо НАЙСВІЖІШИЙ коміт: у картки їх буває до дюжини, і останній описує
 * стан, який поїхав у прод.
 *
 * Звіряємо початком рядка: гак кладе в картку 7 символів sha, а `commits`
 * зберігає 8. Фільтр збираємо лише з шістнадцяткових — чужого в `or()` не
 * буде за побудовою.
 */
export function useReleaseCommitSummary(shas: string[], enabled: boolean) {
  const clean = shas.filter((sha) => /^[0-9a-f]{6,40}$/i.test(sha));
  return useQuery({
    queryKey: devRequestKeys.commitSummary(clean),
    enabled: enabled && clean.length > 0,
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("commits")
        .select("sha,subject,committed_at")
        .or(clean.map((sha) => `sha.like.${sha}*`).join(","))
        .order("committed_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0]?.subject ?? "").trim() || null;
    },
  });
}

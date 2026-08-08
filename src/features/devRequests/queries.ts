import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { resolveWorkspaceId } from "@/lib/workspace";
import { isKnownModuleKey } from "@/lib/projectMap";
import {
  toDevRequest,
  type DevRequest,
  type RequestKind,
  type RequestPriority,
  type RequestStatus,
} from "./types";

const SELECT_COLUMNS =
  "id,number,team_id,title,body,kind,status,module_key,priority,auto_classified,is_private,author_user_id,tg_username,display_name,asked_by_count,created_at";

export const devRequestKeys = {
  /** teamId у ключі обов'язково — інакше кеш протікає між тенантами. */
  board: (teamId: string | null) => ["devRequests", teamId, "board"] as const,
};

/**
 * refetchOnMount: "always" — дошку рухають кілька людей і мутації розкидані,
 * тож staleTime тут дав би стару картину після повернення на вкладку.
 */
export function useDevRequestBoard(teamId: string | null) {
  return useQuery({
    queryKey: devRequestKeys.board(teamId),
    enabled: Boolean(teamId),
    refetchOnMount: "always",
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

export type CreateDevRequestInput = {
  teamId: string;
  title: string;
  body: string;
  kind: RequestKind;
  /** Напрямок CRM: ключ модуля або null, якщо не визначили. */
  moduleKey: string | null;
  priority: RequestPriority | null;
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: devRequestKeys.board(teamId) });
    },
  });
}

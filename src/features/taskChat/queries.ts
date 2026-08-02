import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { quoteRefFromThreadKey, type ThreadAttachment, type ThreadEntry } from "@/lib/taskThread";
import { fetchThreadEvents } from "./threadEvents";

const MESSAGE_COLUMNS =
  "id,body,created_at,created_by,kind,visibility,source,is_pinned,thread_meta";

type MessageRow = {
  id: string;
  body: string;
  created_at: string;
  created_by: string | null;
  kind: string;
  visibility: string;
  source: string;
  is_pinned: boolean;
  thread_meta: { attachments?: ThreadAttachment[] } | null;
};

const toEntry = (row: MessageRow): ThreadEntry => ({
  id: row.id,
  kind: row.kind === "event" ? "event" : "message",
  body: row.body ?? "",
  createdAt: row.created_at,
  createdBy: row.created_by,
  visibility: row.visibility === "finance" ? "finance" : "team",
  source: row.source === "telegram" ? "telegram" : "crm",
  eventType: null,
  isPinned: row.is_pinned,
  attachments: row.thread_meta?.attachments ?? undefined,
});

export const threadKeys = {
  entries: (threadKey: string) => ["taskThread", "entries", threadKey] as const,
  read: (threadKey: string) => ["taskThread", "read", threadKey] as const,
  unread: (teamId: string) => ["taskThread", "unread", teamId] as const,
};

async function fetchMessages(threadKey: string): Promise<ThreadEntry[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("quote_comments")
    .select(MESSAGE_COLUMNS)
    .eq("thread_key", threadKey)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data as MessageRow[] | null) ?? []).map(toEntry);
}

/**
 * Стрічка = повідомлення (tosho.quote_comments) + події (public.activity_log).
 * Два джерела зливаються тут; сортує їх buildThreadBlocks.
 */
export function useThreadEntries(threadKey: string | null, teamId: string | null) {
  return useQuery({
    queryKey: threadKeys.entries(threadKey ?? "none"),
    enabled: Boolean(threadKey),
    refetchOnMount: "always",
    queryFn: async (): Promise<ThreadEntry[]> => {
      const key = threadKey!;
      const quoteRef = quoteRefFromThreadKey(key);
      const [messages, events] = await Promise.all([
        fetchMessages(key),
        quoteRef && teamId ? fetchThreadEvents(quoteRef, teamId) : Promise.resolve([]),
      ]);
      return [...messages, ...events];
    },
  });
}

export function useThreadRead(threadKey: string | null, userId: string | null) {
  return useQuery({
    queryKey: threadKeys.read(threadKey ?? "none"),
    enabled: Boolean(threadKey && userId),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("thread_reads")
        .select("last_read_at")
        .eq("thread_key", threadKey!)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data?.last_read_at ?? null;
    },
  });
}

export type SendMessageInput = {
  body: string;
  teamId: string;
  quoteId: string | null;
  userId: string;
  visibility: "team" | "finance";
  attachments?: ThreadAttachment[];
};

export function useSendThreadMessage(threadKey: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendMessageInput) => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("quote_comments")
        .insert({
          team_id: input.teamId,
          quote_id: input.quoteId,
          thread_key: threadKey!,
          body: input.body,
          created_by: input.userId,
          kind: "message",
          visibility: input.visibility,
          source: "crm",
          thread_meta: input.attachments?.length ? { attachments: input.attachments } : {},
        })
        .select(MESSAGE_COLUMNS)
        .single();
      if (error) throw error;
      return toEntry(data as MessageRow);
    },

    // Оптимістично: баббл з'являється миттєво блідим.
    onMutate: async (input) => {
      if (!threadKey) return { previous: undefined };
      await client.cancelQueries({ queryKey: threadKeys.entries(threadKey) });
      const previous = client.getQueryData<ThreadEntry[]>(threadKeys.entries(threadKey));
      const optimistic: ThreadEntry = {
        id: `optimistic-${previous?.length ?? 0}-${input.body.length}`,
        kind: "message",
        body: input.body,
        createdAt: new Date().toISOString(),
        createdBy: input.userId,
        visibility: input.visibility,
        source: "crm",
        eventType: null,
        isPinned: false,
        attachments: input.attachments,
        pending: true,
      };
      client.setQueryData<ThreadEntry[]>(threadKeys.entries(threadKey), [
        optimistic,
        ...(previous ?? []),
      ]);
      return { previous };
    },

    // Помилка не ковтає текст: повертаємо стрічку, а панель покаже «Повторити».
    onError: (_error, _input, context) => {
      if (threadKey && context?.previous) {
        client.setQueryData(threadKeys.entries(threadKey), context.previous);
      }
    },

    onSuccess: () => {
      if (threadKey) void client.invalidateQueries({ queryKey: threadKeys.entries(threadKey) });
    },
  });
}

export function useMarkThreadRead(threadKey: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!threadKey) return;
      const { error } = await supabase
        .schema("tosho")
        .from("thread_reads")
        .upsert(
          { user_id: userId, thread_key: threadKey, last_read_at: new Date().toISOString() },
          { onConflict: "user_id,thread_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      if (threadKey) void client.invalidateQueries({ queryKey: threadKeys.read(threadKey) });
    },
  });
}

/** Закріпити ТЗ угорі стрічки; попереднє закріплення знімаємо. */
export function usePinThreadMessage(threadKey: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entryId: string; pinned: boolean }) => {
      if (!threadKey) return;
      if (input.pinned) {
        const { error: clearError } = await supabase
          .schema("tosho")
          .from("quote_comments")
          .update({ is_pinned: false })
          .eq("thread_key", threadKey)
          .eq("is_pinned", true);
        if (clearError) throw clearError;
      }
      const { error } = await supabase
        .schema("tosho")
        .from("quote_comments")
        .update({ is_pinned: input.pinned })
        .eq("id", input.entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (threadKey) void client.invalidateQueries({ queryKey: threadKeys.entries(threadKey) });
    },
  });
}

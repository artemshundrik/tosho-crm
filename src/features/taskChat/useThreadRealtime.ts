import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { threadKeys } from "./queries";

/**
 * Живі повідомлення нитки.
 *
 * ГОЧА: працює лише тому, що tosho.quote_comments додано в публікацію
 * supabase_realtime (scripts/task-chat-schema.sql, розділ 4). До того публікація
 * на проді була ПОРОЖНЯ, і будь-яка підписка postgres_changes мовчала без
 * жодної помилки. Якщо повідомлення не прилітають — перевіряй публікацію, а не код.
 */
export function useThreadRealtime(threadKey: string | null, disabled = false) {
  const client = useQueryClient();

  React.useEffect(() => {
    if (!threadKey || disabled) return;

    const channel = supabase
      .channel(`thread:${threadKey}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "tosho",
          table: "quote_comments",
          filter: `thread_key=eq.${threadKey}`,
        },
        () => {
          void client.invalidateQueries({ queryKey: threadKeys.entries(threadKey) });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, disabled, threadKey]);
}

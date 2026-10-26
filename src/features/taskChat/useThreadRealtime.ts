import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { threadKeys } from "./queries";

/**
 * Живі повідомлення нитки.
 *
 * Сигнал іде через Broadcast із бази (scripts/realtime-broadcast-signals.sql):
 * тригер на tosho.quote_comments шле порожнє «changed» у приватний канал
 * `tosho:<team_id>:thread:<thread_key>`, а ми перечитуємо нитку звичайним
 * запитом. Раніше тут був postgres_changes — він змушував Realtime двічі на
 * секунду декодувати весь журнал змін бази (REQ-337).
 *
 * Канал приватний: слухати його пускає лише політика на realtime.messages для
 * членів команди з теми. Якщо сигнали не приходять — перевіряй тригер і
 * політику, а не код.
 */
export function useThreadRealtime(threadKey: string | null, teamId: string | null, disabled = false) {
  const client = useQueryClient();

  React.useEffect(() => {
    if (!threadKey || !teamId || disabled) return;

    const channel = supabase
      .channel(`tosho:${teamId}:thread:${threadKey}`, { config: { private: true } })
      .on("broadcast", { event: "changed" }, () => {
        void client.invalidateQueries({ queryKey: threadKeys.entries(threadKey) });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, disabled, teamId, threadKey]);
}

import React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabaseClient";

import { requestKeys } from "./queries";

/**
 * Живе оновлення: тригер на заявках і повідомленнях шле порожнє «changed» у
 * приватний канал команди, а ми перечитуємо звичайним запитом. Сигнал не несе
 * даних, тож чужі заявки ним не витечуть (REQ-337).
 */
export function useRequestsRealtime(teamId: string | null) {
  const client = useQueryClient();

  React.useEffect(() => {
    if (!teamId) return;
    const channel = supabase
      .channel(`tosho:${teamId}:instagram-requests`, { config: { private: true } })
      .on("broadcast", { event: "changed" }, () => {
        void client.invalidateQueries({ queryKey: requestKeys.all });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, teamId]);
}

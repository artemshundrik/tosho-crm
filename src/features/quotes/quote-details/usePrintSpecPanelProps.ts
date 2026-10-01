import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabaseClient";

/** Примітка автоповернення: її видно в історії статусів. */
const RETURN_NOTE = "Змінено параметри виробу після ціни";

/**
 * Усе, чого панелі «Параметри виробу» бракує від сторінки прорахунку: статус,
 * дата останнього «Пораховано» і реакція на збереження (REQ-323).
 *
 * `lastPricedAt` — окремий малий запит, а не `history` сторінки: та вантажиться
 * лише на вкладці обговорення, а параметри стоять на головній. Перечитується
 * при кожній зміні статусу, щоб позначки зникали одразу після перерахунку.
 *
 * Автоповернення: правка параметрів у «Пораховано» / «На погодженні» повертає
 * прорахунок у «На прорахунку». `approved` не чіпаємо — рішення про нього за людиною.
 */
export function usePrintSpecPanelProps({
  quoteId,
  status,
  reloadItems,
  changeStatus,
}: {
  quoteId: string;
  status: string;
  reloadItems: () => Promise<void>;
  changeStatus: (status: string, note: string) => Promise<void>;
}) {
  const [lastPricedAt, setLastPricedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!quoteId) return;
    let cancelled = false;
    void supabase
      .schema("tosho")
      .from("quote_status_history")
      .select("created_at")
      .eq("quote_id", quoteId)
      .eq("to_status", "estimated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setLastPricedAt(data?.created_at ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [quoteId, status]);

  const onSaved = useCallback(
    (result: { changedAfterPrice: boolean }) => {
      void reloadItems();
      if (result.changedAfterPrice) void changeStatus("estimating", RETURN_NOTE);
    },
    [reloadItems, changeStatus]
  );

  return { quoteStatus: status, lastPricedAt, onSaved };
}

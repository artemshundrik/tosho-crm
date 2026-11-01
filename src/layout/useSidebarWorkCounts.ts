import { useEffect, useState } from "react";

import { useMyTurnCount } from "@/features/myTurn/myTurnCount";
import { supabase } from "@/lib/supabaseClient";

import { ROUTES } from "./routes";

/**
 * Числа в меню — лише там, де число означає роботу (хвиля В3, картка 346):
 * «Вхідні», «Мій хід», активні прорахунки, незавершені замовлення й дизайн у
 * роботі. Решта пунктів без чисел — щоб ці щось важили.
 *
 * Тут лише лічба (head + count), без рядків; «Мій хід» рахує його сторінка.
 * Оновлюємо при вході й раз на 5 хвилин — це орієнтир, а не живий лічильник.
 */
const ACTIVE_QUOTE_STATUSES = ["estimating", "estimated", "awaiting_approval"] as const;
// Без «на перевірці» й «у клієнта»: там сотні старих задач, що чекають не
// дизайнера, і число в 300+ нічого б не казало про роботу.
const OPEN_DESIGN_STATUSES = ["new", "changes", "in_progress"];
const REFRESH_MS = 5 * 60 * 1000;

type WorkCounts = { quotes: number | null; orders: number | null; design: number | null };

async function loadWorkCounts(teamId: string): Promise<WorkCounts> {
  const [quotes, orders, design] = await Promise.all([
    supabase.schema("tosho").from("quotes").select("id", { count: "exact", head: true }).eq("team_id", teamId).in("status", ACTIVE_QUOTE_STATUSES),
    supabase
      .schema("tosho")
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .not("order_status", "in", "(completed,cancelled)"),
    supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("action", "design_task")
      .in("metadata->>status", OPEN_DESIGN_STATUSES),
  ]);
  return {
    quotes: quotes.error ? null : quotes.count,
    orders: orders.error ? null : orders.count,
    design: design.error ? null : design.count,
  };
}

export function useSidebarWorkCounts(teamId: string | null, inboxCount: number): Record<string, number> {
  const myTurn = useMyTurnCount();
  const [work, setWork] = useState<WorkCounts>({ quotes: null, orders: null, design: null });

  useEffect(() => {
    if (!teamId) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadWorkCounts(teamId).then((next) => active && setWork(next));
    };
    refresh();
    const id = window.setInterval(refresh, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [teamId]);

  const counts: Record<string, number> = { [ROUTES.notifications]: inboxCount };
  if (myTurn !== null) counts[ROUTES.myTurn] = myTurn;
  if (work.quotes !== null) counts[ROUTES.ordersEstimates] = work.quotes;
  if (work.orders !== null) counts[ROUTES.ordersProduction] = work.orders;
  if (work.design !== null) counts[ROUTES.design] = work.design;
  return counts;
}

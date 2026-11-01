import { useEffect, useRef } from "react";

import { fetchInboxOpenCount } from "@/features/inbox/inboxThreads";

export { fetchInboxOpenCount };

/**
 * Число «Вхідних» у меню слідом за сповіщеннями. Realtime приносить лише рядок
 * (нове, прочитане, закрите тригером), а число — це справи, тож будь-яка зміна
 * списку перераховує його заново. Пачкою: автозакриття гасить кілька рядків
 * одним записом, а прочитане з тосту доходить у базу трохи пізніше за стан.
 */
export function useInboxCountRefresh(userId: string | null | undefined, notifications: unknown, onCount: (count: number) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void fetchInboxOpenCount(userId).then((count) => {
        if (count !== null) onCount(count);
      });
    }, 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notifications, onCount, userId]);
}

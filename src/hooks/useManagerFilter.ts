import { useCallback, useEffect, useState } from "react";

import { hasOwnManagedWork } from "@/lib/managedWorkOwnership";
import { isQuoteManagerJobRole } from "@/lib/permissions";

export const ALL_MANAGERS = "__all__";

/**
 * Фільтр «Менеджер» на прорахунках і дизайні: що стоїть одразу й що
 * запам'ятовується.
 *
 * Перший вхід — за власністю, не за посадою:
 *   • дизайнер → всі (він фільтрує за дизайнером, не за менеджером);
 *   • менеджер з продажу → себе одразу;
 *   • решта, зокрема власник і СЕО → всі, а «себе», якщо в людини є хоч один
 *     свій прорахунок чи дизайн (`hasOwnManagedWork`, обидві сутності разом).
 *
 * Далі вибір людини пам'ятається (REQ-175#p130). До того СЕО, який наглядає
 * за всіма, отримував «себе» на кожному вході з бокового меню й щоразу
 * перемикав на «всі»: сторінка відновлювала фільтри лише кнопкою «Назад».
 * Пам'ять — у браузері, окремо для сторінки, команди й людини.
 */
const storageKey = (page: string, teamId: string, userId: string) => `tosho:manager-filter:${page}:${teamId}:${userId}`;

function readChoice(page: string, teamId?: string | null, userId?: string | null) {
  if (!teamId || !userId) return null;
  try {
    return localStorage.getItem(storageKey(page, teamId, userId));
  } catch {
    return null;
  }
}

export function useManagerFilter({
  page,
  teamId,
  userId,
  selfId = userId,
  jobRole,
  isDesigner,
  restored,
}: {
  page: "quotes" | "design";
  teamId?: string | null;
  /** Чий вибір пам'ятаємо — людина, що увійшла. */
  userId?: string | null;
  /** Кого ставити «себе» (у режимі «Переглянути як» — того, кого приміряють). */
  selfId?: string | null;
  jobRole?: string | null;
  isDesigner: boolean;
  /** Фільтр, відновлений кнопкою «Назад», — він важливіший за все. */
  restored?: string;
}) {
  const [remembered] = useState(() => readChoice(page, teamId, userId));
  const managerByRole = isQuoteManagerJobRole(jobRole);
  const [value, setValue] = useState<string>(
    () => restored ?? remembered ?? (managerByRole && userId ? userId : ALL_MANAGERS)
  );
  const [defaultApplied, setDefaultApplied] = useState(
    () => (restored ?? ALL_MANAGERS) !== ALL_MANAGERS || remembered !== null || managerByRole
  );

  useEffect(() => {
    if (defaultApplied) return;
    if (isDesigner) return;
    if (value !== ALL_MANAGERS) return;
    if (!selfId || !teamId) return;
    // Позначка наперед, щоб проба пішла рівно раз. Користувач міг з'явитись
    // пізніше за перший рендер — тоді пам'ять читаємо тут.
    setDefaultApplied(true);
    const late = readChoice(page, teamId, userId);
    if (late !== null) {
      setValue(late);
      return;
    }
    let cancelled = false;
    void (async () => {
      const ownsWork = await hasOwnManagedWork({ userId: selfId, teamId });
      if (!cancelled && ownsWork) setValue(selfId);
    })();
    return () => {
      cancelled = true;
    };
  }, [defaultApplied, isDesigner, page, selfId, teamId, userId, value]);

  /** Вибір людини — його й пам'ятаємо; автоматичне значення вище — ні. */
  const choose = useCallback(
    (next: string) => {
      setValue(next);
      setDefaultApplied(true);
      if (!teamId || !userId) return;
      try {
        localStorage.setItem(storageKey(page, teamId, userId), next);
      } catch {
        // Приватне вікно чи заблоковане сховище — просто не пам'ятаємо.
      }
    },
    [page, teamId, userId]
  );

  return [value, choose] as const;
}

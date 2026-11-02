import { useEffect, useState } from "react";

import { hasOwnManagedWork } from "@/lib/managedWorkOwnership";
import { isQuoteManagerJobRole } from "@/lib/permissions";

export const ALL_MANAGERS = "__all__";

/**
 * Фільтр «Менеджер» у списках: що стоїть одразу.
 *
 * Без відновленого вибору — за власністю, не за посадою:
 *   • дизайнер → всі (він фільтрує за дизайнером, не за менеджером);
 *   • менеджер з продажу → себе одразу;
 *   • решта, зокрема власник і СЕО → себе, якщо в людини є хоч один свій
 *     прорахунок чи дизайн (`hasOwnManagedWork`), інакше всі — порожній список
 *     «своїх» нічого не показує.
 *
 * Вибір людини живе до перезавантаження вкладки: його відновлює сторінка разом
 * з рештою фільтрів (`shouldRestorePageUiState`) і передає сюди як `restored`.
 * 01.11 вибір пам'ятався в браузері назавжди; Артем попросив, щоб після
 * перезавантаження знову стояло «себе» (REQ-173#p19).
 */
export function useManagerFilter({
  teamId,
  userId,
  selfId = userId,
  jobRole,
  isDesigner,
  restored,
}: {
  teamId?: string | null;
  userId?: string | null;
  /** Кого ставити «себе» (у режимі «Переглянути як» — того, кого приміряють). */
  selfId?: string | null;
  jobRole?: string | null;
  isDesigner: boolean;
  /** Вибір, відновлений у межах сесії, — він важливіший за дефолт, зокрема «всі». */
  restored?: string;
}) {
  const managerByRole = isQuoteManagerJobRole(jobRole);
  const [value, setValue] = useState<string>(
    () => restored ?? (managerByRole && selfId ? selfId : ALL_MANAGERS)
  );
  const [defaultApplied, setDefaultApplied] = useState(
    () => restored !== undefined || (managerByRole && Boolean(selfId))
  );

  useEffect(() => {
    if (defaultApplied) return;
    if (isDesigner) return;
    if (value !== ALL_MANAGERS) return;
    if (!selfId || !teamId) return;
    // Позначка наперед, щоб проба пішла рівно раз. Посада могла з'явитись
    // пізніше за перший рендер — тоді менеджера ставимо тут.
    setDefaultApplied(true);
    if (managerByRole) {
      setValue(selfId);
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
  }, [defaultApplied, isDesigner, managerByRole, selfId, teamId, value]);

  const choose = (next: string) => {
    setValue(next);
    setDefaultApplied(true);
  };

  return [value, choose] as const;
}

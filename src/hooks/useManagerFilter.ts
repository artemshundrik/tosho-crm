import { useEffect, useRef, useState } from "react";

import { hasOwnManagedWork } from "@/lib/managedWorkOwnership";
import { readFilterChoice, writeFilterChoice } from "@/lib/pageUiState";
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
 * Вибір людини живе до перезавантаження вкладки. Пам'ятається лише клік
 * людини (`writeFilterChoice`), а не те, що сторінка зберегла сама: інакше
 * автоматичне «всі» до приходу відповіді з бази ставало «вибором».
 * 01.11 вибір пам'ятався в браузері назавжди; Артем попросив, щоб після
 * перезавантаження знову стояло «себе» (REQ-173#p19).
 */
export function useManagerFilter({
  page,
  teamId,
  userId,
  selfId = userId,
  jobRole,
  isDesigner,
}: {
  page: "quotes" | "design";
  teamId?: string | null;
  userId?: string | null;
  /** Кого ставити «себе» (у режимі «Переглянути як» — того, кого приміряють). */
  selfId?: string | null;
  jobRole?: string | null;
  isDesigner: boolean;
}) {
  const managerByRole = isQuoteManagerJobRole(jobRole);
  const scope = `manager:${page}:${teamId ?? ""}:${userId ?? ""}`;
  const [restored] = useState(() => (teamId && userId ? readFilterChoice(scope) : undefined));
  const [value, setValue] = useState<string>(
    () => restored ?? (managerByRole && selfId ? selfId : ALL_MANAGERS)
  );
  // Ref, а не стан: позначка-стан перезапускала ефект, і його прибирання
  // скасовувало пробу, що ще летіла, — «себе» не ставало ніколи (02.11).
  const defaultAppliedRef = useRef(restored !== undefined || (managerByRole && Boolean(selfId)));

  useEffect(() => {
    if (defaultAppliedRef.current) return;
    if (isDesigner) return;
    if (!selfId || !teamId || !userId) return;
    defaultAppliedRef.current = true;
    // Команда могла з'явитись пізніше за перший рендер — тоді вибір читаємо тут.
    const late = readFilterChoice(scope);
    if (late !== undefined) {
      setValue(late);
      return;
    }
    if (managerByRole) {
      setValue(selfId);
      return;
    }
    void hasOwnManagedWork({ userId: selfId, teamId }).then((ownsWork) => {
      // Людина встигла вибрати сама — її вибір важливіший за пробу.
      if (ownsWork) setValue((current) => (current === ALL_MANAGERS && readFilterChoice(scope) === undefined ? selfId : current));
    });
  }, [isDesigner, managerByRole, scope, selfId, teamId, userId]);

  const choose = (next: string) => {
    setValue(next);
    defaultAppliedRef.current = true;
    if (teamId && userId) writeFilterChoice(scope, next);
  };

  return [value, choose] as const;
}

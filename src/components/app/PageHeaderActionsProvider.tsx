import * as React from "react";

import {
  PageHeaderActionsPresenceContext,
  PageHeaderActionsSetterContext,
  PageHeaderActionsValueContext,
  type PageHeaderActionsState,
} from "@/components/app/pageHeaderActionsContext";

/**
 * Провайдер живе в окремому файлі від гака свідомо (REQ-135).
 *
 * Гак імпортують 15 сторінок, зокрема найважчі — «Прорахунки» й «Дизайн». Поки
 * провайдер і гак лежали в одному модулі, будь-яка правка в цьому файлі на
 * дев-сервері інвалідувала весь той список, і перехід на важку сторінку після
 * правки супроводжувався паузою на перезбирання. Тепер модулі окремі: правка
 * провайдера не тягне за собою сторінки, правка гака — оболонку.
 */
export function PageHeaderActionsProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = React.useState<PageHeaderActionsState | null>(null);

  /**
   * Присутність — з примітивів, тож об'єкт зберігає тотожність, доки міняється
   * лише вузол. Саме на цьому тримається вся правка: оболонка підписана сюди й
   * не перемальовується від того, що сторінка віддала нові кнопки.
   *
   * ЧОМУ САМЕ `Boolean(node)`, А НЕ «сторінка зареєструвалась». Сторінка має
   * право віддати порожні дії — `usePageHeaderActions(canEdit ? <Кнопки/> : null)`.
   * Доти оболонка бачила сам вузол, і порожній вузол означав «дій немає»: смуга
   * лишалась у стані очікування й за 6 секунд знімалась. Якби присутність
   * рахувалась за фактом реєстрації, така сторінка отримала б смугу з вічним
   * каркасом. Тож рахуємо рівно те, що рахувалось раніше.
   */
  const hasActions = Boolean(actions?.node);
  const surfaceId = actions?.surfaceId ?? null;
  const presence = React.useMemo(() => ({ hasActions, surfaceId }), [hasActions, surfaceId]);

  return (
    <PageHeaderActionsSetterContext.Provider value={setActions}>
      <PageHeaderActionsPresenceContext.Provider value={presence}>
        <PageHeaderActionsValueContext.Provider value={actions}>
          {children}
        </PageHeaderActionsValueContext.Provider>
      </PageHeaderActionsPresenceContext.Provider>
    </PageHeaderActionsSetterContext.Provider>
  );
}

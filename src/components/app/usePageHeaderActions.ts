import * as React from "react";
import { useLocation } from "react-router-dom";

import { PageHeaderActionsSetterContext } from "@/components/app/pageHeaderActionsContext";
import { resolvePageSurface } from "@/layout/pageSurfaces";

/**
 * Віддати вузол дій у шапку сторінки.
 *
 * ЧОМУ ПРИБИРАННЯ ТІЛЬКИ ПРИ ДЕМОНТАЖІ. Доти ефект на кожну зміну залежностей
 * спершу гасив дії (`setActions(null)` у прибиранні), а потім ставив нові. Це
 * ДВА оновлення стану провайдера там, де досить одного, і кожне з них тягло за
 * собою рендер. Гасити дії треба лише тоді, коли сторінка справді йде зі сцени,
 * — а це демонтаж, і для нього є окремий ефект без залежностей.
 *
 * ЧОМУ СЕТТЕР ЧИТАЄТЬСЯ ЧЕРЕЗ РЕФ. Історична причина, яка лишається чинною:
 * колись провайдер віддавав новий об'єкт на кожен свій рендер, і виходило коло
 * `setActions` → рендер провайдера → новий контекст → ефект знову. Сторінці, яка
 * забула `useMemo` на своєму вузлі (це були «Замовлення»), діставався
 * нескінченний цикл із «Maximum update depth exceeded» по 9 разів на відкриття.
 * Тепер кола немає й за побудовою: контекст сеттера незмінний.
 *
 * ЧОМУ ПОРУЧ ЇДЕ ПОВЕРХНЯ (REQ-19). Дії знімає прибирання ефекту, а воно
 * виконується вже ПІСЛЯ того, як новий маршрут відрендерився, — тож існує кадр,
 * у якому шлях уже новий, а в контексті ще висять кнопки попередньої сторінки.
 * Хто читає дії, той звіряє поверхню й чужого тулбара не показує.
 */
export function usePageHeaderActions(actions: React.ReactNode, deps: React.DependencyList = []) {
  const setActions = React.useContext(PageHeaderActionsSetterContext);
  const location = useLocation();
  const setActionsRef = React.useRef(setActions);
  setActionsRef.current = setActions;
  const surfaceIdRef = React.useRef<string | null>(null);
  surfaceIdRef.current = resolvePageSurface(location.pathname)?.id ?? null;

  React.useEffect(() => {
    setActionsRef.current?.({ node: actions, surfaceId: surfaceIdRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  React.useEffect(
    () => () => {
      setActionsRef.current?.(null);
    },
    []
  );
}

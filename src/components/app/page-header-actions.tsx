import * as React from "react";
import { useLocation } from "react-router-dom";

import { resolvePageSurface } from "@/layout/pageSurfaces";

/** Дії разом із поверхнею, якій вони належать. */
export type PageHeaderActionsState = {
  node: React.ReactNode;
  surfaceId: string | null;
};

type PageHeaderActionsSetter = React.Dispatch<React.SetStateAction<PageHeaderActionsState | null>>;

/**
 * ДВА КОНТЕКСТИ, А НЕ ОДИН — І ЦЕ НЕ ПРИКРАСА.
 *
 * Доти значення й сеттер їхали одним об'єктом `{ actions, setActions }`. Об'єкт
 * створювався новим на кожен рендер провайдера, тобто на кожну зміну дій, — і
 * перемальовувались УСІ, хто підписаний на контекст. А підписані на нього не
 * лише шапка: `usePageHeaderActions` теж читає контекст, тож кожна сторінка,
 * яка віддає туди свої кнопки, підписана на власні ж оновлення.
 *
 * Заміряно на дошці дизайну 24.08.2026: серія з 14 літер у пошуку давала ~55
 * рендерів сторінки, тобто ЧОТИРИ на літеру замість очікуваних двох (одне на
 * введене значення, друге на відкладене через useDeferredValue).
 *
 * Тепер сеттер живе в окремому контексті. Він приходить із useState і стабільний
 * назавжди, тож його контекст не міняється НІКОЛИ — і сторінки більше не
 * перемальовуються від того, що самі ж оновили шапку. Значення читає лише
 * AppLayout.
 */
const PageHeaderActionsValueContext = React.createContext<PageHeaderActionsState | null>(null);
const PageHeaderActionsSetterContext = React.createContext<PageHeaderActionsSetter | null>(null);

export function PageHeaderActionsProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = React.useState<PageHeaderActionsState | null>(null);

  return (
    <PageHeaderActionsSetterContext.Provider value={setActions}>
      <PageHeaderActionsValueContext.Provider value={actions}>
        {children}
      </PageHeaderActionsValueContext.Provider>
    </PageHeaderActionsSetterContext.Provider>
  );
}

/**
 * Віддати вузол дій у шапку сторінки.
 *
 * ЧОМУ ПРИБИРАННЯ ТІЛЬКИ ПРИ ДЕМОНТАЖІ. Доти ефект на кожну зміну залежностей
 * спершу гасив дії (`setActions(null)` у прибиранні), а потім ставив нові. Це
 * ДВА оновлення стану провайдера там, де досить одного, і кожне з них тягло за
 * собою рендер. Гасити дії треба лише тоді, коли сторінка справді йде зі сцени,
 * — а це демонтаж, і для нього є окремий ефект без залежностей.
 *
 * ЧОМУ `ctx` НЕ В ЗАЛЕЖНОСТЯХ. Історична причина, яка лишається чинною: раніше
 * провайдер віддавав новий об'єкт на кожен свій рендер, і виходило коло
 * `setActions` → рендер провайдера → новий контекст → ефект знову. Сторінці, яка
 * забула `useMemo` на своєму вузлі (це були «Замовлення»), діставався
 * нескінченний цикл із «Maximum update depth exceeded» по 9 разів на відкриття.
 * Тепер кола немає й за побудовою: контекст сеттера незмінний.
 *
 * ЧОМУ ПОРУЧ ЇДЕ ПОВЕРХНЯ (REQ-19). Дії знімає прибирання ефекту, а воно
 * виконується вже ПІСЛЯ того, як адреса змінилась і новий маршрут відрендерився.
 * Тобто існує кадр, у якому шлях уже новий, а в контексті ще висять кнопки
 * попередньої сторінки. Макет мусить уміти це розпізнати — інакше смуга дій на
 * мить показує чужий тулбар чужої висоти, і виходить рівно той стрибок, від
 * якого ми позбуваємось. Порівняння йде за id поверхні, а не за шляхом: у межах
 * однієї поверхні адреса міняється (інший `:id`), а сторінка лишається та сама.
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

export function usePageHeaderActionsValue() {
  return React.useContext(PageHeaderActionsValueContext);
}

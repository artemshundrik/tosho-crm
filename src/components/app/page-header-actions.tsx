import * as React from "react";
import { useLocation } from "react-router-dom";

import { resolvePageSurface } from "@/layout/pageSurfaces";

/** Дії разом із поверхнею, якій вони належать. */
export type PageHeaderActionsState = {
  node: React.ReactNode;
  surfaceId: string | null;
};

type PageHeaderActionsContextValue = {
  actions: PageHeaderActionsState | null;
  setActions: React.Dispatch<React.SetStateAction<PageHeaderActionsState | null>>;
};

const PageHeaderActionsContext = React.createContext<PageHeaderActionsContextValue | null>(null);

export function PageHeaderActionsProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = React.useState<PageHeaderActionsState | null>(null);

  return (
    <PageHeaderActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </PageHeaderActionsContext.Provider>
  );
}

/**
 * Віддати вузол дій у шапку сторінки.
 *
 * ЧОМУ `ctx` БІЛЬШЕ НЕ В ЗАЛЕЖНОСТЯХ. Провайдер створює `{ actions, setActions }`
 * новим об'єктом на кожен свій рендер, а рендериться він саме тоді, коли
 * `setActions` міняє його стан. Виходило коло: `setActions` → провайдер
 * перерендерився → новий `ctx` → ефект спрацював знову → `setActions`. Коло
 * розривалось лише випадково — тим, що більшість сторінок мемоїзує свій вузол,
 * і React глушив однаковий стан через Object.is. Сторінці, яка забула `useMemo`
 * (а це були «Замовлення»), діставався нескінченний цикл із «Maximum update
 * depth exceeded» — по 9 разів на кожне відкриття.
 *
 * Сеттер із `useState` стабільний сам по собі, тож тримати його в залежностях
 * не було потреби взагалі. Ref потрібен лише щоб ефект бачив свіжий контекст,
 * не перезапускаючись через його ідентичність.
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
  const ctx = React.useContext(PageHeaderActionsContext);
  const location = useLocation();
  const setActionsRef = React.useRef(ctx?.setActions);
  setActionsRef.current = ctx?.setActions;
  const surfaceIdRef = React.useRef<string | null>(null);
  surfaceIdRef.current = resolvePageSurface(location.pathname)?.id ?? null;

  React.useEffect(() => {
    const setActions = setActionsRef.current;
    if (!setActions) return;
    setActions({ node: actions, surfaceId: surfaceIdRef.current });
    return () => setActions(null);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function usePageHeaderActionsValue() {
  const ctx = React.useContext(PageHeaderActionsContext);
  return ctx?.actions ?? null;
}

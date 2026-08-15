import * as React from "react";

type PageHeaderActionsContextValue = {
  actions: React.ReactNode;
  setActions: React.Dispatch<React.SetStateAction<React.ReactNode>>;
};

const PageHeaderActionsContext = React.createContext<PageHeaderActionsContextValue | null>(null);

export function PageHeaderActionsProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = React.useState<React.ReactNode>(null);

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
 */
export function usePageHeaderActions(actions: React.ReactNode, deps: React.DependencyList = []) {
  const ctx = React.useContext(PageHeaderActionsContext);
  const setActionsRef = React.useRef(ctx?.setActions);
  setActionsRef.current = ctx?.setActions;

  React.useEffect(() => {
    const setActions = setActionsRef.current;
    if (!setActions) return;
    setActions(actions);
    return () => setActions(null);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function usePageHeaderActionsValue() {
  const ctx = React.useContext(PageHeaderActionsContext);
  return ctx?.actions ?? null;
}

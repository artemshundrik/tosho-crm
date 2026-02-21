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

export function usePageHeaderActions(actions: React.ReactNode, deps: React.DependencyList = []) {
  const ctx = React.useContext(PageHeaderActionsContext);

  React.useEffect(() => {
    if (!ctx) return;
    ctx.setActions(actions);
    return () => ctx.setActions(null);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, actions, ...deps]);
}

export function usePageHeaderActionsValue() {
  const ctx = React.useContext(PageHeaderActionsContext);
  return ctx?.actions ?? null;
}

import * as React from "react";

// Кнопки дій живуть у шапці сторінки, поруч із заголовком «Фінанси», а не всередині
// розділу — так вони не з'їдають окремий рядок над списком. Але сама дія належить
// розділу («Додати витрату» ≠ «Додати податок»), тож розділ публікує свій вузол сюди,
// а сторінка його рендерить. Неактивні TabsContent розмонтовані, тому конфлікту нема.

type ActionsSetter = (node: React.ReactNode) => void;

const FinanceToolbarContext = React.createContext<ActionsSetter | null>(null);

export function FinanceToolbarProvider({
  onActionsChange,
  children,
}: {
  onActionsChange: ActionsSetter;
  children: React.ReactNode;
}) {
  return (
    <FinanceToolbarContext.Provider value={onActionsChange}>{children}</FinanceToolbarContext.Provider>
  );
}

/** Публікує дії розділу в шапку сторінки. `deps` — як у useEffect. */
export function useFinanceToolbarActions(render: () => React.ReactNode, deps: React.DependencyList) {
  const setActions = React.useContext(FinanceToolbarContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- вузол перебудовується рівно за deps розділу
  const node = React.useMemo(render, deps);

  React.useEffect(() => {
    if (!setActions) return;
    setActions(node);
    return () => setActions(null);
  }, [setActions, node]);
}

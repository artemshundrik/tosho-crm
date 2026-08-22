import * as React from "react";
import { EmptyStateCard } from "tosho-crm";
import { Cell } from "./_shared";

export function Basic() {
  return (
    <Cell>
      <EmptyStateCard
        badgeLabel="Нічого не знайшли"
        title="Прорахунків немає"
        description="За обраним фільтром нічого не знайшлось. Скинь фільтри або створи новий прорахунок."
        actionLabel="Скинути фільтри"
        onAction={() => {}}
      />
    </Cell>
  );
}

export function Compact() {
  return (
    <Cell>
      <EmptyStateCard compact badgeLabel="Порожньо" title="Позицій ще немає"
        description="Додай перший товар, щоб порахувати вартість." actionLabel="Додати товар" onAction={() => {}} />
    </Cell>
  );
}

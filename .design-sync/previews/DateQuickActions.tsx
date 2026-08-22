import * as React from "react";
import { DateQuickActions } from "tosho-crm";
import { Cell } from "./_shared";
export function Basic() {
  return (
    <Cell>
      <div className="max-w-sm rounded-xl border border-border/50 bg-popover p-2 shadow-menu">
        <DateQuickActions onSelect={() => {}} />
      </div>
      <p className="mt-3 text-3xs text-muted-foreground">Стоїть під календарем у панелі вибору — «Сьогодні», «Завтра», «+3 дні», «Тиждень», «Місяць», «Очистити».</p>
    </Cell>
  );
}

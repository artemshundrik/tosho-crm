import * as React from "react";
import { Checkbox } from "tosho-crm";
import { Cell } from "./_shared";

export function States() {
  return (
    <Cell>
      <div className="grid gap-2.5">
        <label className="flex w-fit cursor-pointer items-center gap-2.5">
          <Checkbox defaultChecked /><span className="text-sm">Увімкнений</span>
        </label>
        <label className="flex w-fit cursor-pointer items-center gap-2.5">
          <Checkbox /><span className="text-sm">Вимкнений</span>
        </label>
        <label className="flex w-fit items-center gap-2.5">
          <Checkbox checked disabled /><span className="text-sm text-muted-foreground">Заблокований, увімкнений</span>
        </label>
      </div>
    </Cell>
  );
}

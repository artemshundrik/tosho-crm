import * as React from "react";
import { Switch } from "tosho-crm";
import { Cell } from "./_shared";

export function Tones() {
  return (
    <Cell>
      <div className="grid gap-3">
        <div className="flex items-center gap-3">
          <Switch checked onCheckedChange={() => {}} label="Сповіщення" />
          <span className="text-sm">Увімкнено (primary)</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked onCheckedChange={() => {}} label="З дому" tone="success" />
          <span className="text-sm">Увімкнено (success)</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={false} onCheckedChange={() => {}} label="Вимкнено" />
          <span className="text-sm">Вимкнено</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={false} onCheckedChange={() => {}} label="Малий" size="sm" disabled />
          <span className="text-sm text-muted-foreground">Малий, заблокований</span>
        </div>
      </div>
    </Cell>
  );
}

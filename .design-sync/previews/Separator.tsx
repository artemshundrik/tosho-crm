import * as React from "react";
import { Separator } from "tosho-crm";
import { Cell } from "./_shared";

export function Horizontal() {
  return (
    <Cell>
      <div className="max-w-sm text-sm">
        <p className="pb-3">Умови оплати</p>
        <Separator />
        <p className="pt-3 text-muted-foreground">Передоплата 50%, решта перед відвантаженням.</p>
      </div>
    </Cell>
  );
}

export function Vertical() {
  return (
    <Cell>
      <div className="flex h-8 items-center gap-3 text-sm">
        <span>12 позицій</span>
        <Separator orientation="vertical" />
        <span>13 тиражів</span>
        <Separator orientation="vertical" />
        <span className="tabular-nums">48 200,00 ₴</span>
      </div>
    </Cell>
  );
}

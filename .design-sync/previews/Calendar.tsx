import * as React from "react";
import { Calendar } from "tosho-crm";
import { Cell } from "./_shared";
export function Basic() {
  return (
    <Cell>
      <div className="w-fit rounded-xl border border-border/50 bg-popover p-2 shadow-menu">
        <Calendar mode="single" selected={new Date(2026, 7, 25)} defaultMonth={new Date(2026, 7, 1)} />
      </div>
    </Cell>
  );
}

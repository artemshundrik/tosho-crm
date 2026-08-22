import * as React from "react";
import { Skeleton } from "tosho-crm";
import { Cell } from "./_shared";

export function Card() {
  return (
    <Cell>
      <div className="max-w-sm rounded-xl border border-border/50 bg-card p-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-28" />
      </div>
    </Cell>
  );
}

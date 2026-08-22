import * as React from "react";
import { SegmentedGroup, Button } from "tosho-crm";
import { Cell } from "./_shared";

const GROUP = "inline-flex p-1 h-11 items-center rounded-xl border border-border/50 bg-muted/40";
const TRIGGER = "flex-1 inline-flex items-center justify-center font-medium transition-all duration-200 ease-out text-muted-foreground hover:text-foreground hover:bg-background/50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:ring-1 data-[state=on]:ring-[hsl(var(--soft-ring))] gap-2 h-9 rounded-lg px-4 text-sm";

export function Basic() {
  const [v, setV] = React.useState("board");
  return (
    <Cell>
      <SegmentedGroup className={GROUP}>
        {(["list", "board", "calendar"] as const).map((k) => (
          <Button key={k} variant="segmented" size="xs" aria-pressed={v === k}
            data-state={v === k ? "on" : "off"} onClick={() => setV(k)} className={TRIGGER}>
            {k === "list" ? "Список" : k === "board" ? "Дошка" : "Календар"}
          </Button>
        ))}
      </SegmentedGroup>
    </Cell>
  );
}

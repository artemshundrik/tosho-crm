import * as React from "react";
import { Calendar, DateQuickActions, Separator } from "tosho-crm";

/**
 * Календар показано так, як він з'являється в застосунку: усередині панелі
 * вибору, з швидкими діями під ним. Голий <Calendar /> у великій картці
 * виглядає загубленим — він за побудовою вузький (~250px).
 */
export function Panel() {
  const [selected, setSelected] = React.useState<Date | undefined>(new Date(2026, 7, 25));
  return (
    <div className="flex justify-center p-5">
      <div className="w-fit rounded-xl border border-border/50 bg-popover p-2 shadow-menu">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={setSelected}
          defaultMonth={new Date(2026, 7, 1)}
          weekStartsOn={1}
        />
        <Separator className="my-2" />
        <DateQuickActions onSelect={() => {}} />
      </div>
    </div>
  );
}

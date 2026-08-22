import * as React from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "tosho-crm";
import { FileText, Users, Palette } from "lucide-react";
import { Cell } from "./_shared";

export function Palette_() {
  return (
    <Cell>
      <div className="max-w-md overflow-hidden rounded-xl border border-border/50 bg-popover shadow-menu">
        <Command>
          <CommandInput placeholder="Шукати прорахунок, замовника, задачу…" />
          <CommandList>
            <CommandEmpty>Нічого не знайшли</CommandEmpty>
            <CommandGroup heading="Перейти">
              <CommandItem><FileText />Прорахунки<CommandShortcut>⌘1</CommandShortcut></CommandItem>
              <CommandItem><Users />Замовники<CommandShortcut>⌘2</CommandShortcut></CommandItem>
              <CommandItem><Palette />Дизайн<CommandShortcut>⌘3</CommandShortcut></CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Дії">
              <CommandItem>Новий прорахунок</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </Cell>
  );
}

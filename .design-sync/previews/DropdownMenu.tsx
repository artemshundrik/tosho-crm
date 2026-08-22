import * as React from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuItemDestructive, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Button } from "tosho-crm";
import { ChevronDown, Copy, ExternalLink, Trash2 } from "lucide-react";

export function Opened() {
  return (
    <div className="p-4 pb-64">
      <DropdownMenu open>
        <DropdownMenuTrigger asChild><Button variant="secondary">Дії<ChevronDown /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>TS-0826-0009</DropdownMenuLabel>
          <DropdownMenuItem><ExternalLink />Відкрити прорахунок</DropdownMenuItem>
          <DropdownMenuItem><Copy />Дублювати</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItemDestructive><Trash2 />Видалити</DropdownMenuItemDestructive>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

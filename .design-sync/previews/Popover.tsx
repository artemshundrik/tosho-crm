import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger, Button, Input, Badge } from "tosho-crm";
import { Filter } from "lucide-react";

export function Opened() {
  return (
    <div className="p-4 pb-72">
      <Popover open>
        <PopoverTrigger asChild><Button variant="secondary"><Filter />Фільтри</Button></PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-3">
          <p className="text-xs font-semibold">Період</p>
          <Input controlSize="md" defaultValue="01.08.2026 — 22.08.2026" />
          <p className="pt-1 text-xs font-semibold">Статус</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="info">На прорахунку</Badge><Badge tone="success">Погоджено</Badge>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

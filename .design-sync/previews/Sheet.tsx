import * as React from "react";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle, Badge } from "tosho-crm";

export function Opened() {
  return (
    <div className="min-h-[520px] p-4">
      <Sheet open modal={false}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>TS-0826-0009</SheetTitle>
            <SheetDescription>ТОВ «Приклад» · 12 позицій · 13 тиражів</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className="grid gap-3 text-sm">
              <div className="flex gap-2"><Badge tone="success">Погоджено</Badge><Badge tone="neutral">Мерч</Badge></div>
              <p className="text-muted-foreground">Тут живе те, що відкривається збоку й не потребує всієї сторінки.</p>
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}

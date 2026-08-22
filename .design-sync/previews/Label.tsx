import * as React from "react";
import { Label, Input } from "tosho-crm";
import { Stack } from "./_shared";

export function Basic() {
  return (
    <Stack>
      <div className="grid gap-2">
        <Label htmlFor="demo-name">Назва замовника</Label>
        <Input id="demo-name" placeholder="ТОВ «Приклад»" />
      </div>
      <p className="text-3xs text-muted-foreground">
        Зазвичай підпис ставить <code>FormField</code> — окремо Label потрібен рідко.
      </p>
    </Stack>
  );
}

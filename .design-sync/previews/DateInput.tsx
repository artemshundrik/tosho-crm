import * as React from "react";
import { DateInput, DateTimeInput, TimeInput } from "tosho-crm";
import { Stack } from "./_shared";

export function Date_() {
  return (
    <Stack>
      <DateInput defaultValue="2026-08-25" />
      <DateInput />
      <DateInput defaultValue="2026-08-25" disabled />
      <p className="text-3xs text-muted-foreground">Системну іконку календаря глобально сховано — тому беруть DateInput, а не голий input[type=date].</p>
    </Stack>
  );
}

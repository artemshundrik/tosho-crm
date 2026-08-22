import * as React from "react";
import { Textarea, AutoTextarea } from "tosho-crm";
import { Stack } from "./_shared";

export function Fixed() {
  return (
    <Stack>
      <Textarea rows={3} defaultValue="Друк логотипу на грудях, 1 колір. Розміри S–XXL." />
      <Textarea rows={2} placeholder="Порожнє поле" />
      <Textarea rows={2} defaultValue="Заблоковане" disabled />
    </Stack>
  );
}

export function Growing() {
  return (
    <Stack>
      <AutoTextarea defaultValue="Росте під вміст — друкуй, і поле саме додасть рядки." />
      <p className="text-3xs text-muted-foreground">AutoTextarea замість фіксованих rows там, де довжина непередбачувана: ТЗ, коментар, правка.</p>
    </Stack>
  );
}

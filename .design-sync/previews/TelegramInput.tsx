import * as React from "react";
import { TelegramInput } from "tosho-crm";
import { Stack } from "./_shared";

export function Basic() {
  return (
    <Stack>
      <TelegramInput value="@tosho_crm" onChange={() => {}} />
      <TelegramInput value="" onChange={() => {}} placeholder="@нік" />
      <p className="text-3xs text-muted-foreground">Собачку нормалізує саме: хоч із «@», хоч без, хоч посиланням.</p>
    </Stack>
  );
}

import * as React from "react";
import { DigitsInput } from "tosho-crm";
import { Stack } from "./_shared";

export function Basic() {
  return (
    <Stack>
      <DigitsInput value="12345678" onChange={() => {}} maxLength={8} placeholder="ЄДРПОУ, 8 цифр" />
      <DigitsInput value="1234567890" onChange={() => {}} maxLength={10} groupSize={2} placeholder="ІПН" />
      <p className="text-3xs text-muted-foreground">Пропускає лише цифри й ріже за maxLength; groupSize розбиває на групи для читабельності.</p>
    </Stack>
  );
}

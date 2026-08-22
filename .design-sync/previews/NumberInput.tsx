import * as React from "react";
import { NumberInput } from "tosho-crm";
import { Stack } from "./_shared";

export function Basic() {
  return (
    <Stack>
      <NumberInput value={250} onValueChange={() => {}} />
      <NumberInput value={48200} onValueChange={() => {}} />
      <NumberInput value={null} onValueChange={() => {}} placeholder="Кількість" />
    </Stack>
  );
}

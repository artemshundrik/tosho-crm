import * as React from "react";
import { TimeInput } from "tosho-crm";
import { Stack } from "./_shared";
export function Basic() {
  return (
    <Stack>
      <TimeInput defaultValue="14:30" />
      <TimeInput />
    </Stack>
  );
}

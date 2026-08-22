import * as React from "react";
import { DateTimeInput } from "tosho-crm";
import { Stack } from "./_shared";
export function Basic() {
  return (
    <Stack>
      <DateTimeInput defaultValue="2026-08-25T14:30" />
      <DateTimeInput />
    </Stack>
  );
}

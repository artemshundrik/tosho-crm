import * as React from "react";
import { EmailInput } from "tosho-crm";
import { Stack } from "./_shared";

export function Basic() {
  return (
    <Stack>
      <EmailInput value="info@example.com" onChange={() => {}} />
      <EmailInput value="" onChange={() => {}} placeholder="pochta@example.com" />
      <EmailInput value="не пошта" onChange={() => {}} aria-invalid />
    </Stack>
  );
}

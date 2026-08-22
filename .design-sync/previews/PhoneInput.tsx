import * as React from "react";
import { PhoneInput } from "tosho-crm";
import { Stack } from "./_shared";

export function Basic() {
  const [v, setV] = React.useState("+380 67 123 45 67");
  return (
    <Stack>
      <PhoneInput value={v} onChange={setV} />
      <PhoneInput value="" onChange={() => {}} placeholder="+380 __ ___ __ __" />
      <p className="text-3xs text-muted-foreground">Маска українського номера накладається на введення; onChange віддає вже відформатований рядок.</p>
    </Stack>
  );
}

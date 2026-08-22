import * as React from "react";
import { PhoneListInput } from "tosho-crm";
import { Stack } from "./_shared";

export function Basic() {
  const [v, setV] = React.useState(["+380 67 123 45 67", "+380 50 987 65 43"]);
  return (
    <Stack>
      <PhoneListInput value={v} onValueChange={setV} />
      <p className="text-3xs text-muted-foreground">
        Кілька номерів одного контакту. Значення — <b>масив рядків</b>, не рядок через кому (на відміну від TagsInput).
      </p>
    </Stack>
  );
}

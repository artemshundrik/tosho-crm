import * as React from "react";
import { PasswordInput } from "tosho-crm";
import { Stack } from "./_shared";

export function Basic() {
  return (
    <Stack>
      <PasswordInput defaultValue="дуже-таємно" />
      <PasswordInput placeholder="Пароль" />
      <p className="text-3xs text-muted-foreground">Праворуч кнопка «показати» — тому голий Input із type=password не використовуємо.</p>
    </Stack>
  );
}

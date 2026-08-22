import * as React from "react";
import { Input, FormField, Textarea } from "tosho-crm";
import { Stack } from "./_shared";

export function Sizes() {
  return (
    <Stack>
      <Input controlSize="lg" defaultValue="Велике поле (lg, типове)" />
      <Input controlSize="md" defaultValue="Середнє поле (md)" />
      <Input controlSize="sm" defaultValue="Мале поле (sm)" />
    </Stack>
  );
}

export function States() {
  return (
    <Stack>
      <Input placeholder="Порожнє — назва замовника" />
      <Input defaultValue="ТОВ «Приклад»" />
      <Input defaultValue="Недоступно" disabled />
      <Input defaultValue="" placeholder="—" aria-invalid />
    </Stack>
  );
}

export function InForm() {
  return (
    <Stack>
      <FormField label="Назва замовника" required error="Заповніть назву замовника">
        <Input placeholder="ТОВ «Приклад»" />
      </FormField>
      <FormField label="Коментар" hint="Що важливо знати дизайнеру">
        <Textarea rows={3} defaultValue="Друк логотипу на грудях, 1 колір." />
      </FormField>
    </Stack>
  );
}

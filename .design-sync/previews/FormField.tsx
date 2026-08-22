import * as React from "react";
import { FormField, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "tosho-crm";
import { Stack } from "./_shared";

export function WithError() {
  return (
    <Stack>
      <FormField label="Назва замовника" required error="Заповніть назву замовника">
        <Input placeholder="ТОВ «Приклад»" />
      </FormField>
    </Stack>
  );
}

export function WithHint() {
  return (
    <Stack>
      <FormField label="Внутрішній дедлайн" hint="Показується лише команді, не замовнику">
        <Input defaultValue="25.08.2026" />
      </FormField>
    </Stack>
  );
}

export function RenderProp() {
  return (
    <Stack>
      <FormField label="Напрямок" hint="Radix-контроли беруть fieldProps через функцію">
        {({ fieldProps }) => (
          <Select>
            <SelectTrigger id={fieldProps.id} className="h-9">
              <SelectValue placeholder="Оберіть напрямок" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="merch">Мерч</SelectItem>
              <SelectItem value="print">Поліграфія</SelectItem>
            </SelectContent>
          </Select>
        )}
      </FormField>
    </Stack>
  );
}

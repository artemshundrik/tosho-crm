import * as React from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "tosho-crm";
import { Stack } from "./_shared";

export function Sizes() {
  return (
    <Stack>
      <Select><SelectTrigger size="lg"><SelectValue placeholder="Великий (lg)" /></SelectTrigger>
        <SelectContent><SelectItem value="a">Мерч</SelectItem></SelectContent></Select>
      <Select><SelectTrigger size="md"><SelectValue placeholder="Середній (md)" /></SelectTrigger>
        <SelectContent><SelectItem value="a">Мерч</SelectItem></SelectContent></Select>
      <Select><SelectTrigger size="sm"><SelectValue placeholder="Малий (sm)" /></SelectTrigger>
        <SelectContent><SelectItem value="a">Мерч</SelectItem></SelectContent></Select>
    </Stack>
  );
}

export function Opened() {
  return (
    <div className="p-4 pb-56">
      <Select open>
        <SelectTrigger className="w-56"><SelectValue placeholder="Оберіть напрямок" /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Виробництво</SelectLabel>
            <SelectItem value="merch">Мерч</SelectItem>
            <SelectItem value="print">Поліграфія</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectItem value="other">Інше</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

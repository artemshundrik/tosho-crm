import * as React from "react";
import { PrefixField } from "tosho-crm";
import { Stack } from "./_shared";

export function Basic() {
  return (
    <Stack>
      <PrefixField prefix="https://"><input className="h-full w-full min-w-0 bg-transparent px-2.5 text-sm outline-none" defaultValue="tosho.pro" /></PrefixField>
      <PrefixField prefix="₴"><input className="h-full w-full min-w-0 bg-transparent px-2.5 text-sm outline-none tabular-nums" defaultValue="48 200,00" /></PrefixField>
      <PrefixField prefix="@" invalid><input className="h-full w-full min-w-0 bg-transparent px-2.5 text-sm outline-none" defaultValue="" /></PrefixField>
    </Stack>
  );
}

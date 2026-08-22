import * as React from "react";
import { ToggleGroup, ToggleGroupItem } from "tosho-crm";
import { Cell } from "./_shared";

export function Single() {
  return (
    <Cell>
      <ToggleGroup type="single" defaultValue="board">
        <ToggleGroupItem value="list">Список</ToggleGroupItem>
        <ToggleGroupItem value="board">Дошка</ToggleGroupItem>
        <ToggleGroupItem value="calendar">Календар</ToggleGroupItem>
      </ToggleGroup>
    </Cell>
  );
}

export function Multiple() {
  return (
    <Cell>
      <ToggleGroup type="multiple" defaultValue={["urgent"]}>
        <ToggleGroupItem value="mine">Мої</ToggleGroupItem>
        <ToggleGroupItem value="urgent">Термінові</ToggleGroupItem>
        <ToggleGroupItem value="noowner">Без виконавця</ToggleGroupItem>
      </ToggleGroup>
    </Cell>
  );
}

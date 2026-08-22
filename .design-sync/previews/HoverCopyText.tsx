import * as React from "react";
import { HoverCopyText } from "tosho-crm";
import { Cell } from "./_shared";

export function Basic() {
  return (
    <Cell>
      <p className="text-sm text-muted-foreground">
        Наведи на номер — з'явиться кнопка копіювання:{" "}
        <HoverCopyText value="TS-0826-0009" textClassName="font-mono font-medium text-foreground"
          successMessage="Номер скопійовано" copyLabel="Скопіювати номер">TS-0826-0009</HoverCopyText>
      </p>
    </Cell>
  );
}

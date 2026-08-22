import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "tosho-crm";
import { AlertTriangle } from "lucide-react";
import { Cell } from "./_shared";

export function Basic() {
  return (
    <Cell>
      <Alert className="max-w-md">
        <AlertTriangle className="size-4" />
        <AlertTitle>Що блокує переведення в замовлення</AlertTitle>
        <AlertDescription>Не заповнені email і мобільний номер підписанта.</AlertDescription>
      </Alert>
    </Cell>
  );
}

import * as React from "react";
import { HoverTip, Button, Badge } from "tosho-crm";
import { Info } from "lucide-react";
import { Row } from "./_shared";

export function Triggers() {
  return (
    <Row>
      <HoverTip label="Замовник: ТОВ «Приклад», менеджер Іван С.">
        <Button variant="ghost" size="sm"><Info />Наведи на мене</Button>
      </HoverTip>
      <HoverTip label="Термін здачі 25 серпня, лишилось 3 дні" side="bottom">
        <Badge tone="warning">25 серп.</Badge>
      </HoverTip>
      <HoverTip label="Номер прорахунку в системі" side="right">
        <span className="font-mono text-xs text-muted-foreground underline decoration-dotted">TS-0826-0009</span>
      </HoverTip>
    </Row>
  );
}

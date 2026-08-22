import * as React from "react";
import { Badge } from "tosho-crm";
import { Row } from "./_shared";

export function Tones() {
  return (
    <Row>
      <Badge tone="neutral">Новий</Badge>
      <Badge tone="info">На прорахунку</Badge>
      <Badge tone="accent">Пораховано</Badge>
      <Badge tone="warning">Погодження</Badge>
      <Badge tone="success">Погоджено</Badge>
      <Badge tone="danger">Скасовано</Badge>
      <Badge tone="festive">День народження</Badge>
    </Row>
  );
}

export function Sizes() {
  return (
    <Row>
      <Badge tone="info" size="sm">Малий — списки й канбан</Badge>
      <Badge tone="info" size="md">Середній — тулбари</Badge>
      <Badge tone="success" size="md" pill>Капсом</Badge>
    </Row>
  );
}

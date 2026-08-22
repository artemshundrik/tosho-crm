import * as React from "react";
import { Chip } from "tosho-crm";
import { Layers, Tag, Filter } from "lucide-react";
import { Row } from "./_shared";

export function States() {
  return (
    <Row>
      <Chip icon={<Layers />}>Прорахунки</Chip>
      <Chip icon={<Tag />} active>Активний</Chip>
      <Chip icon={<Filter />} size="sm">Малий</Chip>
      <Chip size="sm" active>Малий активний</Chip>
    </Row>
  );
}

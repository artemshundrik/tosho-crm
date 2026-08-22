import * as React from "react";
import { Button } from "tosho-crm";
import { Plus, Download, Trash2, Check, ArrowRight, MoreHorizontal, Search, X } from "lucide-react";

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2 p-4">{children}</div>
);

export function Variants() {
  return (
    <Row>
      <Button variant="primary">Основна</Button>
      <Button variant="secondary">Другорядна</Button>
      <Button variant="outline">Контурна</Button>
      <Button variant="ghost">Тиха</Button>
      <Button variant="destructive">Видалити</Button>
      <Button variant="destructiveSolid">Незворотне</Button>
      <Button variant="successTonal">Сплачено</Button>
      <Button variant="link">Перейти</Button>
    </Row>
  );
}

export function WithIcons() {
  return (
    <Row>
      <Button variant="primary"><Plus />Новий прорахунок</Button>
      <Button variant="secondary"><Download />Завантажити КП</Button>
      <Button variant="ghost">Відкрити<ArrowRight /></Button>
      <Button variant="destructive"><Trash2 />Видалити</Button>
      <Button variant="successTonal"><Check />Готово</Button>
    </Row>
  );
}

export function IconOnly() {
  return (
    <Row>
      <Button variant="secondary" size="iconSm" aria-label="Ще"><MoreHorizontal /></Button>
      <Button variant="secondary" size="iconMd" aria-label="Ще"><MoreHorizontal /></Button>
      <Button variant="control" size="iconMd" aria-label="Пошук"><Search /></Button>
      <Button variant="control" size="iconMd" aria-label="Очистити"><X /></Button>
      <Button variant="primary" size="iconMd" aria-label="Додати"><Plus /></Button>
    </Row>
  );
}

export function Sizes() {
  return (
    <Row>
      <Button size="xxs"><Plus />xxs</Button>
      <Button size="xs"><Plus />xs</Button>
      <Button size="sm"><Plus />sm</Button>
      <Button size="md"><Plus />md</Button>
      <Button size="lg"><Plus />lg</Button>
    </Row>
  );
}

export function States() {
  return (
    <Row>
      <Button>Звичайна</Button>
      <Button disabled>Заблокована</Button>
      <Button variant="secondary" disabled>Заблокована</Button>
      <Button loading><Download />Завантаження</Button>
    </Row>
  );
}

export function FilterChips() {
  return (
    <Row>
      <Button variant="chip" size="xs">Усі</Button>
      <Button variant="chip" size="xs" aria-pressed>Мої</Button>
      <Button variant="chip" size="xs">Термінові</Button>
    </Row>
  );
}

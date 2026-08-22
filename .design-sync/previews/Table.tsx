import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Button, Skeleton } from "tosho-crm";
import { MoreHorizontal } from "lucide-react";
import { Cell } from "./_shared";

const ROWS = [
  ["TS-0826-0009", "ТОВ «Приклад»", "success", "Погоджено", "48 200,00"],
  ["TS-0826-0011", "ФОП Коваленко", "info", "На прорахунку", "12 450,00"],
  ["TS-0826-0014", "ТОВ «Друга»", "warning", "Погодження", "7 900,00"],
  ["TS-0826-0015", "ПП «Третя»", "danger", "Скасовано", "0,00"],
] as const;

export function Rows() {
  return (
    <Cell>
      <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Номер</TableHead><TableHead>Замовник</TableHead>
              <TableHead>Статус</TableHead><TableHead className="text-right">Сума, ₴</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map(([n, c, tone, label, sum]) => (
              <TableRow key={n}>
                <TableCell className="font-medium tabular-nums">{n}</TableCell>
                <TableCell>{c}</TableCell>
                <TableCell><Badge tone={tone as "success"}>{label}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{sum}</TableCell>
                <TableCell><Button variant="control" size="iconSm" aria-label="Дії"><MoreHorizontal /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Cell>
  );
}

export function Loading() {
  return (
    <Cell>
      <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Номер</TableHead><TableHead>Замовник</TableHead><TableHead className="text-right">Сума</TableHead></TableRow></TableHeader>
          <TableBody>
            {[0, 1, 2].map((i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-4 w-16" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Cell>
  );
}

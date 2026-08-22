import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { QUOTE_STATUS_TONE, type Tone } from "@/lib/statusTones";
import { MoreHorizontal } from "lucide-react";
import { Shell, Section, Caption } from "../shell";

const ROWS = [
  ["TS-0826-0009", "ТОВ «Приклад»", "approved", "Погоджено", "48 200,00"],
  ["TS-0826-0011", "ФОП Коваленко", "estimating", "На прорахунку", "12 450,00"],
  ["TS-0826-0014", "ТОВ «Друга»", "awaiting_approval", "Погодження", "7 900,00"],
  ["TS-0826-0015", "ПП «Третя»", "cancelled", "Скасовано", "0,00"],
] as const;

export default function TableCard() {
  const [loading, setLoading] = React.useState(false);
  const [empty, setEmpty] = React.useState(false);

  return (
    <Shell
      title="Таблиця й стани списку"
      lede={
        <>
          Справжні <code>ui/table.tsx</code>, <code>Skeleton</code> і <code>EmptyStateCard</code>. Числа — <code>tabular-nums</code> і праворуч: сума не стрибає при перерахунку.
        </>
      }
    >
      <Section title="Рядки" hint="натисни, щоб побачити каркас завантаження або порожній стан">
        <div className="mb-3 flex gap-2">
          <Button variant="secondary" size="sm" aria-pressed={loading} onClick={() => { setLoading((v) => !v); setEmpty(false); }}>Завантаження</Button>
          <Button variant="secondary" size="sm" aria-pressed={empty} onClick={() => { setEmpty((v) => !v); setLoading(false); }}>Порожньо</Button>
        </div>

        {empty ? (
          <EmptyStateCard
            badgeLabel="Нічого не знайшли"
            title="Прорахунків немає"
            description="За обраним фільтром нічого не знайшлось. Скинь фільтри або створи новий."
            actionLabel="Скинути фільтри"
            onAction={() => setEmpty(false)}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/50 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Номер</TableHead>
                  <TableHead>Замовник</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Сума, ₴</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                        <TableCell />
                      </TableRow>
                    ))
                  : ROWS.map(([num, cust, status, label, sum]) => (
                      <TableRow key={num}>
                        <TableCell className="font-medium tabular-nums">{num}</TableCell>
                        <TableCell>{cust}</TableCell>
                        <TableCell><Badge tone={QUOTE_STATUS_TONE[status] as Exclude<Tone, "teal">}>{label}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{sum}</TableCell>
                        <TableCell><Button variant="control" size="iconSm" aria-label="Дії"><MoreHorizontal /></Button></TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Caption>Каркас повторює розміри справжніх рядків — тому сторінка не стрибає, коли дані приходять (REQ-19).</Caption>
      </Section>
    </Shell>
  );
}

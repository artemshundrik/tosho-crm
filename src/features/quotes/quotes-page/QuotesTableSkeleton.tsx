import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QUOTES_COLUMNS, quotesColumnWidth } from "@/features/quotes/quotes-page/quotesTableColumns";
import { cn } from "@/lib/utils";

const ROWS = 10;

/**
 * Скелет таблиці прорахунків: ті самі колонки, ширини (з тих самих CSS-змінних)
 * і рядки по 40 px, що й у справжній таблиці, тож вміст не стрибає, коли дані
 * приїдуть. Стоїть усередині обгортки, де `useQuotesTableColumns` пише ширини.
 */
export function QuotesTableSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Завантаження прорахунків">
      <Table
        variant="list"
        size="md"
        stickyHeader
        className="table-fixed [&_th]:px-3 [&_td]:px-3 [&_th]:h-9 [&_td]:py-0 [&_tbody_tr]:h-10"
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[40px]" />
            <TableHead style={{ width: quotesColumnWidth("number") }}>{QUOTES_COLUMNS.number.label}</TableHead>
            <TableHead style={{ width: quotesColumnWidth("customer") }}>{QUOTES_COLUMNS.customer.label}</TableHead>
            <TableHead>Що рахуємо</TableHead>
            <TableHead style={{ width: quotesColumnWidth("total") }} className="!pr-6 text-right">
              {QUOTES_COLUMNS.total.label}
            </TableHead>
            <TableHead style={{ width: quotesColumnWidth("status") }}>{QUOTES_COLUMNS.status.label}</TableHead>
            <TableHead style={{ width: quotesColumnWidth("deadline") }}>{QUOTES_COLUMNS.deadline.label}</TableHead>
            <TableHead className="w-[64px] text-center">Менеджер</TableHead>
            <TableHead className="w-[44px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: ROWS }).map((_, index) => (
            <TableRow key={index} className="border-b border-border/50 hover:bg-transparent">
              <TableCell>
                <Skeleton className="h-4 w-4 rounded-sm" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-3.5 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                  <Skeleton className={cn("h-3.5 rounded-full", index % 2 === 0 ? "w-[60%]" : "w-[45%]")} />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
                  <Skeleton className={cn("h-3.5 rounded-full", index % 3 === 0 ? "w-[52%]" : index % 3 === 1 ? "w-[38%]" : "w-[64%]")} />
                </div>
              </TableCell>
              <TableCell className="!pr-6">
                <Skeleton className="ml-auto h-3.5 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-full" />
                  <Skeleton className="h-3.5 w-16 rounded-full" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-3.5 w-12 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="mx-auto h-6 w-6 rounded-full" />
              </TableCell>
              <TableCell />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

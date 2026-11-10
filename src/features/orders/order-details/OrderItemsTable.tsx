import { ExternalLink } from "@/components/icons/appIcons";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrderItemDocumentNamesField } from "@/features/orders/order-details/OrderItemDocumentNamesField";
import { orderItemSources } from "@/features/orders/orderItemMetadata";
import { formatOrderMoney, type DerivedOrderItem, type DerivedOrderRecord } from "@/features/orders/orderRecords";

/**
 * Артикул, колір і сайт товару: те, за чим його замовлятимуть, коли моделі в каталозі
 * немає. Позиції з прорахунку цих полів не мають, тож рядка в них просто нема.
 */
function OrderItemSourceLine({ item }: { item: Pick<DerivedOrderItem, "name" | "metadata"> }) {
  const sku = item.metadata?.sku;
  const color = item.metadata?.color;
  // Колір зазвичай уже дописаний у назву: документи читають саме її.
  const showColor = color && !item.name.toLowerCase().includes(color.toLowerCase());
  const sources = orderItemSources(item.metadata);
  if (!sku && !showColor && sources.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-normal text-muted-foreground">
      {sku ? <span className="tabular-nums">арт. {sku}</span> : null}
      {showColor ? <span>{color}</span> : null}
      {sources.map((source) => (
        <a
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          title={source.url}
          className="inline-flex items-center gap-1 transition-colors hover:text-primary"
        >
          <span className="underline underline-offset-2">{source.name}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
        </a>
      ))}
    </div>
  );
}

/** Вкладка «Позиції»: товари замовлення з підсумком унизу і назви для документів. */
export function OrderItemsTable({
  record,
  teamId,
  onDocumentNamesSaved,
}: {
  record: DerivedOrderRecord;
  teamId: string | null | undefined;
  onDocumentNamesSaved: (names: Map<string, string | null>) => void;
}) {
  return (
    <div className="space-y-4">
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <Table variant="list" size="md">
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 text-center">№</TableHead>
            <TableHead>Товар</TableHead>
            <TableHead className="w-20 text-center">Од.</TableHead>
            <TableHead className="w-28 text-right">Кількість</TableHead>
            <TableHead className="w-36 text-right">Ціна</TableHead>
            <TableHead className="w-36 pr-6 text-right">Сума</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {record.items.map((item, index) => (
            <TableRow key={item.id}>
              {/* Номер рядка, як у СП: position — порядок, а не номер (з прорахунку приходить його позиція, 3 і 4). */}
              <TableCell className="text-center font-medium text-muted-foreground">{index + 1}</TableCell>
              <TableCell className="font-medium text-foreground">
                <div className="flex items-center gap-3">
                  {item.thumbUrl || item.imageUrl ? (
                    <img
                      src={item.thumbUrl || item.imageUrl || ""}
                      alt={item.name}
                      className="h-12 w-12 shrink-0 rounded-lg border border-line bg-muted/20 object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <div>{item.name}</div>
                    {item.description ? (
                      <div className="mt-0.5 line-clamp-2 text-xs font-normal text-muted-foreground">{item.description}</div>
                    ) : null}
                    {item.methodsSummary ? (
                      <div className="mt-0.5 text-xs font-normal text-muted-foreground">Нанесення: {item.methodsSummary}</div>
                    ) : null}
                    <OrderItemSourceLine item={item} />
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-center">{item.unit}</TableCell>
              <TableCell className="text-right tabular-nums">{item.qty.toLocaleString("uk-UA")}</TableCell>
              <TableCell className="text-right tabular-nums">{formatOrderMoney(item.unitPrice, record.currency)}</TableCell>
              <TableCell className="pr-6 text-right font-semibold tabular-nums text-foreground">
                {formatOrderMoney(item.lineTotal, record.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {record.items.length > 0 ? (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5} className="text-right text-muted-foreground">
                Разом
              </TableCell>
              <TableCell className="pr-6 text-right font-semibold tabular-nums text-foreground">
                {formatOrderMoney(record.total, record.currency)}
              </TableCell>
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
    <div className="rounded-xl border border-line bg-card p-4">
      <OrderItemDocumentNamesField record={record} teamId={teamId} onSaved={onDocumentNamesSaved} />
    </div>
    </div>
  );
}

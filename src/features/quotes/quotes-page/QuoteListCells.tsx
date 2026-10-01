import { createElement } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/features/quotes/commercial-document/document";
import type { QuoteKanbanProductPreview } from "@/features/quotes/components/QuoteKanbanProducts";
import { QuoteItemsHoverCard } from "@/features/quotes/quotes-page/QuoteItemsHoverCard";
import { quoteTypeIcon, quoteTypeLabel } from "@/features/quotes/quotes-page/config";
import { cn } from "@/lib/utils";

/** Вміст клітинки «Що рахуємо»: мініатюра, назва, «+N», тираж, тип; на наведенні — картка позицій. */
export function QuoteItemsCellContent({
  quoteId,
  title,
  quoteType,
  preview,
}: {
  quoteId: string;
  title: string | null | undefined;
  quoteType: string | null | undefined;
  preview: QuoteKanbanProductPreview | undefined;
}) {
  const name = preview?.itemName || title?.trim() || null;
  const extra = preview && preview.itemCount > 1 ? preview.itemCount - 1 : 0;
  const qty = preview?.qtyLabel && preview.qtyLabel !== "Не вказано" ? preview.qtyLabel : null;
  const TypeIcon = quoteTypeIcon(quoteType);
  const FallbackIcon = quoteTypeIcon("merch");
  return (
    <QuoteItemsHoverCard quoteId={quoteId} preview={preview}>
      <div className="flex min-w-0 items-center gap-2">
        <div className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md border border-border/60 bg-secondary text-muted-foreground/60">
          {preview?.imageUrl ? (
            <img src={preview.imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : FallbackIcon ? (
            createElement(FallbackIcon, { className: "h-3.5 w-3.5" })
          ) : null}
        </div>
        <span className={cn("truncate text-sm", !name && "text-muted-foreground")}>{name ?? "—"}</span>
        {extra > 0 ? <span className="shrink-0 text-xs text-muted-foreground">+{extra}</span> : null}
        {qty ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{qty}</span> : null}
        {quoteType && quoteType !== "merch" ? (
          <span className="inline-flex h-4 shrink-0 items-center gap-1 rounded-full border border-border/60 bg-muted/20 px-1.5 text-3xs font-semibold text-muted-foreground">
            {TypeIcon ? createElement(TypeIcon, { className: "h-3 w-3" }) : null}
            {quoteTypeLabel(quoteType)}
          </span>
        ) : null}
      </div>
    </QuoteItemsHoverCard>
  );
}

/** Вміст клітинки «Сума»: з тиражів; поки прев'ю їде — плашка. */
export function QuoteTotalCellContent({
  preview,
  previewsLoading,
}: {
  preview: QuoteKanbanProductPreview | undefined;
  previewsLoading: boolean;
}) {
  if (preview?.listTotal === undefined && previewsLoading) return <Skeleton className="ml-auto h-4 w-16" />;
  const total = preview?.listTotal ?? null;
  if (!total) return <span className="text-muted-foreground">—</span>;
  const exact = formatMoney(total.amount);
  const rounded = formatMoney(Math.round(total.amount));
  return total.partial ? (
    <span title={`від ${exact} · Кілька тиражів, клієнт ще не обрав`}>від {rounded}</span>
  ) : (
    <span title={exact}>{rounded}</span>
  );
}

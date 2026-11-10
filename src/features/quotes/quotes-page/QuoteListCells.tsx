import { createElement } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/features/quotes/commercial-document/document";
import type { QuoteKanbanProductPreview } from "@/features/quotes/components/QuoteKanbanProducts";
import { QuoteItemsHoverCard } from "@/features/quotes/quotes-page/QuoteItemsHoverCard";
import { quoteTypeIcon, quoteTypeLabel, statusLabels } from "@/features/quotes/quotes-page/config";
import type { QuoteTableGroup } from "@/features/quotes/quotes-page/quoteTableGroups";
import { quoteStatusDotClass } from "@/lib/statusTones";
import type { QuoteSetMembershipInfo } from "@/lib/toshoApi";
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
        <div className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-secondary text-muted-foreground/60">
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
          <span className="inline-flex h-4 shrink-0 items-center gap-1 rounded-full border border-line bg-muted/20 px-1.5 text-3xs font-semibold text-muted-foreground">
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

/** Значки «КП» і «Набір» — у рядку таблиці (`row`) і на картці дошки (`card`). */
export function QuoteMembershipBadges({
  membership,
  size,
}: {
  membership: QuoteSetMembershipInfo | undefined;
  size: "row" | "card";
}) {
  const badgeClass = size === "row" ? "h-4 shrink-0 px-1 text-3xs" : "h-5 px-1.5 text-3xs inline-flex items-center gap-1";
  return (
    <>
      {membership?.kp_count ? (
        <Badge variant="outline" title={membership.kp_names.join(", ")} className={cn(badgeClass, "quote-kind-badge-kp")}>
          КП{membership.kp_count > 1 ? ` +${membership.kp_count - 1}` : ""}
        </Badge>
      ) : null}
      {membership?.set_count ? (
        <Badge variant="outline" title={membership.set_names.join(", ")} className={cn(badgeClass, "quote-kind-badge-set")}>
          Набір{membership.set_count > 1 ? ` +${membership.set_count - 1}` : ""}
        </Badge>
      ) : null}
    </>
  );
}

/** Рядок-заголовок групи в таблиці прорахунків (В4): стан, скільки й на яку суму. */
export function QuoteGroupHeaderRow({ group, colSpan }: { group: QuoteTableGroup<unknown>; colSpan: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="bg-muted/30 py-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("size-2 rounded-[3px]", quoteStatusDotClass[group.status] ?? "bg-muted-foreground")} aria-hidden />
          <span className="font-medium text-foreground">{statusLabels[group.status] ?? "Без стану"}</span>
          <span className="tabular-nums">{group.rows.length}</span>
          <span className="ml-auto tabular-nums" title={group.partial ? "Частина сум ще невідома або залежить від тиражу" : undefined}>
            {group.partial ? "від " : ""}
            {formatMoney(Math.round(group.amount))}
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

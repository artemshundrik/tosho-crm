import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";

import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { EntityProp } from "@/components/app/headers/EntityHeader";
import { EntityPeek, PeekSection } from "@/components/app/peek/EntityPeek";
import { Clock, Package } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/features/quotes/commercial-document/document";
import type { QuoteKanbanProduct, QuoteKanbanProductPreview } from "@/features/quotes/components/QuoteKanbanProducts";
import { STATUS_NEXT_ACTION } from "@/features/quotes/quote-details/config";
import { commitQuoteStatusChange } from "@/features/quotes/quote-details/quoteStatusCommit";
import { resolveQuoteStatusGate, resolveStatusBlockReason } from "@/features/quotes/quote-details/quoteStatusGates";
import { PrintModelTile } from "@/features/quotes/quote-wizard/printModelArt";
import { normalizeStatus, quoteTypeLabel, statusColorClass, statusIcons, statusLabels } from "@/features/quotes/quotes-page/config";
import type { QuoteListLine } from "@/features/quotes/quotes-page/quoteListTotal";
import { canEditQuoteContent } from "@/lib/permissions";
import type { QuoteListRow } from "@/lib/toshoApi";
import { normalizeUnitLabel } from "@/lib/units";
import { getInitialsFromName as getInitials } from "@/lib/userName";
import { cn } from "@/lib/utils";

const money = (value: number) => formatMoney(Math.round(value));

const lineQty = (line: QuoteListLine | undefined, product: QuoteKanbanProduct) => {
  if (line?.quantity) {
    const label = Number.isInteger(line.quantity) ? String(line.quantity) : line.quantity.toLocaleString("uk-UA");
    return `${label} ${normalizeUnitLabel(line.unit)}`;
  }
  return product.qtyLabel && product.qtyLabel !== "Не вказано" ? product.qtyLabel : null;
};

/**
 * Прев'ю прорахунку (REQ-346#p1). Дані — ті, що таблиця вже тримає: рядок
 * списку й прев'ю товарів із тиражами (`kanbanProductByQuoteId`), тож нового
 * запиту немає.
 *
 * Головна дія тут — лише «Позначити як пораховано» (REQ-346#p8): той самий
 * запис, що на сторінці (`commitQuoteStatusChange`), за тими самими правами й
 * гейтами. Прев'ю не тримає незбережених тиражів, а гейт накрутки стосується
 * лише затвердження, тож перевірки тут повні, а не урізані.
 *
 * Решта кроків лишаються на сторінці: «на погодження» — це надсилання
 * пропозиції клієнту, а «затверджено» питає, які позиції клієнт узяв, і
 * спирається на погодження накрутки. Половинчаста копія тих діалогів тут була
 * б небезпечнішою за зайвий клік.
 */
export function QuotePeek({
  row,
  preview,
  previewLoading,
  managerLabel,
  managerAvatarUrl,
  deadline,
  onClose,
  onOpenFull,
  onPrev,
  onNext,
  closing,
  teamId,
  onStatusChanged,
}: {
  row: QuoteListRow;
  preview: QuoteKanbanProductPreview | undefined;
  previewLoading: boolean;
  managerLabel: string;
  managerAvatarUrl: string | null;
  /** Дедлайн тим самим текстом і тоном, що в рядку таблиці. */
  deadline: ReactNode;
  onClose: () => void;
  onOpenFull: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  closing?: boolean;
  teamId: string;
  /** Статус записано: список оновлює рядок і лічильники вкладок. */
  onStatusChanged: (status: string) => void;
}) {
  const { userId, jobRole, permissions } = useAuth();
  const [statusBusy, setStatusBusy] = useState(false);
  const status = normalizeStatus(row.status);
  const StatusIcon = statusIcons[status] ?? Clock;
  const next = STATUS_NEXT_ACTION[status];
  const nextLabel = next?.nextStatus && status !== "approved" ? next.ctaLabel : null;
  const products = preview?.products ?? [];
  const linesById = new Map((preview?.listLines ?? []).map((line) => [line.id, line]));
  const total = preview?.listTotal ?? null;
  const itemName = preview?.itemName || row.title?.trim() || null;
  const extra = preview && preview.itemCount > 1 ? preview.itemCount - 1 : 0;
  const title = [row.customer_name, itemName ? `${itemName}${extra ? ` і ще ${extra}` : ""}` : null].filter(Boolean).join(" · ");
  const note = [row.comment, row.design_brief].map((value) => value?.trim()).filter(Boolean).join("\n\n");

  const canMarkEstimated = status === "estimating";
  const requirements = [
    row.customer_id || row.customer_name?.trim() ? null : "Замовник або Лід",
    row.deadline_at ? null : "Дедлайн прорахунку",
  ].filter((issue): issue is string => issue !== null);
  const blockReason = canMarkEstimated
    ? resolveStatusBlockReason({
        canEditContent: canEditQuoteContent({
          userId,
          quoteManagerUserId: row.assigned_to,
          quoteCreatedByUserId: row.created_by,
          viewerJobRole: jobRole,
          permissions,
        }),
        lockedByOther: false,
        requirements,
        unsavedRunCount: 0,
      }) ?? resolveQuoteStatusGate("estimated", false, null, 0)?.message ?? null
    : null;

  const markEstimated = async () => {
    setStatusBusy(true);
    const committed = await commitQuoteStatusChange({
      teamId,
      quoteId: row.id,
      quoteNumber: row.number,
      previousStatus: status,
      nextStatus: "estimated",
      note: "",
      actorUserId: userId ?? null,
    });
    setStatusBusy(false);
    if (!committed.ok) {
      toast.error("Статус не змінено", { description: committed.message });
      return;
    }
    toast.success(`${row.number ?? "Прорахунок"}: пораховано`);
    onStatusChanged("estimated");
  };

  return (
    <EntityPeek
      section="Прорахунки"
      number={row.number ?? "—"}
      numberCopyMessage="Номер прорахунку скопійовано"
      title={title || "Прорахунок"}
      properties={
        <>
          <EntityProp>
            <StatusIcon className={cn("size-3.5 shrink-0", statusColorClass[status] ?? "text-muted-foreground")} />
            {statusLabels[status] ?? status}
          </EntityProp>
          {row.deadline_at ? <EntityProp label="Дедлайн">{deadline}</EntityProp> : null}
          <EntityProp label="Сума" className="tabular-nums">
            {total ? `${total.partial ? "від " : ""}${money(total.amount)}` : "—"}
          </EntityProp>
          {row.quote_type && row.quote_type !== "merch" ? <EntityProp>{quoteTypeLabel(row.quote_type)}</EntityProp> : null}
          <EntityProp label="Менеджер">
            <AvatarBase src={managerAvatarUrl} name={managerLabel} fallback={getInitials(managerLabel)} size={18} />
            <span className="truncate">{managerLabel}</span>
          </EntityProp>
        </>
      }
      actions={
        canMarkEstimated ? (
          <>
            <Button size="sm" onClick={() => void markEstimated()} disabled={Boolean(blockReason) || statusBusy}>
              {statusBusy ? "Зберігаю…" : next?.ctaLabel}
            </Button>
            <Button size="sm" variant="outline" onClick={onOpenFull}>
              Відкрити прорахунок
            </Button>
            {blockReason ? <p className="w-full text-xs text-muted-foreground">{blockReason}</p> : null}
          </>
        ) : (
          <>
            <Button size="sm" onClick={onOpenFull}>
              Відкрити прорахунок
            </Button>
            {nextLabel ? <span className="text-xs text-muted-foreground">Далі: {nextLabel.toLocaleLowerCase("uk")}</span> : null}
          </>
        )
      }
      onClose={onClose}
      onOpenFull={onOpenFull}
      onPrev={onPrev}
      onNext={onNext}
      closing={closing}
    >
      <PeekSection title="Товари" aside={preview ? <span className="tabular-nums">{preview.itemCount}</span> : null}>
        {products.length === 0 ? (
          previewLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Позицій ще немає</div>
          )
        ) : (
          <ul className="space-y-2">
            {products.map((product) => {
              const line = linesById.get(product.id);
              const qty = lineQty(line, product);
              return (
                <li key={product.id} className={cn("flex min-w-0 items-center gap-2.5", line?.declined && "text-muted-foreground")}>
                  {product.specPreset ? (
                    <PrintModelTile presetKey={product.specPreset} className="size-9 shrink-0 rounded-md" iconClassName="size-5" />
                  ) : product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt=""
                      loading="lazy"
                      className="size-9 shrink-0 rounded-md border border-border/60 bg-white object-contain"
                    />
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
                      <Package className="size-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate text-sm", line?.declined ? "line-through" : "text-foreground")}>
                      {product.variantName ? `${product.name} · ${product.variantName}` : product.name}
                    </div>
                    {qty ? <div className="truncate text-xs tabular-nums text-muted-foreground">{qty}</div> : null}
                  </div>
                  {line?.declined ? (
                    <span className="shrink-0 text-xs">відмовився</span>
                  ) : line?.amount ? (
                    <span className="shrink-0 text-sm tabular-nums text-foreground">
                      {line.partial ? "від " : ""}
                      {money(line.amount)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </PeekSection>
      {note ? (
        <PeekSection title="Коментар">
          <p className="whitespace-pre-line text-sm text-foreground">{note}</p>
        </PeekSection>
      ) : null}
      <PeekSection title="Замовник">
        <div className="flex min-w-0 items-center gap-2.5">
          <EntityAvatar
            src={row.customer_logo_url ?? null}
            name={row.customer_name ?? "Замовник"}
            fallback={getInitials(row.customer_name)}
            size={28}
          />
          <span className="truncate text-sm text-foreground">{row.customer_name ?? "Не вказано"}</span>
        </div>
      </PeekSection>
    </EntityPeek>
  );
}

import { EntityAvatar } from "@/components/app/avatar-kit";
import { EntityProp } from "@/components/app/headers/EntityHeader";
import { EntityPeek, PeekSection } from "@/components/app/peek/EntityPeek";
import { Package } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import {
  DocMarks,
  ManagerAvatar,
  NextStep,
  PaidMiniBar,
  type OrderListRowView,
} from "@/features/orders/order-list/OrderListRows";
import { formatOrderMoney } from "@/features/orders/orderRecords";

/**
 * Прев'ю замовлення (REQ-346#p1). Усе — з рядка списку, без жодного запиту:
 * `useOrderRecords` уже тримає позиції, оплату й документи.
 *
 * Головна кнопка — та сама, що в рядку («Виставити рахунок», «Запустити»…), і
 * так само відкриває картку: оплата, документи й запуск потребують діалогів
 * сторінки, а половинчаста копія їх тут була б небезпечнішою за перехід.
 */
export function OrderPeek({
  view,
  onClose,
  onOpenFull,
  onPrev,
  onNext,
  closing,
}: {
  view: OrderListRowView;
  onClose: () => void;
  onOpenFull: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  closing?: boolean;
}) {
  const { record, step } = view;
  const first = record.items[0];
  const title = [record.customerName, first?.name ? `${first.name}${record.items.length > 1 ? ` і ще ${record.items.length - 1}` : ""}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <EntityPeek
      section="Замовлення"
      number={record.quoteNumber}
      numberCopyMessage="Номер замовлення скопійовано"
      title={title}
      properties={
        <>
          <EntityProp label="Сума" className="tabular-nums">
            {formatOrderMoney(record.total, record.currency)}
          </EntityProp>
          <EntityProp>
            <PaidMiniBar paid={view.paid} />
          </EntityProp>
          <EntityProp label="Документи">
            <DocMarks docs={view.docs} />
          </EntityProp>
          <EntityProp label="Менеджер">
            <ManagerAvatar record={record} size={18} />
            <span className="truncate">{record.managerLabel}</span>
          </EntityProp>
        </>
      }
      actions={
        <Button size="sm" onClick={onOpenFull}>
          {step.actionLabel ?? "Відкрити замовлення"}
        </Button>
      }
      onClose={onClose}
      onOpenFull={onOpenFull}
      onPrev={onPrev}
      onNext={onNext}
      closing={closing}
    >
      <PeekSection title="Що далі">
        <NextStep view={view} />
      </PeekSection>
      <PeekSection title="Позиції" aside={<span className="tabular-nums">{record.items.length}</span>}>
        <ul className="space-y-2">
          {record.items.map((item) => (
            <li key={item.id} className="flex min-w-0 items-center gap-2.5">
              {item.thumbUrl || item.imageUrl ? (
                <img
                  src={item.thumbUrl ?? item.imageUrl ?? undefined}
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
                <div className="truncate text-sm text-foreground">{item.name}</div>
                <div className="truncate text-xs tabular-nums text-muted-foreground">
                  {item.qty.toLocaleString("uk-UA")} {item.unit || "шт."} × {formatOrderMoney(item.unitPrice, record.currency)}
                </div>
              </div>
              <div className="shrink-0 text-sm tabular-nums text-foreground">{formatOrderMoney(item.lineTotal, record.currency)}</div>
            </li>
          ))}
        </ul>
      </PeekSection>
      <PeekSection title="Замовник">
        <div className="flex min-w-0 items-center gap-2.5">
          <EntityAvatar src={record.customerLogoUrl} name={record.customerName} fallback={record.customerName.slice(0, 1)} size={28} />
          <div className="min-w-0">
            <div className="truncate text-sm text-foreground">{record.customerName}</div>
            {record.contactPhone || record.contactEmail ? (
              <div className="truncate text-xs text-muted-foreground">
                {[record.contactPhone, record.contactEmail].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </div>
        </div>
      </PeekSection>
    </EntityPeek>
  );
}

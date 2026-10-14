import { Button } from "@/components/ui/button";
import { PackageCheck, Pencil, Truck } from "@/components/icons/appIcons";
import type { OrderDeliverySnapshot } from "@/components/orders/OrderDeliveryDialog";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { DELIVERY_TYPE_OPTIONS } from "@/features/quotes/quotes-page/config";

/** Вкладка «Доставка»: спосіб, отримувач, пакування й ТТН Нової пошти. */
export function OrderDeliveryCard({
  record,
  delivery,
  ttnStatus,
  onEditDelivery,
  onOpenTtn,
}: {
  record: DerivedOrderRecord;
  delivery: OrderDeliverySnapshot | null;
  ttnStatus: string | null;
  onEditDelivery: () => void;
  onOpenTtn: () => void;
}) {
  const details = delivery?.deliveryDetails;
  const location = details
    ? [details.city, details.npDeliveryType === "address" ? details.street : details.address].filter(Boolean).join(", ")
    : "";
  const recipient = details ? [details.contactName, details.contactPhone].filter(Boolean).join(" · ") : "";

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4" aria-label="Доставка">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Truck className="h-4 w-4 text-muted-foreground" />
          {delivery?.deliveryType
            ? DELIVERY_TYPE_OPTIONS.find((option) => option.id === delivery.deliveryType)?.label ?? delivery.deliveryType
            : "Спосіб доставки не вказаний"}
        </div>
        <Button type="button" variant="ghost" size="sm" className="gap-1 px-2 text-xs" onClick={onEditDelivery}>
          <Pencil className="h-3 w-3" />
          Змінити
        </Button>
      </div>
      {location ? <div className="mt-1 text-sm text-foreground">{location}</div> : null}
      {recipient ? <div className="mt-1 text-xs text-muted-foreground">Отримувач: {recipient}</div> : null}
      {details?.payer ? (
        <div className="mt-1 text-xs text-muted-foreground">Платить: {details.payer === "company" ? "ми" : "замовник"}</div>
      ) : null}
      <div className="mt-3 border-t border-border/50 pt-3 text-sm">
        <span className="text-muted-foreground">Умови поставки: </span>
        <span className="font-medium text-foreground">{record.incotermsCode || "FCA"}</span>
        {record.incotermsPlace ? <span className="text-muted-foreground">, {record.incotermsPlace}</span> : null}
      </div>
      {record.packaging ? (
        <div className="mt-3 border-t border-border/50 pt-3">
          <div className="text-2xs uppercase tracking-caps-tight text-muted-foreground">Пакування</div>
          <div className="mt-1 text-sm text-foreground">{record.packaging}</div>
        </div>
      ) : null}
      {record.source === "stored" ? (
        <div className="mt-3 border-t border-border/50 pt-3">
          {record.npTtnNumber ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-2xs uppercase tracking-wide text-muted-foreground">ТТН Нової пошти</div>
                <div className="font-mono text-sm font-semibold">{record.npTtnNumber}</div>
                {record.npTtnEstimatedDelivery ? (
                  <div className="text-xs text-muted-foreground">Орієнтовно: {record.npTtnEstimatedDelivery}</div>
                ) : null}
                {ttnStatus ? <div className="text-xs font-medium text-foreground">{ttnStatus}</div> : null}
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 px-2 text-xs" onClick={onOpenTtn}>
                Деталі
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={onOpenTtn}
              disabled={!delivery?.deliveryType}
            >
              <PackageCheck className="h-3.5 w-3.5" />
              Створити ТТН
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}

import { useState } from "react";
import { toast } from "sonner";

import { AlertTriangle } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/picker-input";
import { followUpInvoiceEvent } from "@/features/orders/order-details/useOrderInvoiceFlow";
import { findIndivisiblePrices, parseMoneyInput } from "@/features/orders/orderInvoice";
import { correctOrderInvoice } from "@/features/orders/orderInvoiceQueries";
import { formatOrderDate, formatOrderMoneyExact as formatOrderMoney, type DerivedOrderRecord } from "@/features/orders/orderRecords";
import { notifyOrderInvoiceDecided } from "@/lib/workflowNotifications";

type Draft = { id: string; name: string; unit: string; qty: string; price: string };

const toInput = (value: number) => String(value).replace(".", ",");

const draftFrom = (record: DerivedOrderRecord): Draft[] =>
  record.items.map((item) => ({
    id: item.id,
    name: item.documentName ?? item.name,
    unit: item.unit,
    qty: toInput(item.qty),
    price: toInput(item.unitPrice),
  }));

/**
 * «Виправити рахунок» (REQ-335, вузька версія): бухгалтер чи СЕО міняють ціну й
 * кількість позицій уже виписаного рахунку, а якщо BAS дав новий номер — номер
 * і дату. Назва позиції правиться окремо, полем назв для документів.
 *
 * Неподільна на 1,2 ціна тут не попередження, як у запиті рахунку, а замок:
 * виправляє сама бухгалтерія, і саме вона заборонила округлення.
 *
 * Права й межі (підписана СП, оплата) стереже tosho.correct_order_invoice.
 * Після збереження змінюються позиції й сума — замовлення перечитується цілком.
 */
export function OrderInvoiceCorrectionDialog({
  record,
  teamId,
  userId,
  open,
  onOpenChange,
  onSaved,
}: {
  record: DerivedOrderRecord;
  teamId: string;
  userId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Draft[]>(() => draftFrom(record));
  const [number, setNumber] = useState(record.invoiceNumber ?? "");
  const [date, setDate] = useState(record.invoiceDate ?? "");

  const reset = () => {
    setItems(draftFrom(record));
    setNumber(record.invoiceNumber ?? "");
    setDate(record.invoiceDate ?? "");
  };

  const parsed = items.map((item) => ({
    ...item,
    qtyValue: parseMoneyInput(item.qty),
    priceValue: parseMoneyInput(item.price),
  }));
  const invalid = parsed.some((item) => !item.qtyValue || item.qtyValue <= 0 || !item.priceValue || item.priceValue <= 0);
  const total = parsed.reduce(
    (sum, item) => sum + Math.round((item.qtyValue ?? 0) * (item.priceValue ?? 0) * 100) / 100,
    0
  );
  const indivisible = record.executor.vatPayer
    ? findIndivisiblePrices(parsed.map((item) => ({ name: item.name, unitPrice: item.priceValue })))
    : [];
  const changed =
    number.trim() !== (record.invoiceNumber ?? "") ||
    date !== (record.invoiceDate ?? "") ||
    parsed.some((item) => {
      const before = record.items.find((entry) => entry.id === item.id);
      return before?.qty !== item.qtyValue || before?.unitPrice !== item.priceValue;
    });
  const patchItem = (id: string, patch: Partial<Draft>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const save = async () => {
    setBusy(true);
    try {
      const result = await correctOrderInvoice({
        orderId: record.id,
        items: parsed.map((item) => ({ id: item.id, qty: item.qtyValue ?? 0, unitPrice: item.priceValue ?? 0 })),
        number,
        date,
      });
      toast.success("Рахунок виправлено — менеджер отримає сповіщення");
      onOpenChange(false);
      onSaved();
      const label = `№ ${result.numberAfter} від ${formatOrderDate(date)}`;
      const money = (value: number) => formatOrderMoney(value, record.currency);
      const summary = [
        result.totalBefore !== result.totalAfter ? `сума ${money(result.totalBefore)} → ${money(result.totalAfter)}` : null,
        result.numberBefore && result.numberBefore !== result.numberAfter
          ? `номер ${result.numberBefore} → ${result.numberAfter}`
          : null,
      ]
        .filter(Boolean)
        .join(", ");
      void followUpInvoiceEvent(record, teamId, `Виправив(ла) рахунок ${label}${summary ? `: ${summary}` : ""}`, (actorName) =>
        notifyOrderInvoiceDecided({
          orderId: record.id,
          orderNumber: record.quoteNumber,
          decision: "corrected",
          invoiceLabel: label,
          note: summary || "змінено дату рахунку",
          recipientUserIds: [record.invoiceRequestedBy, record.managerUserId],
          deciderName: actorName,
          actorUserId: userId,
        })
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Не вдалося виправити рахунок.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Виправити рахунок № {record.invoiceNumber}</DialogTitle>
          <DialogDescription>
            {record.customerName}. Рахунок, СП і акт відкриються з новими цінами. Погоджену СП доведеться погодити ще раз.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {parsed.map((item) => (
            <div key={item.id} className="space-y-1.5">
              <div className="truncate text-sm font-medium text-foreground" title={item.name}>
                {item.name}
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <div className="grid gap-1">
                  <Label htmlFor={`invoice-fix-qty-${item.id}`} className="text-xs">
                    Кількість, {item.unit}
                  </Label>
                  <Input
                    id={`invoice-fix-qty-${item.id}`}
                    inputMode="decimal"
                    value={item.qty}
                    disabled={busy}
                    onChange={(event) => patchItem(item.id, { qty: event.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`invoice-fix-price-${item.id}`} className="text-xs">
                    {record.executor.vatPayer ? "Ціна з ПДВ" : "Ціна"}
                  </Label>
                  <Input
                    id={`invoice-fix-price-${item.id}`}
                    inputMode="decimal"
                    value={item.price}
                    disabled={busy}
                    onChange={(event) => patchItem(item.id, { price: event.target.value })}
                  />
                </div>
                <div className="pb-2 text-right text-sm tabular-nums text-muted-foreground">
                  {formatOrderMoney((item.qtyValue ?? 0) * (item.priceValue ?? 0), record.currency)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {indivisible.length > 0 ? (
          <div className="tone-warning-subtle space-y-1 rounded-md border px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5 tone-text-warning" />
              Ціна не ділиться на 1,2 до копійки — оберіть найближчу
            </div>
            {indivisible.map((entry) => {
              const target = parsed.find((item) => item.name === entry.name);
              return (
                <div key={entry.name} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground">{entry.name}:</span>
                  {[entry.down, entry.up].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={busy || !target}
                      onClick={() => target && patchItem(target.id, { price: toInput(value) })}
                    >
                      {formatOrderMoney(value, record.currency)}
                    </Button>
                  ))}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="invoice-fix-number" className="text-xs">
              Номер з BAS
            </Label>
            <Input id="invoice-fix-number" value={number} disabled={busy} onChange={(event) => setNumber(event.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="invoice-fix-date" className="text-xs">
              Дата
            </Label>
            <DateInput id="invoice-fix-date" value={date} disabled={busy} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>

        <div className="flex items-baseline justify-between border-t border-border/60 pt-3 text-sm">
          <span className="text-muted-foreground">Разом</span>
          <span className="tabular-nums">
            {total !== record.total ? (
              <span className="mr-2 text-muted-foreground line-through">{formatOrderMoney(record.total, record.currency)}</span>
            ) : null}
            <span className="font-semibold text-foreground">{formatOrderMoney(total, record.currency)}</span>
          </span>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button
            type="button"
            disabled={busy || invalid || !changed || indivisible.length > 0 || !number.trim() || !date}
            onClick={() => void save()}
          >
            {busy ? "Збереження..." : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

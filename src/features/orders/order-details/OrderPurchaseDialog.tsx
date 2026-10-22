import { useId, useRef, useState } from "react";

import { Loader2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/picker-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { kyivDay } from "@/features/orders/kyivDate";
import type { EconomicsItem } from "@/features/orders/order-details/OrderEconomicsTab";
import type { SavePurchaseInput } from "@/features/orders/orderPurchaseQueries";
import { formatAmountInput, parseAmountInput } from "@/features/orders/orderPayments";
import { purchaseCostWithVat, type OrderPurchase, type PurchaseVatMode } from "@/features/orders/orderPurchases";

/** Значення Select для «на все замовлення»: порожній рядок Radix не приймає. */
const WHOLE = "__whole__";

/** Сума рахунку постачальника: як у «Внести оплату», але нуль дозволено — рядок-нагадування. */
const parsePurchaseAmount = (raw: string): number | null => {
  const value = parseAmountInput(raw);
  if (value !== null) return value;
  return /^\s*0+([.,]0{1,2})?\s*$/.test(raw) ? 0 : null;
};

const parseQty = (raw: string): number | null | "invalid" => {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : "invalid";
};

/**
 * Внести чи правити рядок закупки. Серія з 5–7 рядків — звична справа, тож
 * «Зберегти й ще одну» чистить лише опис, суму й кількість: позиція,
 * постачальник, рахунок і ПДВ лишаються для наступного рядка того ж рахунку.
 * Оплачений рядок суму, ПДВ, позицію, постачальника й дату рахунку не міняє.
 */
export function OrderPurchaseDialog({
  open,
  onOpenChange,
  orderId,
  items,
  purchase,
  defaultItemId,
  supplierHints,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  items: EconomicsItem[];
  /** null — новий рядок. */
  purchase: OrderPurchase | null;
  /** undefined — позицію обирає людина; null — «на все замовлення». */
  defaultItemId?: string | null;
  supplierHints: string[];
  saving: boolean;
  onSubmit: (input: SavePurchaseInput) => Promise<boolean>;
}) {
  const ids = useId();
  const descriptionRef = useRef<HTMLInputElement>(null);
  const today = kyivDay();
  const locked = Boolean(purchase && (purchase.expenseId || purchase.paidOn));
  const initialItem = purchase ? purchase.orderItemId : defaultItemId;

  // Віконце перемонтовується ключем на кожне відкриття — поля беруться з пропсів.
  const [itemValue, setItemValue] = useState(() => (initialItem === undefined ? "" : (initialItem ?? WHOLE)));
  const [description, setDescription] = useState(purchase?.description ?? "");
  const [supplier, setSupplier] = useState(purchase?.supplierName ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(purchase?.supplierInvoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(purchase?.supplierInvoiceDate || today);
  const [amountText, setAmountText] = useState(() => (purchase?.amount != null ? formatAmountInput(purchase.amount) : ""));
  const [vatMode, setVatMode] = useState<PurchaseVatMode>(purchase?.vatMode ?? "with_vat");
  const [qtyText, setQtyText] = useState(purchase?.qty != null ? String(purchase.qty) : "");
  const [unit, setUnit] = useState(purchase?.unit ?? "");

  const amount = parsePurchaseAmount(amountText);
  const qty = parseQty(qtyText);
  const problems = [
    !itemValue ? "Оберіть позицію" : null,
    !description.trim() ? "Опишіть, що закуповуємо" : null,
    !supplier.trim() ? "Вкажіть постачальника" : null,
    !invoiceDate ? "Вкажіть дату рахунку" : null,
    amount === null ? "Вкажіть суму з рахунку" : null,
    qty === "invalid" ? "Кількість — число більше нуля" : null,
  ].filter(Boolean);
  const canSubmit = problems.length === 0 && !saving;

  const submit = async (more: boolean) => {
    if (!canSubmit || amount === null || qty === "invalid") return;
    const ok = await onSubmit({
      id: purchase?.id ?? null,
      orderId,
      orderItemId: itemValue === WHOLE ? null : itemValue,
      description: description.trim(),
      supplierName: supplier.trim(),
      invoiceNumber: invoiceNumber.trim() || null,
      invoiceDate,
      qty,
      unit: unit.trim() || null,
      amount,
      vatMode,
    });
    if (!ok) return;
    if (!more) {
      onOpenChange(false);
      return;
    }
    setDescription("");
    setAmountText("");
    setQtyText("");
    descriptionRef.current?.focus();
  };

  const field = (name: string) => `${ids}-${name}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{purchase ? "Закупка" : "Нова закупка"}</DialogTitle>
          <DialogDescription>
            {locked
              ? "Закупку оплачено: суму, ПДВ, позицію, постачальника й дату рахунку міняють, скасувавши оплату."
              : "Один рядок — один рахунок постачальника під одну позицію."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(false);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={field("item")}>Позиція</Label>
            <Select value={itemValue} onValueChange={setItemValue} disabled={locked}>
              <SelectTrigger id={field("item")}>
                <SelectValue placeholder="Оберіть позицію" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.qty != null ? `${item.name} - ${[item.qty, item.unit].filter(Boolean).join(" ")}` : item.name}
                  </SelectItem>
                ))}
                <SelectItem value={WHOLE}>На все замовлення</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={field("description")}>Що</Label>
            <Input
              ref={descriptionRef}
              id={field("description")}
              autoComplete="off"
              placeholder="Коробка, нанесення, доставка НП…"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={field("supplier")}>Постачальник</Label>
            <Input
              id={field("supplier")}
              autoComplete="off"
              list={field("supplier-hints")}
              disabled={locked}
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
            />
            <datalist id={field("supplier-hints")}>
              {supplierHints.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={field("invoice")}>
                № рахунку <span className="font-normal text-muted-foreground">· за бажанням</span>
              </Label>
              <Input
                id={field("invoice")}
                autoComplete="off"
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={field("date")}>Дата рахунку</Label>
              <DateInput
                id={field("date")}
                value={invoiceDate}
                disabled={locked}
                onChange={(event) => setInvoiceDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={field("amount")}>Сума з рахунку</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id={field("amount")}
                inputMode="decimal"
                autoComplete="off"
                className="max-w-[180px] font-semibold"
                disabled={locked}
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
              />
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  label="ФОП, без ПДВ"
                  checked={vatMode === "no_vat"}
                  disabled={locked}
                  onCheckedChange={(next) => setVatMode(next ? "no_vat" : "with_vat")}
                />
                ФОП, без ПДВ
              </label>
            </div>
            {vatMode === "no_vat" && amount !== null ? (
              <div className="text-xs text-muted-foreground">
                {formatAmountInput(amount)} → {formatAmountInput(purchaseCostWithVat(amount, "no_vat"))} з ПДВ — ПДВ доплачуємо самі
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={field("qty")}>
                Кількість <span className="font-normal text-muted-foreground">· за бажанням</span>
              </Label>
              <Input
                id={field("qty")}
                inputMode="decimal"
                autoComplete="off"
                value={qtyText}
                onChange={(event) => setQtyText(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={field("unit")}>Одиниця</Label>
              <Input
                id={field("unit")}
                autoComplete="off"
                placeholder="шт"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
            {problems.length > 0 ? (
              <span className="min-w-[160px] flex-1 text-xs text-muted-foreground">{problems[0]}</span>
            ) : null}
            {purchase ? null : (
              <Button type="button" variant="outline" disabled={!canSubmit} onClick={() => void submit(true)}>
                Зберегти й ще одну
              </Button>
            )}
            <Button type="submit" disabled={!canSubmit}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Зберегти
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

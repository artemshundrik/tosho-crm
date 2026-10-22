import { useState } from "react";

import { Loader2 } from "@/components/icons/appIcons";
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
import { dayMonth, kyivDay } from "@/features/orders/kyivDate";
import type { OrderPurchase } from "@/features/orders/orderPurchases";

export type PurchaseReceiptDraft = { receivedOn: string; receivedQty: number; docKind: "waybill" | "act"; docNumber: string };

const DOC_KINDS = [
  { key: "waybill", label: "ВН" },
  { key: "act", label: "Акт виконаних послуг" },
] as const;

function ReceiptForm({
  purchase,
  saving,
  onClose,
  onConfirm,
}: {
  purchase: OrderPurchase;
  saving: boolean;
  onClose: () => void;
  onConfirm: (draft: PurchaseReceiptDraft) => Promise<boolean>;
}) {
  const today = kyivDay();
  const yesterday = kyivDay(1);
  const [receivedOn, setReceivedOn] = useState(purchase.receivedOn ?? today);
  const [qtyText, setQtyText] = useState(() => {
    const start = purchase.receivedQty ?? purchase.qty;
    return start != null ? String(start) : "";
  });
  const [docKind, setDocKind] = useState<"waybill" | "act">(purchase.receivedDocKind ?? "waybill");
  const [docNumber, setDocNumber] = useState(purchase.receivedDocNumber ?? "");

  const qty = Number(qtyText.replace(/\s/g, "").replace(",", "."));
  const qtyValid = qtyText.trim() !== "" && Number.isFinite(qty) && qty > 0;
  const dateInvalid = !receivedOn || receivedOn > today;
  const canSubmit = qtyValid && !dateInvalid && Boolean(docNumber.trim()) && !saving;
  const short = qtyValid && purchase.qty != null && qty < purchase.qty;
  const invoiceQty = purchase.qty != null ? [purchase.qty, purchase.unit].filter(Boolean).join(" ") : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">Отримано · {purchase.description}</DialogTitle>
        <DialogDescription>
          {[purchase.supplierName, purchase.supplierInvoiceNumber ? `рахунок № ${purchase.supplierInvoiceNumber}` : null, invoiceQty ? `у рахунку ${invoiceQty}` : null]
            .filter(Boolean)
            .join(" · ")}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="purchase-receipt-date">Дата отримання</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: today, label: `Сьогодні · ${dayMonth(today)}` },
              { key: yesterday, label: `Вчора · ${dayMonth(yesterday)}` },
            ].map((option) => (
              <Button
                key={option.key}
                type="button"
                size="xs"
                variant={receivedOn === option.key ? "primary" : "outline"}
                aria-pressed={receivedOn === option.key}
                onClick={() => setReceivedOn(option.key)}
              >
                {option.label}
              </Button>
            ))}
            <div className="w-40">
              <DateInput
                id="purchase-receipt-date"
                controlSize="sm"
                value={receivedOn}
                max={today}
                onChange={(event) => setReceivedOn(event.target.value)}
              />
            </div>
          </div>
          {receivedOn > today ? <div className="tone-text-warning text-xs">Дата отримання не може бути в майбутньому</div> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="purchase-receipt-qty">Отримано{purchase.unit ? `, ${purchase.unit}` : ""}</Label>
          <Input
            id="purchase-receipt-qty"
            inputMode="decimal"
            autoComplete="off"
            className="max-w-[160px]"
            value={qtyText}
            onChange={(event) => setQtyText(event.target.value)}
          />
          {short ? (
            <div className="tone-text-warning text-xs">Менше, ніж у рахунку — бухгалтерія побачить позначку «недовіз»</div>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Документ постачальника</div>
          <div className="flex flex-wrap gap-1.5">
            {DOC_KINDS.map((kind) => (
              <Button
                key={kind.key}
                type="button"
                size="xs"
                variant={docKind === kind.key ? "primary" : "outline"}
                aria-pressed={docKind === kind.key}
                onClick={() => setDocKind(kind.key)}
              >
                {kind.label}
              </Button>
            ))}
          </div>
          <Label htmlFor="purchase-receipt-doc" className="sr-only">
            Номер документа
          </Label>
          <Input
            id="purchase-receipt-doc"
            autoComplete="off"
            placeholder={docKind === "act" ? "№ акта" : "№ ВН"}
            value={docNumber}
            onChange={(event) => setDocNumber(event.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
          Не зараз
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={async () => {
            if (!canSubmit) return;
            if (await onConfirm({ receivedOn, receivedQty: qty, docKind, docNumber: docNumber.trim() })) onClose();
          }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {purchase.receivedOn ? "Зберегти" : "Підтвердити отримання"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Склад підтверджує отримання за документом постачальника; те саме віконце виправляє внесене. */
export function OrderPurchaseReceiptDialog({
  purchase,
  saving,
  onOpenChange,
  onConfirm,
}: {
  /** null — закрито. */
  purchase: OrderPurchase | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (purchase: OrderPurchase, draft: PurchaseReceiptDraft) => Promise<boolean>;
}) {
  return (
    <Dialog open={purchase !== null} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-[460px]">
        {purchase ? (
          <ReceiptForm
            key={purchase.id}
            purchase={purchase}
            saving={saving}
            onClose={() => onOpenChange(false)}
            onConfirm={(draft) => onConfirm(purchase, draft)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

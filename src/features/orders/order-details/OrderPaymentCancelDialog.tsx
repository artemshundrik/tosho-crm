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
import { CANCEL_REASONS, formatUah, type OrderPayment } from "@/features/orders/orderPayments";

const dayMonth = (iso: string) => {
  const [, month, day] = iso.split("-");
  return `${day}.${month}`;
};

/**
 * Скасування платежу з причиною (REQ-322#p26). Не видаляє: запис лишається в
 * історії закресленим. Після запуску скасувати можна, але запуск не відкочується.
 */
export function OrderPaymentCancelDialog({
  payment,
  nextStatusLabel,
  launched,
  saving,
  onOpenChange,
  onConfirm,
}: {
  payment: OrderPayment | null;
  /** Яким стане статус оплати без цього платежу. */
  nextStatusLabel: string;
  launched: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const open = payment !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (!next) setReason(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[440px]">
        {payment ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                Скасувати платіж {formatUah(payment.amount)} від {dayMonth(payment.paidAt)}?
              </DialogTitle>
              <DialogDescription>
                Запис лишиться в історії закресленим. Статус стане «{nextStatusLabel}», менеджер отримає сповіщення.
              </DialogDescription>
            </DialogHeader>
            {launched ? (
              <div className="tone-warning-subtle rounded-md border px-3 py-2 text-xs">
                Замовлення вже запущено — статус оплати зміниться, але запуск не відкочується.
              </div>
            ) : null}
            <div className="space-y-2">
              <div className="text-sm font-medium">Причина</div>
              <div className="flex flex-wrap gap-1.5">
                {CANCEL_REASONS.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="xs"
                    variant={reason === option ? "primary" : "outline"}
                    aria-pressed={reason === option}
                    onClick={() => setReason(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
                Не скасовувати
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!reason || saving}
                onClick={async () => {
                  if (!reason) return;
                  if (await onConfirm(reason)) {
                    setReason(null);
                    onOpenChange(false);
                  }
                }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Скасувати платіж
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { dayMonth, kyivDay } from "@/features/orders/kyivDate";
import { formatAmountInput } from "@/features/orders/order-details/OrderPaymentDialog";
import { formatUah, parseAmountInput } from "@/features/orders/orderPayments";
import type { OrderPurchase } from "@/features/orders/orderPurchases";

export type PurchasePayDraft = { paidOn: string; accountId: string; amount: number };

const purchaseLine = (p: OrderPurchase) =>
  [p.description, p.supplierName, p.supplierInvoiceNumber ? `№ ${p.supplierInvoiceNumber}` : null].filter(Boolean).join(" · ");

function PayForm({
  purchase,
  accounts,
  saving,
  onClose,
  onPay,
}: {
  purchase: OrderPurchase;
  accounts: Array<{ id: string; name: string }>;
  saving: boolean;
  onClose: () => void;
  onPay: (draft: PurchasePayDraft) => Promise<boolean>;
}) {
  const today = kyivDay();
  const yesterday = kyivDay(1);
  const invoiceAmount = purchase.amount ?? 0;
  const [paidOn, setPaidOn] = useState(today);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amountText, setAmountText] = useState(() => (invoiceAmount > 0 ? formatAmountInput(invoiceAmount) : ""));

  const amount = parseAmountInput(amountText);
  const dateInvalid = !paidOn || paidOn > today;
  const canSubmit = Boolean(amount) && !dateInvalid && Boolean(accountId) && !saving;
  const differs = amount !== null && Math.abs(amount - invoiceAmount) >= 0.005;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">Оплачено постачальнику</DialogTitle>
        <DialogDescription>{purchaseLine(purchase)}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="purchase-pay-date">Дата оплати</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: today, label: `Сьогодні · ${dayMonth(today)}` },
              { key: yesterday, label: `Вчора · ${dayMonth(yesterday)}` },
            ].map((option) => (
              <Button
                key={option.key}
                type="button"
                size="xs"
                variant={paidOn === option.key ? "primary" : "outline"}
                aria-pressed={paidOn === option.key}
                onClick={() => setPaidOn(option.key)}
              >
                {option.label}
              </Button>
            ))}
            <div className="w-40">
              <DateInput
                id="purchase-pay-date"
                controlSize="sm"
                value={paidOn}
                max={today}
                onChange={(event) => setPaidOn(event.target.value)}
              />
            </div>
          </div>
          {paidOn > today ? <div className="tone-text-warning text-xs">Дата оплати не може бути в майбутньому</div> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="purchase-pay-account">З якого рахунку</Label>
          {accounts.length === 0 ? (
            <div className="text-sm text-muted-foreground">Додайте гривневий рахунок у Фінансах</div>
          ) : (
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="purchase-pay-account">
                <SelectValue placeholder="Оберіть рахунок" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="purchase-pay-amount">Сума платежу</Label>
          <Input
            id="purchase-pay-amount"
            inputMode="decimal"
            autoComplete="off"
            className="font-semibold"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
          />
          {differs ? (
            <div className="tone-text-warning text-xs">Відрізняється від рахунку постачальника ({formatUah(invoiceAmount)})</div>
          ) : null}
          {purchase.vatMode === "no_vat" ? (
            <div className="text-xs text-muted-foreground">ФОП: у витрату йде фактично сплачене, без × 1,2</div>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">Витрата з'явиться у Фінансах у категорії «Закупки під замовлення».</p>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
          Не зараз
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={async () => {
            if (!amount || !canSubmit) return;
            if (await onPay({ paidOn, accountId, amount })) onClose();
          }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {amount ? `Оплачено ${formatUah(amount)}` : "Оплачено"}
        </Button>
      </DialogFooter>
    </>
  );
}

function CancelForm({
  purchase,
  saving,
  onClose,
  onCancel,
}: {
  purchase: OrderPurchase;
  saving: boolean;
  onClose: () => void;
  onCancel: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">
          Скасувати оплату{purchase.paidOn ? ` від ${dayMonth(purchase.paidOn)}` : ""}?
        </DialogTitle>
        <DialogDescription>
          {purchaseLine(purchase)}. Витрата зникне з Фінансів, рядок повернеться в «рахунок є».
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="purchase-cancel-reason">Причина</Label>
        <Textarea
          id="purchase-cancel-reason"
          rows={3}
          placeholder="Помилилися сумою, рахунком, датою…"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
          Не скасовувати
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={!trimmed || saving}
          onClick={async () => {
            if (trimmed && (await onCancel(trimmed))) onClose();
          }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Скасувати оплату
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Оплата рядка закупки й її скасування — дві форми одного віконця. Оплата
 * створює витрату у Фінансах одним RPC; скасування видаляє її з причиною.
 */
export function OrderPurchasePayDialog({
  target,
  accounts,
  saving,
  onOpenChange,
  onPay,
  onCancel,
}: {
  /** null — закрито. */
  target: { mode: "pay" | "cancel"; purchase: OrderPurchase } | null;
  accounts: Array<{ id: string; name: string }>;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onPay: (purchase: OrderPurchase, draft: PurchasePayDraft) => Promise<boolean>;
  onCancel: (purchase: OrderPurchase, reason: string) => Promise<boolean>;
}) {
  const close = () => onOpenChange(false);
  return (
    <Dialog open={target !== null} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-[460px]">
        {target?.mode === "pay" ? (
          <PayForm
            key={target.purchase.id}
            purchase={target.purchase}
            accounts={accounts}
            saving={saving}
            onClose={close}
            onPay={(draft) => onPay(target.purchase, draft)}
          />
        ) : target?.mode === "cancel" ? (
          <CancelForm
            key={target.purchase.id}
            purchase={target.purchase}
            saving={saving}
            onClose={close}
            onCancel={(reason) => onCancel(target.purchase, reason)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

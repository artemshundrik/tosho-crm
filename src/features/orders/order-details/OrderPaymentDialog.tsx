import { format, subDays } from "date-fns";
import { useMemo, useRef, useState } from "react";

import { Loader2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/picker-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  derivePaymentStatus,
  formatUah,
  parseAmountInput,
  paymentStatusLabel,
  paymentWarnings,
  quickAmounts,
  type OrderPayment,
} from "@/features/orders/orderPayments";

const amountFormat = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Число для поля суми: «49 680,00» звичайними пробілами — так його й друкують. */
export const formatAmountInput = (value: number) => amountFormat.format(value).replace(/[  ]/g, " ");

const dayMonth = (iso: string) => {
  const [, month, day] = iso.split("-");
  return `${day}.${month}`;
};

export type OrderPaymentDraft = { amount: number; paidAt: string; accountId: string; bankTxnRef: string | null };

/**
 * «Внести оплату» (REQ-322#p26): сума з підказками, дата, куди прийшло, №
 * платіжки. Попередження не блокують — бухгалтер бачить виписку, ми ні.
 */
export function OrderPaymentDialog({
  open,
  onOpenChange,
  orderNumber,
  invoiceLine,
  total,
  prePct,
  pre,
  paid,
  currentStatus,
  launched,
  payments,
  accounts,
  defaultAccountId,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  /** «Рахунок № 434 · AVANTI GROUP · 70/30». */
  invoiceLine: string;
  total: number;
  prePct: number | null;
  pre: number;
  paid: number;
  currentStatus: string;
  launched: boolean;
  payments: OrderPayment[];
  accounts: Array<{ id: string; name: string }>;
  defaultAccountId: string | null;
  saving: boolean;
  onSubmit: (draft: OrderPaymentDraft) => Promise<boolean>;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const chips = useMemo(() => quickAmounts(total, prePct, paid), [total, prePct, paid]);
  const amountRef = useRef<HTMLInputElement>(null);

  // Стан береться з пропсів при монтуванні: сторінка перемонтовує віконце
  // ключем на кожне відкриття, тож скидати поля ефектом не треба.
  const start = Math.round((paid < pre && pre > 0 ? pre - paid : Math.max(total - paid, 0)) * 100) / 100;
  const [mode, setMode] = useState(() => chips.find((chip) => chip.amount === start)?.key ?? "other");
  const [amountText, setAmountText] = useState(() => (start > 0 ? formatAmountInput(start) : ""));
  const [paidAt, setPaidAt] = useState(today);
  const [accountId, setAccountId] = useState<string>(() => defaultAccountId ?? accounts[0]?.id ?? "");
  const [ref, setRef] = useState("");

  const amount = parseAmountInput(amountText);
  const after = (amount ?? 0) + paid;
  const warnings = amount ? paymentWarnings({ amount, paid, total, pre, ref, payments }) : [];
  let afterLine = amount ? `Статус стане «${paymentStatusLabel(derivePaymentStatus(after, total, pre, currentStatus))}»` : "Вкажіть суму";
  if (amount && paid < pre && after >= pre && !launched) afterLine += " · запуск відкриється";
  const dateInvalid = !paidAt || paidAt > today;
  const canSubmit = Boolean(amount) && !dateInvalid && Boolean(accountId) && !saving;

  const submit = async () => {
    if (!amount || !canSubmit) return;
    const ok = await onSubmit({ amount, paidAt, accountId, bankTxnRef: ref.trim() || null });
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Внести оплату · {orderNumber}</DialogTitle>
          <DialogDescription>{invoiceLine}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="order-payment-amount">Сума</Label>
            <Input
              ref={amountRef}
              id="order-payment-amount"
              inputMode="decimal"
              autoComplete="off"
              className="text-base font-semibold"
              value={amountText}
              onChange={(event) => {
                setAmountText(event.target.value);
                setMode("other");
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <Button
                  key={chip.key}
                  type="button"
                  size="xs"
                  variant={mode === chip.key ? "primary" : "outline"}
                  aria-pressed={mode === chip.key}
                  onClick={() => {
                    setMode(chip.key);
                    if (chip.amount === null) {
                      setAmountText("");
                      amountRef.current?.focus();
                    } else {
                      setAmountText(formatAmountInput(chip.amount));
                    }
                  }}
                >
                  {chip.amount === null ? chip.label : `${chip.label} · ${formatAmountInput(chip.amount)}`}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="order-payment-date">Дата надходження</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: today, label: `Сьогодні · ${dayMonth(today)}` },
                { key: yesterday, label: `Вчора · ${dayMonth(yesterday)}` },
              ].map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  size="xs"
                  variant={paidAt === option.key ? "primary" : "outline"}
                  aria-pressed={paidAt === option.key}
                  onClick={() => setPaidAt(option.key)}
                >
                  {option.label}
                </Button>
              ))}
              <div className="w-40">
                <DateInput
                  id="order-payment-date"
                  controlSize="sm"
                  value={paidAt}
                  max={today}
                  onChange={(event) => setPaidAt(event.target.value)}
                />
              </div>
            </div>
            {paidAt > today ? <div className="tone-text-warning text-xs">Дата оплати не може бути в майбутньому</div> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="order-payment-account">Куди прийшло</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="order-payment-account">
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="order-payment-ref">
              № платіжки <span className="font-normal text-muted-foreground">· за бажанням</span>
            </Label>
            <Input id="order-payment-ref" autoComplete="off" value={ref} onChange={(event) => setRef(event.target.value)} />
          </div>

          {warnings.length > 0 ? (
            <div className="tone-warning-subtle space-y-1 rounded-md border px-3 py-2 text-xs">
              {warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
            <span className="min-w-[160px] flex-1 text-sm text-muted-foreground">{afterLine}</span>
            <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {amount ? `Внести ${formatUah(amount)}` : "Внести"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

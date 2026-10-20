import { useState } from "react";

import { HeroShell, SplitBar } from "@/components/app/bento";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_STATUS_SECTIONS } from "@/features/orders/config";
import {
  balanceDaysShort,
  buildOrderPaymentParts,
  getBalanceDue,
  getClosingDocumentRef,
} from "@/features/orders/orderLaunchPath";
import { formatUah, paymentHint, paymentKindLabel, type OrderPayment } from "@/features/orders/orderPayments";
import { formatOrderMoney, type DerivedOrderRecord } from "@/features/orders/orderRecords";
import { formatDayMonth, isCashLikePaymentMethod, isCashlessPaymentMethod, PAYMENT_METHOD_LABELS } from "@/features/orders/paymentRules";
import { toneBadgeClass, type Tone } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

/**
 * Строк доплати після відвантаження (REQ-322#p5): від дати ВН чи акта, яку
 * вносить бухгалтерія. Поки дати немає — лише умова «N днів від ВН».
 */
function BalanceDueLine({ record }: { record: DerivedOrderRecord }) {
  if (record.balanceTiming !== "after_shipment" || record.paymentStatus === "fully_paid") return null;
  const doc = getClosingDocumentRef(record);
  const short = doc.kind === "act" ? "акта" : "ВН";
  const due = getBalanceDue(record);
  if (!due) {
    if (!isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) return null;
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Доплата — {balanceDaysShort(record)} від дати {short}. Строк з'явиться, коли бухгалтерія внесе номер {short} з BAS.
      </p>
    );
  }
  const from = `${balanceDaysShort(record)} від ${short} ${doc.number ? `№ ${doc.number} ` : ""}${formatDayMonth(due.fromDate)}`;
  return (
    <p className={cn("mt-2 text-xs", due.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
      {due.overdue
        ? `Доплату прострочено: чекали до ${formatDayMonth(due.dueDate)}`
        : due.daysLeft === 0
          ? "Доплата — сьогодні останній день"
          : `Доплата до ${formatDayMonth(due.dueDate)}`}{" "}
      · {from}
    </p>
  );
}

const paymentStatusOption = (id: string) =>
  ORDER_STATUS_SECTIONS.find((section) => section.id === "payment")?.items.find((item) => item.id === id);

const enteredAt = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export type OrderPaymentLedger = {
  payments: OrderPayment[];
  paid: number;
  pre: number;
  /** Бухгалтерія: вносить, скасовує, бачить рахунок і № платіжки. */
  canEnter: boolean;
  /** Чому «Внести оплату» неактивна (валюта, немає рахунку); null — активна. */
  enterDisabledReason: string | null;
  checkRequested: boolean;
  onEnter: () => void;
  onCancel: (payment: OrderPayment) => void;
  onRequestCheck: (dueLabel: string, note: string) => void;
};

function PaymentRow({ payment, canEnter, onCancel }: { payment: OrderPayment; canEnter: boolean; onCancel: () => void }) {
  const cancelled = Boolean(payment.cancelledAt);
  const details = canEnter
    ? [payment.accountName, payment.bankTxnRef ? `№ ${payment.bankTxnRef}` : null, `внесено ${enteredAt(payment.createdAt)}`]
    : [paymentKindLabel(payment.kind), "внесла бухгалтерія"];
  return (
    <li className="flex items-start gap-2 py-1.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className={cn("flex items-baseline gap-2", cancelled && "text-muted-foreground line-through")}>
          <span className="font-semibold tabular-nums">{formatUah(payment.amount)}</span>
          <span className="text-xs text-muted-foreground">{formatDayMonth(payment.paidAt)}</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {cancelled ? `Скасовано: ${payment.cancelReason ?? "без причини"}` : details.filter(Boolean).join(" · ")}
        </div>
      </div>
      {canEnter && !cancelled ? (
        <Button type="button" size="xs" variant="textMuted" onClick={onCancel}>
          Скасувати
        </Button>
      ) : null}
    </li>
  );
}

/** «Замовник каже, що оплатив» (REQ-322#p26): менеджер просить бухгалтерію звірити виписку. */
function PaymentCheckDialog({
  open,
  dueLabel,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  dueLabel: string;
  onOpenChange: (open: boolean) => void;
  onSend: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Попросити бухгалтерію перевірити оплату</DialogTitle>
          <DialogDescription>Очікуємо: {dueLabel}. Бухгалтерія отримає сповіщення й звірить виписку.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Коли й звідки платили — за бажанням"
          rows={3}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Не зараз
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSend(note);
              setNote("");
              onOpenChange(false);
            }}
          >
            Надіслати
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Надійшло»: скільки внесено з загальної суми, список платежів і дія за роллю. */
function PaymentLedger({ record, ledger }: { record: DerivedOrderRecord; ledger: OrderPaymentLedger }) {
  const [checkOpen, setCheckOpen] = useState(false);
  const { payments, paid, pre, canEnter } = ledger;
  const total = Number(record.total) || 0;
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const sorted = [...payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const dueLabel = paid < pre ? `передоплата ${formatUah(pre - paid)}` : `доплата ${formatUah(Math.max(total - paid, 0))}`;

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Надійшло</span>
        <span className="tabular-nums">
          <span className="font-semibold">{formatUah(paid)}</span>
          <span className="text-muted-foreground"> з {formatUah(total)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-chart-1 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{paymentHint(paid, total, pre)}</p>
      {sorted.length > 0 ? (
        <ul className="mt-2 divide-y divide-border/60">
          {sorted.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} canEnter={canEnter} onCancel={() => ledger.onCancel(payment)} />
          ))}
        </ul>
      ) : null}
      {canEnter ? (
        <div className="mt-3">
          <Button type="button" className="w-full" disabled={Boolean(ledger.enterDisabledReason)} onClick={ledger.onEnter}>
            Внести оплату
          </Button>
          {ledger.enterDisabledReason ? (
            <p className="mt-1.5 text-center text-xs text-muted-foreground">{ledger.enterDisabledReason}</p>
          ) : null}
        </div>
      ) : record.paymentStatus !== "fully_paid" ? (
        <>
          <Button
            type="button"
            size="xs"
            variant="textPrimary"
            className="mt-2 px-0"
            disabled={ledger.checkRequested}
            onClick={() => setCheckOpen(true)}
          >
            {ledger.checkRequested ? "Запит надіслано" : "Замовник каже, що оплатив"}
          </Button>
          <PaymentCheckDialog
            open={checkOpen}
            dueLabel={dueLabel}
            onOpenChange={setCheckOpen}
            onSend={(note) => ledger.onRequestCheck(dueLabel, note)}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * Оплата в правій колонці: велике число, смуга «наперед / доплата», статус і
 * «Надійшло» — оплати, які внесла бухгалтерія (REQ-322#p26). Без `ledger`
 * (чернетка з прорахунку) — лише умови.
 */
export function OrderPaymentCard({ record, ledger }: { record: DerivedOrderRecord; ledger?: OrderPaymentLedger | null }) {
  const parts = buildOrderPaymentParts(record);
  const status = paymentStatusOption(record.paymentStatus);
  const tone = (status?.tone ?? "neutral") as Tone;
  const isCash = isCashLikePaymentMethod(record.paymentMethodId);

  return (
    <HeroShell
      className="p-4 sm:p-4"
      label={isCash ? `Оплата · ${PAYMENT_METHOD_LABELS[record.paymentMethodId].toLowerCase()}` : "Оплата"}
      value={formatOrderMoney(record.total, record.currency)}
      badge={
        <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold", toneBadgeClass[tone])}>
          {status?.label ?? record.paymentStatus}
        </span>
      }
    >
      <SplitBar
        className="mt-3"
        parts={parts.map((part, index) => ({
          key: part.key,
          label: part.label,
          weight: part.pct,
          valueText: formatOrderMoney(part.amount, record.currency),
          color: index === 0 ? "bg-chart-1" : "bg-chart-2",
        }))}
      />
      <BalanceDueLine record={record} />
      {ledger ? <PaymentLedger record={record} ledger={ledger} /> : null}
    </HeroShell>
  );
}

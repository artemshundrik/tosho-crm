import { useEffect, useState } from "react";

import type { OrderPaymentLedger } from "@/features/orders/order-details/OrderPaymentCard";
import { OrderPaymentCancelDialog } from "@/features/orders/order-details/OrderPaymentCancelDialog";
import { OrderPaymentDialog } from "@/features/orders/order-details/OrderPaymentDialog";
import { useOrderPayments } from "@/features/orders/order-details/useOrderPayments";
import { formatPaymentTermsChip, LAUNCHED_ORDER_STATUSES } from "@/features/orders/orderLaunchPath";
import { listOrderPaymentAccounts } from "@/features/orders/orderPaymentQueries";
import {
  derivePaymentStatus,
  paidTotal,
  paymentStatusLabel,
  prepaymentAmount,
  prepaymentPct,
  type OrderPayment,
} from "@/features/orders/orderPayments";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";

type PaymentAccounts = { accounts: Array<{ id: string; name: string }>; defaultId: string | null };

const NO_ACCOUNTS: PaymentAccounts = { accounts: [], defaultId: null };

/**
 * Усе про оплати на сторінці замовлення (REQ-322#p26) в одному місці: дані для
 * картки «Оплата», замок ручного статусу і віконця «Внести» / «Скасувати».
 * Сторінка лише кладе `ledger` у картку й `dialogs` у кінець розмітки.
 */
export function useOrderPaymentPanel({
  record,
  teamId,
  userId,
  canEnter,
  onChanged,
}: {
  record: DerivedOrderRecord | null;
  teamId: string | null | undefined;
  userId: string | null | undefined;
  /** Виписує рахунки (`canIssueOrderInvoice`) — та сама група вносить оплати. */
  canEnter: boolean;
  onChanged: () => void;
}) {
  const enabled = record?.source === "stored";
  const payments = useOrderPayments({ record, teamId, userId, enabled, onChanged });
  const [accounts, setAccounts] = useState<PaymentAccounts>(NO_ACCOUNTS);
  const [dialogKey, setDialogKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toCancel, setToCancel] = useState<OrderPayment | null>(null);

  const isForeignCurrency = record?.currency === "USD" || record?.currency === "EUR";
  const loadAccounts = canEnter && enabled && !isForeignCurrency;
  const quoteId = record ? (record.linkedQuoteId ?? record.id) : null;
  const legalEntityId = record?.ourLegalEntityId ?? null;

  useEffect(() => {
    if (!loadAccounts || !teamId || !quoteId) return;
    let active = true;
    listOrderPaymentAccounts(teamId, legalEntityId, quoteId)
      .then((result) => {
        if (active) setAccounts(result);
      })
      .catch(() => {
        if (active) setAccounts(NO_ACCOUNTS);
      });
    return () => {
      active = false;
    };
  }, [loadAccounts, teamId, quoteId, legalEntityId]);

  const paymentLocked = payments.payments.some((payment) => !payment.cancelledAt);
  if (!record || !enabled) return { ledger: null, paymentLocked, dialogs: null };

  const total = Number(record.total) || 0;
  const pre = prepaymentAmount(total, record);
  const paid = paidTotal(payments.payments);
  const launched = LAUNCHED_ORDER_STATUSES.has(record.orderStatus);

  const ledger: OrderPaymentLedger = {
    payments: payments.payments,
    paid,
    pre,
    canEnter,
    enterDisabledReason: isForeignCurrency
      ? "Валютні оплати — поки у Фінансах"
      : accounts.accounts.length === 0
        ? "Додайте рахунок у Фінансах"
        : null,
    checkRequested: payments.checkRequested,
    onEnter: () => {
      // Новий ключ — віконце збирає поля заново з поточних сум.
      setDialogKey((key) => key + 1);
      setDialogOpen(true);
    },
    onCancel: setToCancel,
    onRequestCheck: (dueLabel, note) => void payments.requestCheck(dueLabel, note),
  };

  const invoiceLine = [
    record.invoiceNumber ? `Рахунок № ${record.invoiceNumber}` : "Рахунок без номера",
    [record.customerName, record.customerTaxId].filter(Boolean).join(", "),
    formatPaymentTermsChip(record),
  ]
    .filter(Boolean)
    .join(" · ");

  const dialogs = canEnter ? (
    <>
      {dialogOpen ? (
        <OrderPaymentDialog
          key={dialogKey}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          orderNumber={record.quoteNumber}
          invoiceLine={invoiceLine}
          total={total}
          prePct={prepaymentPct(record) || null}
          pre={pre}
          paid={paid}
          currentStatus={record.paymentStatus}
          launched={launched}
          payments={payments.payments}
          accounts={accounts.accounts}
          defaultAccountId={accounts.defaultId}
          saving={payments.saving}
          onSubmit={payments.record}
        />
      ) : null}
      <OrderPaymentCancelDialog
        payment={toCancel}
        nextStatusLabel={
          toCancel ? paymentStatusLabel(derivePaymentStatus(paid - toCancel.amount, total, pre, record.paymentStatus)) : ""
        }
        launched={launched}
        saving={payments.saving}
        onOpenChange={(open) => {
          if (!open) setToCancel(null);
        }}
        onConfirm={(reason) => (toCancel ? payments.cancel(toCancel.id, reason) : Promise.resolve(false))}
      />
    </>
  ) : null;

  return { ledger, paymentLocked, dialogs };
}

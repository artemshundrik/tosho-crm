import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  cancelOrderPayment,
  listOrderPayments,
  recordOrderPayment,
  toOrderPaymentError,
  undoOrderPayment,
} from "@/features/orders/orderPaymentQueries";
import { formatUah, paymentStatusLabel, type OrderPayment } from "@/features/orders/orderPayments";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { logActivity } from "@/lib/activityLogger";
import { getCurrentUser } from "@/lib/currentUser";
import { buildUserNameFromMetadata, type UserNameMetadata } from "@/lib/userName";
import {
  notifyOrderPaymentCancelled,
  notifyOrderPaymentCheckRequested,
  notifyOrderPaymentRecorded,
} from "@/lib/workflowNotifications";

/** Подія для стрічки замовлення — у білому списку THREAD_EVENT_ACTIONS. */
export const ORDER_PAYMENT_EVENT = "order_payment";

/** Скільки чекаємо «Скасувати» в тості, перш ніж писати в стрічку й сповіщати. */
const FOLLOW_UP_DELAY_MS = 10_000;

async function currentUserName() {
  const user = await getCurrentUser();
  if (!user) return null;
  const name = buildUserNameFromMetadata(user.user_metadata as UserNameMetadata | undefined, user.email);
  return name.displayName || user.email || null;
}

const dayMonth = (iso: string) => {
  const [, month, day] = iso.split("-");
  return `${day}.${month}`;
};

type PendingFollowUp = { paymentId: string; timer: ReturnType<typeof setTimeout>; run: () => void };

/**
 * Оплати замовлення (REQ-322#p26). Запис іде одразу; рядок у стрічці й
 * сповіщення менеджеру — через 10 с, щоб «Скасувати» в тості прибрало помилку
 * без сліду. Пішла сторінка — відкладене виконується одразу.
 */
export function useOrderPayments({
  record,
  teamId,
  userId,
  enabled,
  onChanged,
}: {
  record: DerivedOrderRecord | null;
  teamId: string | null | undefined;
  userId: string | null | undefined;
  /** Лише збережене замовлення має оплати; чернетка з прорахунку — ні. */
  enabled: boolean;
  /** Перечитати замовлення: статус оплати міняє база. */
  onChanged: () => void;
}) {
  const orderId = enabled && record ? record.id : null;
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkRequested, setCheckRequested] = useState(false);
  const pending = useRef<PendingFollowUp[]>([]);
  const recordRef = useRef(record);
  recordRef.current = record;

  const flushPending = useCallback(() => {
    const queue = pending.current;
    pending.current = [];
    for (const item of queue) {
      clearTimeout(item.timer);
      item.run();
    }
  }, []);

  const reload = useCallback(async () => {
    if (!orderId) return;
    try {
      setPayments(await listOrderPayments(orderId));
    } catch (error) {
      toast.error(toOrderPaymentError(error).message);
    }
  }, [orderId]);

  useEffect(() => {
    setPayments([]);
    setCheckRequested(false);
    // Відкладене попереднього замовлення виконується одразу, а не наздоганяє нове.
    flushPending();
    if (!orderId) return;
    setLoading(true);
    void reload().finally(() => setLoading(false));
  }, [orderId, reload, flushPending]);

  useEffect(() => {
    window.addEventListener("pagehide", flushPending);
    return () => {
      window.removeEventListener("pagehide", flushPending);
      flushPending();
    };
  }, [flushPending]);

  const followUp = useCallback(
    async (current: DerivedOrderRecord, title: string, notify: (actorName: string | null) => Promise<void>) => {
      if (!teamId) return;
      try {
        const actorName = await currentUserName();
        await Promise.all([
          logActivity({
            teamId,
            action: ORDER_PAYMENT_EVENT,
            entityType: "orders",
            entityId: current.id,
            title,
            href: `/orders/production/${current.id}`,
            metadata: { quote_id: current.linkedQuoteId ?? current.id, order_id: current.id },
          }),
          notify(actorName),
        ]);
      } catch {
        toast.warning("Оплату збережено, але сповіщення не надіслалось — скажіть менеджеру самі.");
      }
    },
    [teamId]
  );

  const changed = useCallback(async () => {
    await reload();
    onChanged();
  }, [reload, onChanged]);

  const undo = useCallback(
    async (paymentId: string) => {
      const index = pending.current.findIndex((item) => item.paymentId === paymentId);
      if (index >= 0) {
        clearTimeout(pending.current[index].timer);
        pending.current.splice(index, 1);
      }
      try {
        await undoOrderPayment(paymentId);
        toast.success("Внесення скасовано");
      } catch (error) {
        toast.error(toOrderPaymentError(error).message);
      }
      await changed();
    },
    [changed]
  );

  const recordPayment = useCallback(
    async (input: { amount: number; paidAt: string; accountId: string; bankTxnRef: string | null }) => {
      const current = recordRef.current;
      if (!current || !orderId || saving) return false;
      setSaving(true);
      try {
        const result = await recordOrderPayment({ orderId, ...input });
        const amountLabel = formatUah(input.amount);
        const statusLabel = paymentStatusLabel(result.paymentStatus);
        const run = () => {
          // Менеджеру вже пішло «внесено» — «Скасувати» в тості лишив би хибне сповіщення.
          toast.dismiss(result.paymentId);
          void followUp(current, `Внесено оплату ${amountLabel} від ${dayMonth(input.paidAt)} · ${statusLabel}`, (actorName) =>
            notifyOrderPaymentRecorded({
              orderId: current.id,
              orderNumber: current.quoteNumber,
              amountLabel,
              statusLabel,
              managerUserId: current.managerUserId,
              actorUserId: userId ?? null,
              actorName,
            })
          );
        };
        const item: PendingFollowUp = {
          paymentId: result.paymentId,
          run,
          timer: setTimeout(() => {
            pending.current = pending.current.filter((entry) => entry !== item);
            run();
          }, FOLLOW_UP_DELAY_MS),
        };
        pending.current.push(item);
        toast.success(`Внесено ${amountLabel}`, {
          id: result.paymentId,
          description: `Статус: ${statusLabel}`,
          duration: FOLLOW_UP_DELAY_MS,
          action: { label: "Скасувати", onClick: () => void undo(result.paymentId) },
        });
        await changed();
        return true;
      } catch (error) {
        toast.error(toOrderPaymentError(error).message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [orderId, saving, followUp, userId, undo, changed]
  );

  const cancel = useCallback(
    async (paymentId: string, reason: string) => {
      const current = recordRef.current;
      const target = payments.find((payment) => payment.id === paymentId);
      if (!current || !target || saving) return false;
      setSaving(true);
      try {
        const result = await cancelOrderPayment(paymentId, reason);
        const amountLabel = formatUah(target.amount);
        const statusLabel = paymentStatusLabel(result.paymentStatus);
        toast.success(`Платіж ${amountLabel} скасовано`, { description: `Статус: ${statusLabel}` });
        void followUp(current, `Скасовано платіж ${amountLabel} від ${dayMonth(target.paidAt)}: ${reason}`, (actorName) =>
          notifyOrderPaymentCancelled({
            orderId: current.id,
            orderNumber: current.quoteNumber,
            amountLabel,
            statusLabel,
            reason,
            managerUserId: current.managerUserId,
            actorUserId: userId ?? null,
            actorName,
          })
        );
        await changed();
        return true;
      } catch (error) {
        toast.error(toOrderPaymentError(error).message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [payments, saving, followUp, userId, changed]
  );

  const requestCheck = useCallback(
    async (dueLabel: string, note: string) => {
      const current = recordRef.current;
      if (!current || !teamId) return;
      setCheckRequested(true);
      toast.success("Бухгалтерія перевірить надходження");
      await followUp(current, `Замовник каже, що оплатив: ${dueLabel}${note.trim() ? ` · ${note.trim()}` : ""}`, (actorName) =>
        notifyOrderPaymentCheckRequested({
          teamId,
          orderId: current.id,
          orderNumber: current.quoteNumber,
          dueLabel,
          note,
          actorUserId: userId ?? null,
          actorName,
        })
      );
    },
    [teamId, userId, followUp]
  );

  return { payments, loading, saving, record: recordPayment, undo, cancel, requestCheck, checkRequested };
}

import { useState } from "react";
import { toast } from "sonner";

import { getInvoiceContractBlocker } from "@/features/orders/orderDocumentRequirements";
import { formatOrderDate, formatOrderMoney, type DerivedOrderRecord } from "@/features/orders/orderRecords";
import {
  issueOrderInvoice,
  requestOrderInvoice,
  returnOrderInvoiceRequest,
  type OrderInvoicePatch,
} from "@/features/orders/orderInvoiceQueries";
import { logActivity } from "@/lib/activityLogger";
import { getCurrentUser } from "@/lib/currentUser";
import { buildUserNameFromMetadata, type UserNameMetadata } from "@/lib/userName";
import { notifyOrderInvoiceDecided, notifyOrderInvoiceRequested } from "@/lib/workflowNotifications";

/** Подія для стрічки замовлення — у білому списку THREAD_EVENT_ACTIONS. */
export const ORDER_INVOICE_EVENT = "order_invoice";

async function currentUserName() {
  const user = await getCurrentUser();
  if (!user) return null;
  const name = buildUserNameFromMetadata(user.user_metadata as UserNameMetadata | undefined, user.email);
  return name.displayName || user.email || null;
}

/**
 * Рядок у стрічці замовлення й сповіщення — услід за вже збереженим записом.
 * Їхній збій не відкочує стан, лише попереджає. Спільне для запиту, виписки,
 * повернення й виправлення рахунку (REQ-335).
 */
export async function followUpInvoiceEvent(
  record: DerivedOrderRecord,
  teamId: string,
  title: string,
  notify: (actorName: string | null) => Promise<void>
) {
  try {
    const actorName = await currentUserName();
    await Promise.all([
      logActivity({
        teamId,
        action: ORDER_INVOICE_EVENT,
        entityType: "orders",
        entityId: record.id,
        title,
        href: `/orders/production/${record.id}`,
        // Стрічка замовлення з прорахунку — це нитка прорахунку: події шукаються за quote_id.
        metadata: { quote_id: record.linkedQuoteId ?? record.id, order_id: record.id },
      }),
      notify(actorName),
    ]);
  } catch {
    toast.warning("Збережено, але сповіщення не надіслалось — скажіть колегам самі.");
  }
}

/**
 * Рахунок через бухгалтерію (REQ-322#p10): запит, виписка й повернення.
 * Запис у базу — головне; сповіщення й рядок у стрічці — услід, і їхній збій
 * не відкочує вже збережений стан, лише попереджає.
 */
export function useOrderInvoiceFlow({
  record,
  teamId,
  userId,
  onPatched,
}: {
  record: DerivedOrderRecord | null;
  teamId: string | null | undefined;
  userId: string | null | undefined;
  onPatched: (patch: OrderInvoicePatch) => void;
}) {
  const [busy, setBusy] = useState<"request" | "issue" | "return" | null>(null);

  const followUp = async (title: string, notify: (actorName: string | null) => Promise<void>) => {
    if (!record || !teamId) return;
    await followUpInvoiceEvent(record, teamId, title, notify);
  };

  const run = async (
    kind: "request" | "issue" | "return",
    write: () => Promise<OrderInvoicePatch>,
    after: (patch: OrderInvoicePatch) => Promise<void>,
    success: string
  ) => {
    if (!record || !teamId || busy) return false;
    // Без підписаного договору рахунок не просять і не виписують (REQ-322#p40).
    const contractBlocker = kind === "return" ? null : getInvoiceContractBlocker(record);
    if (contractBlocker) {
      toast.error(contractBlocker);
      return false;
    }
    setBusy(kind);
    try {
      const patch = await write();
      onPatched(patch);
      toast.success(success);
      void after(patch);
      return true;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти рахунок.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const request = () =>
    run(
      "request",
      () => requestOrderInvoice({ teamId: teamId!, orderId: record!.id }),
      () =>
        followUp("Попросив(ла) рахунок у бухгалтерії", (actorName) =>
          notifyOrderInvoiceRequested({
            teamId: teamId!,
            orderId: record!.id,
            orderNumber: record!.quoteNumber,
            customerName: record!.customerName,
            total: formatOrderMoney(record!.total, record!.currency),
            requesterName: actorName,
            actorUserId: userId,
          })
        ),
      "Запит рахунку надіслано в бухгалтерію"
    );

  const issue = (number: string, date: string) =>
    run(
      "issue",
      () => issueOrderInvoice({ teamId: teamId!, orderId: record!.id, number, date }),
      async (patch) => {
        const label = `№ ${patch.invoiceNumber} від ${formatOrderDate(patch.invoiceDate ?? date)}`;
        await followUp(`Виписав(ла) рахунок ${label}`, (actorName) =>
          notifyOrderInvoiceDecided({
            orderId: record!.id,
            orderNumber: record!.quoteNumber,
            decision: "issued",
            invoiceLabel: label,
            recipientUserIds: [patch.invoiceRequestedBy, record!.managerUserId],
            deciderName: actorName,
            actorUserId: userId,
          })
        );
      },
      "Рахунок виписано — менеджер отримає сповіщення"
    );

  const returnRequest = (note: string) =>
    run(
      "return",
      () => returnOrderInvoiceRequest({ teamId: teamId!, orderId: record!.id, note }),
      async (patch) => {
        await followUp(`Повернув(ла) запит рахунку: ${note.trim()}`, (actorName) =>
          notifyOrderInvoiceDecided({
            orderId: record!.id,
            orderNumber: record!.quoteNumber,
            decision: "returned",
            note,
            recipientUserIds: [patch.invoiceRequestedBy, record!.managerUserId],
            deciderName: actorName,
            actorUserId: userId,
          })
        );
      },
      "Запит повернено менеджеру"
    );

  return { busy, request, issue, returnRequest };
}

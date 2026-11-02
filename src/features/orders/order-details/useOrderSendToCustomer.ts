import { useState } from "react";
import { toast } from "sonner";

import { getSendToCustomerBlocker } from "@/features/orders/orderApprovals";
import {
  buildPaymentReminderText,
  buildSignatureReminderText,
  DISPATCH_CHANNEL_LABELS,
  DISPATCH_DOCUMENT_TITLES,
  dispatchStamp,
  getDocumentDispatchState,
  getInvoiceDue,
  getSendableDocuments,
  joinDocumentTitles,
  type DispatchChannel,
  type DispatchDocument,
  type OrderDocumentDispatch,
} from "@/features/orders/orderDocumentDispatch";
import { deleteOrderDispatches, recordOrderDispatches } from "@/features/orders/orderDocumentDispatchQueries";
import { resolveBreakdown } from "@/features/orders/orderLaunchPath";
import { formatOrderMoney, type DerivedOrderRecord } from "@/features/orders/orderRecords";
import { localTodayIso } from "@/features/orders/paymentRules";
import { logActivity } from "@/lib/activityLogger";
import { buildTelegramHref } from "@/lib/telegramContact";

/** Подія для стрічки замовлення — у білому списку THREAD_EVENT_ACTIONS. */
export const ORDER_DISPATCH_EVENT = "order_dispatch";

export type ReminderPurpose = "signature" | "payment";
export type ReminderChannel = Extract<DispatchChannel, "email" | "telegram" | "viber" | "whatsapp">;
/** Відкрите питання «Позначити надісланими?» після кнопки надсилання. */
export type MarkSentAsk = { channel: DispatchChannel; items: ReturnType<typeof getSendableDocuments> };

/** «067 123 45 67» → «380671234567» для wa.me; без номера — null. */
const whatsappNumber = (phone: string | null | undefined) => {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return `38${digits}`;
  return digits.length >= 11 ? digits : null;
};

const copyQuietly = (text: string) => {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
};

/** Відкрити месенджер чи пошту з готовим текстом. Відправляє менеджер сам. */
function openMessage(record: DerivedOrderRecord, channel: ReminderChannel | "telegram-share", text: string, subject: string) {
  if (channel === "email") {
    window.location.href = `mailto:${encodeURIComponent(record.contactEmail || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    return;
  }
  if (channel === "viber") {
    window.location.href = `viber://forward?text=${encodeURIComponent(text)}`;
    return;
  }
  if (channel === "whatsapp") {
    const number = whatsappNumber(record.contactPhone);
    window.open(`https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    return;
  }
  // Чат із контактом текст не приймає — текст у буфері, вставити одним натиском.
  const directHref = channel === "telegram" ? buildTelegramHref(record.contactTelegram) : null;
  if (directHref) {
    copyQuietly(text);
    toast.message("Текст скопійовано — вставте в чат");
    window.open(directHref, "_blank", "noopener,noreferrer");
    return;
  }
  window.open(`https://t.me/share/url?url=&text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

/**
 * Надіслати замовнику (REQ-343#p2, p5, p11). Кнопки пошти й месенджерів лише
 * відкривають чернетку — тому після них питаємо, що саме пішло, і пишемо факт
 * із каналом і відбитком документа. «Нагадати» відкриває готовий текст і одразу
 * записує «нагадали». Нічого з цього не блокує запуск.
 */
export function useOrderSendToCustomer({
  record,
  teamId,
  onRecordPatch,
}: {
  record: DerivedOrderRecord | null;
  teamId: string | null | undefined;
  onRecordPatch: (patch: (current: DerivedOrderRecord) => DerivedOrderRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<MarkSentAsk | null>(null);

  const addDispatches = (items: OrderDocumentDispatch[]) =>
    onRecordPatch((current) => ({ ...current, documentDispatches: [...items, ...current.documentDispatches] }));

  const logEvent = (title: string) => {
    if (!record || !teamId) return;
    void logActivity({
      teamId,
      action: ORDER_DISPATCH_EVENT,
      entityType: "orders",
      entityId: record.id,
      title,
      href: `/orders/production/${record.id}`,
      metadata: { quote_id: record.linkedQuoteId ?? record.id, order_id: record.id },
    }).catch(() => undefined);
  };

  const write = async (
    event: OrderDocumentDispatch["event"],
    channel: DispatchChannel | null,
    documents: DispatchDocument[],
    note?: string
  ) => {
    if (!record || !teamId || documents.length === 0) return null;
    setBusy(true);
    try {
      const rows = await recordOrderDispatches({
        teamId,
        orderId: record.id,
        event,
        channel,
        note,
        documents: documents.map((document) => ({ document, stamp: dispatchStamp(record, document) })),
      });
      addDispatches(rows);
      return rows;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Не вдалося зберегти позначку.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  // Договір і СП — замовнику лише після погодження бухгалтера або СЕО (REQ-322#p6).
  const guard = () => {
    const blocker = record ? getSendToCustomerBlocker(record) : null;
    if (blocker) toast.error(blocker);
    return !blocker;
  };

  const askToMark = (channel: DispatchChannel) => {
    // Незбережене замовлення ще не має рядка в базі — позначку вішати нікуди.
    if (!record || record.source !== "stored") return;
    const items = getSendableDocuments(record);
    if (items.length > 0) setAsk({ channel, items });
  };

  const openEmailDraft = () => {
    if (!record || !guard()) return;
    const body = [
      `Вітаю.`,
      ``,
      `Надсилаємо документи по замовленню ${record.quoteNumber}.`,
      `Замовник: ${record.customerName}`,
      `Сума: ${formatOrderMoney(record.total, record.currency)}`,
      ``,
      `Документи можна сформувати зі сторінки замовлення: Договір, СП, Рахунок, Техкарта.`,
    ].join("\n");
    openMessage(record, "email", body, `Документи по замовленню ${record.quoteNumber}`);
    askToMark("email");
  };

  const openTelegramDraft = () => {
    if (!record || !guard()) return;
    const directHref = buildTelegramHref(record.contactTelegram);
    if (directHref) window.open(directHref, "_blank", "noopener,noreferrer");
    else
      openMessage(
        record,
        "telegram-share",
        `Документи по замовленню ${record.quoteNumber}\n${record.customerName}\nСума: ${formatOrderMoney(record.total, record.currency)}`,
        ""
      );
    askToMark("telegram");
  };

  const openViberDraft = () => {
    if (!record || !guard()) return;
    openMessage(
      record,
      "viber",
      `Документи по замовленню ${record.quoteNumber}. ${record.customerName}. Сума: ${formatOrderMoney(record.total, record.currency)}`,
      ""
    );
    askToMark("viber");
  };

  /** «Надіслано іншим шляхом» — передали з рук у руки, з особистої пошти тощо. */
  const markSentOther = () => {
    if (!record || !guard()) return;
    const items = record ? getSendableDocuments(record) : [];
    if (items.length === 0) {
      toast.message("Надсилати поки нічого: договір і СП ще не погоджено, рахунку немає");
      return;
    }
    setAsk({ channel: "other", items });
  };

  const confirmMark = async (documents: DispatchDocument[]) => {
    if (!ask) return;
    const rows = await write("sent", ask.channel, documents);
    if (!rows) return;
    setAsk(null);
    const what = joinDocumentTitles(documents);
    toast.success(`Позначено: ${what} надіслано ${DISPATCH_CHANNEL_LABELS[ask.channel]}`);
    logEvent(`Надіслав(ла) замовнику ${what} ${DISPATCH_CHANNEL_LABELS[ask.channel]}`);
  };

  /** Що саме нагадуємо: надіслані й непідписані договір/СП або надісланий неоплачений рахунок. */
  const reminderDocuments = (purpose: ReminderPurpose): DispatchDocument[] => {
    if (!record) return [];
    const kinds: DispatchDocument[] = purpose === "payment" ? ["invoice"] : ["contract", "specification"];
    return kinds.filter((document) => getDocumentDispatchState(record, document).state === "sent");
  };

  const remind = async (purpose: ReminderPurpose, channel: ReminderChannel) => {
    if (!record) return;
    const documents = reminderDocuments(purpose);
    if (documents.length === 0) return;
    const firstSent = getDocumentDispatchState(record, documents[0]);
    let text: string;
    if (purpose === "payment") {
      const due = getInvoiceDue(
        {
          invoiceNumber: record.invoiceNumber,
          invoiceDate: record.invoiceDate,
          invoiceCreatedAt: record.invoiceCreatedAt,
          prepaymentPct: resolveBreakdown(record)?.prepayment ?? null,
          balanceTiming: record.balanceTiming,
          paymentStatus: record.paymentStatus,
        },
        localTodayIso()
      );
      text = buildPaymentReminderText({
        invoiceNumber: record.invoiceNumber ?? "",
        invoiceDate: record.invoiceDate,
        amount: formatOrderMoney(record.total, record.currency),
        dueDate: due?.dueDate ?? null,
      });
    } else {
      text = buildSignatureReminderText({
        orderNumber: record.quoteNumber,
        documents,
        sentAt: firstSent.state === "sent" ? firstSent.sent.createdAt : null,
      });
    }
    openMessage(record, channel, text, `Нагадування: замовлення ${record.quoteNumber}`);
    const rows = await write("reminded", channel, documents);
    if (!rows) return;
    logEvent(`Нагадав(ла) замовнику про ${purpose === "payment" ? "оплату" : `підпис: ${joinDocumentTitles(documents)}`}`);
  };

  /** Замовник повернув з правками — хід знову наш (p5). */
  const markReturned = async (document: DispatchDocument, note: string) => {
    const rows = await write("customer_returned", null, [document], note);
    if (!rows) return false;
    toast.success(`Позначено: замовник повернув ${DISPATCH_DOCUMENT_TITLES[document]} з правками`);
    logEvent(`Замовник повернув ${DISPATCH_DOCUMENT_TITLES[document]} з правками: ${note.trim()}`);
    return true;
  };

  /** Прибрати свою помилкову позначку. */
  const undo = async (dispatch: OrderDocumentDispatch) => {
    setBusy(true);
    try {
      const removed = await deleteOrderDispatches([dispatch.id]);
      if (removed === 0) throw new Error("Прибрати можна лише свою позначку.");
      onRecordPatch((current) => ({
        ...current,
        documentDispatches: current.documentDispatches.filter((item) => item.id !== dispatch.id),
      }));
      toast.success("Позначку прибрано");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Не вдалося прибрати позначку.");
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    ask,
    closeAsk: () => setAsk(null),
    confirmMark,
    openEmailDraft,
    openTelegramDraft,
    openViberDraft,
    markSentOther,
    remind,
    reminderDocuments,
    markReturned,
    undo,
  };
}

export type OrderSendToCustomer = ReturnType<typeof useOrderSendToCustomer>;

import { useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { BellRing, ChevronDown, Mail, Phone, Send, Undo2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { resolveBreakdown } from "@/features/orders/orderLaunchPath";
import {
  DISPATCH_CHANNEL_LABELS,
  DISPATCH_DOCUMENT_TITLES,
  formatDispatchDay,
  formatSentNote,
  getDocumentDispatchState,
  getInvoiceDue,
  type DispatchDocument,
  type OrderDocumentDispatch,
} from "@/features/orders/orderDocumentDispatch";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { localTodayIso } from "@/features/orders/paymentRules";
import { cn } from "@/lib/utils";

import type { OrderSendToCustomer, ReminderChannel, ReminderPurpose } from "./useOrderSendToCustomer";

const linkButton =
  "text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground disabled:opacity-50";

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** «Замовник повернув з правками» — що саме просить змінити (p5). */
function ReturnedPopover({ document, send }: { document: DispatchDocument; send: OrderSendToCustomer }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setNote("");
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" disabled={send.busy} className={linkButton}>
          Повернули з правками
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-3">
        <div className="text-sm font-medium">Що замовник просить змінити в {DISPATCH_DOCUMENT_TITLES[document]}?</div>
        <Textarea
          autoFocus
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Напр.: інша адреса доставки, змінити термін оплати"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={send.busy || !note.trim()}
            onClick={async () => {
              if (await send.markReturned(document, note)) setOpen(false);
            }}
          >
            Позначити
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UndoButton({ dispatch, send }: { dispatch: OrderDocumentDispatch; send: OrderSendToCustomer }) {
  return (
    <button
      type="button"
      disabled={send.busy}
      title="Прибрати помилкову позначку"
      onClick={() => void send.undo(dispatch)}
      className={cn(linkButton, "inline-flex items-center gap-0.5")}
    >
      <Undo2 className="h-3 w-3" />
      Прибрати
    </button>
  );
}

/**
 * Рядок «надіслано / нагадали / повернули» під документом (REQ-343#p2, p5, p13).
 * Для рахунку — ще й строк: дійсний 5 робочих днів з дати рахунку.
 */
export function DispatchLine({
  record,
  document,
  send,
}: {
  record: DerivedOrderRecord;
  document: DispatchDocument;
  send: OrderSendToCustomer;
}) {
  const { userId } = useAuth();
  const dispatch = getDocumentDispatchState(record, document);
  if (dispatch.state === "none" || dispatch.state === "notReady") return null;
  const today = localTodayIso();
  const due =
    document === "invoice"
      ? getInvoiceDue(
          {
            invoiceNumber: record.invoiceNumber,
            invoiceDate: record.invoiceDate,
            invoiceCreatedAt: record.invoiceCreatedAt,
            prepaymentPct: resolveBreakdown(record)?.prepayment ?? null,
            balanceTiming: record.balanceTiming,
            paymentStatus: record.paymentStatus,
          },
          today
        )
      : null;
  const mine = (item: OrderDocumentDispatch) => Boolean(userId) && item.createdBy === userId;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs">
      {dispatch.state === "unsent" ? (
        <span className="tone-text-warning inline-flex items-center gap-1 font-medium">
          <Send className="h-3 w-3" />
          Ще не надіслано замовнику
        </span>
      ) : dispatch.state === "sent" ? (
        <span className="text-muted-foreground">
          {capitalize(
            formatSentNote(dispatch, today, {
              lead: `надіслано ${DISPATCH_CHANNEL_LABELS[dispatch.sent.channel ?? "other"]}`,
            })
          )}
        </span>
      ) : (
        <span className="tone-text-warning font-medium">
          Замовник повернув з правками {formatDispatchDay(dispatch.returned.createdAt)}
          {dispatch.returned.note ? `: ${dispatch.returned.note}` : ""}
        </span>
      )}
      {due ? (
        <span
          className={cn(
            due.overdue ? "tone-text-danger font-medium" : due.warning ? "tone-text-warning font-medium" : "text-muted-foreground"
          )}
        >
          {due.overdue ? `Рахунок прострочено: був дійсний до ${formatDispatchDay(due.dueDate)}` : `Дійсний до ${formatDispatchDay(due.dueDate)}`}
        </span>
      ) : null}
      {dispatch.state === "sent" ? <ReturnedPopover document={document} send={send} /> : null}
      {dispatch.state === "sent" && mine(dispatch.sent) ? <UndoButton dispatch={dispatch.sent} send={send} /> : null}
      {dispatch.state === "returned" && mine(dispatch.returned) ? (
        <UndoButton dispatch={dispatch.returned} send={send} />
      ) : null}
    </div>
  );
}

const REMINDER_LABELS: Record<ReminderPurpose, string> = {
  signature: "Нагадати про підпис",
  payment: "Нагадати про оплату",
};

/**
 * «Нагадати замовнику» (p11): готовий текст у месенджері чи пошті — відправляє
 * менеджер сам; CRM записує «нагадали ДД.ММ». Видно, лише коли є що нагадувати.
 */
export function ReminderMenu({
  record,
  send,
  purpose,
}: {
  record: DerivedOrderRecord;
  send: OrderSendToCustomer;
  purpose: ReminderPurpose;
}) {
  if (send.reminderDocuments(purpose).length === 0) return null;
  const channels: Array<{ channel: ReminderChannel; label: string; icon: typeof Mail; disabled: boolean }> = [
    { channel: "viber", label: "Viber", icon: Phone, disabled: !record.contactPhone },
    { channel: "telegram", label: "Telegram", icon: Send, disabled: false },
    { channel: "whatsapp", label: "WhatsApp", icon: Phone, disabled: !record.contactPhone },
    { channel: "email", label: "Email", icon: Mail, disabled: !record.contactEmail },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={send.busy}>
          <BellRing className="mr-2 h-4 w-4" />
          {REMINDER_LABELS[purpose]}
          <ChevronDown className="ml-1 h-3 w-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {channels.map(({ channel, label, icon: Icon, disabled }) => (
          <DropdownMenuItem key={channel} disabled={disabled} onClick={() => void send.remind(purpose, channel)}>
            <Icon className="mr-2 h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

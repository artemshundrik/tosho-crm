import { useState } from "react";

import { Loader2 } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DISPATCH_CHANNEL_LABELS,
  DISPATCH_DOCUMENT_TITLES,
  formatDispatchDay,
  type DispatchDocument,
} from "@/features/orders/orderDocumentDispatch";

import type { MarkSentAsk, OrderSendToCustomer } from "./useOrderSendToCustomer";

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function MarkSentBody({ ask, flow }: { ask: MarkSentAsk; flow: OrderSendToCustomer }) {
  // Ще не надіслане й повернуте з правками — позначені одразу; уже надіслане — лише якщо надсилали знову.
  const [picked, setPicked] = useState<Set<DispatchDocument>>(
    () => new Set(ask.items.filter((item) => item.dispatch.state !== "sent").map((item) => item.document))
  );
  const toggle = (document: DispatchDocument, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(document);
      else next.delete(document);
      return next;
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">Позначити надісланими?</DialogTitle>
        <DialogDescription>
          {ask.channel === "other"
            ? "Передали з рук у руки, з особистої пошти чи інакше — позначте, що саме пішло замовнику."
            : `Чернетку відкрито ${DISPATCH_CHANNEL_LABELS[ask.channel]}. Що з цього ви надіслали? Від цієї дати рахуємо, скільки чекаємо замовника.`}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1">
        {ask.items.map(({ document, dispatch }) => (
          <label
            key={document}
            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/40"
          >
            <Checkbox checked={picked.has(document)} onCheckedChange={(value) => toggle(document, value === true)} />
            <span className="flex-1 text-sm font-medium">{capitalize(DISPATCH_DOCUMENT_TITLES[document])}</span>
            <span className="text-2xs text-muted-foreground">
              {dispatch.state === "sent"
                ? `уже надіслано ${formatDispatchDay(dispatch.sent.createdAt)}`
                : dispatch.state === "returned"
                  ? "повернули з правками"
                  : "ще не надіслано"}
            </span>
          </label>
        ))}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={flow.busy} onClick={flow.closeAsk}>
          Не надсилав
        </Button>
        <Button
          type="button"
          disabled={flow.busy || picked.size === 0}
          onClick={() => void flow.confirmMark(ask.items.map((item) => item.document).filter((document) => picked.has(document)))}
        >
          {flow.busy ? <Loader2 className="animate-spin" /> : null}
          Позначити
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Питання після кнопок «Надіслати замовнику» (REQ-343#p2). Кнопки лише
 * відкривають чернетку — чи пішов лист, CRM не знає, тож питаємо людину.
 */
export function OrderMarkSentDialog({ flow }: { flow: OrderSendToCustomer }) {
  return (
    <Dialog
      open={flow.ask !== null}
      onOpenChange={(next) => {
        if (!next && !flow.busy) flow.closeAsk();
      }}
    >
      <DialogContent className="max-w-[440px]">
        {flow.ask ? <MarkSentBody key={`${flow.ask.channel}:${flow.ask.items.length}`} ask={flow.ask} flow={flow} /> : null}
      </DialogContent>
    </Dialog>
  );
}

import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MIN_MARKUP_RATE } from "@/lib/quoteRuns";

/**
 * Одне вікно на дві дії: менеджер пояснює, чому просить нижче дна, погоджувач —
 * чому відхиляє (REQ-149, пункти p4 і p9).
 *
 * ПІДТВЕРДЖЕННЯ ПРОХОДИТЬ БЕЗ ВІКНА. Це основна дія, і зайвий крок на ній
 * привчав би клацати «ОК» не читаючи — тобто рівно знецінював би той підпис,
 * заради якого все й затіяно.
 */
export function QuoteMarkupDecisionDialog({
  mode,
  note,
  busy,
  onNoteChange,
  onCancel,
  onSubmit,
}: {
  mode: "request" | "reject" | null;
  note: string;
  busy: boolean;
  onNoteChange: (next: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const rejecting = mode === "reject";
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {rejecting ? "Відхилити накрутку" : `Погодження накрутки нижче ${MIN_MARKUP_RATE} %`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {rejecting
              ? "Число менеджера лишиться як є з міткою «відхилено» — автоматичного відкату до дна немає. Напишіть, чого бракує, щоб було з чим повернутись."
              : "Запит побачать двоє СЕО і головний бухгалтер; відповісти може будь-хто з них. До відповіді закриті лише КП клієнту й перехід у «Затверджено» — рахувати й зберігати можна далі."}
          </p>
          <div className="space-y-2">
            <Label className="text-sm">{rejecting ? "Причина" : "Пояснення"} (необов'язково)</Label>
            <Textarea
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder={
                rejecting
                  ? "Не бачу причини для такої ціни на цьому клієнті…"
                  : "Постійний клієнт, наступний тираж піде з нормальною накруткою…"
              }
              className="min-h-[88px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Скасувати
          </Button>
          <Button disabled={busy} onClick={onSubmit}>
            {rejecting ? "Відхилити" : "Надіслати на погодження"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Двері назовні, а не заборона роботи.
 *
 * Банер каже словами, ЩО саме замкнено: мовчазна сіра кнопка «Затвердити»
 * читалась би як поломка — і саме такі місця родять фіктивні числа «щоб пішло
 * далі» (TS-0826-0039).
 */
export function QuoteMarkupGateBanner({ blockingCount }: { blockingCount: number }) {
  if (blockingCount <= 0) return null;
  return (
    /*
      Рядком, а не плакатом (REQ-175#p52).

      Було: коробка з полем 14 px, значок у власній рамці 28×28 і два абзаци —
      заголовок 14 px та пояснення під ним. На повну ширину колонки це давало
      жовтий прямокутник заввишки 76 px над самим прорахунком, хоч сказати треба
      одне речення, і воно нічого не блокує в роботі.

      Тепер це та сама записка, що під ціною тиражу: жирний зачин, далі текст,
      значок 14 px без рамки. Один вигляд для всіх попереджень справи.
    */
    <div className="flex items-start gap-2 rounded-lg border border-warning-soft-border bg-warning-soft px-3 py-2 text-2xs leading-relaxed text-warning-copy">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <span className="font-semibold">КП клієнту й перехід у «Затверджено» замкнені.</span>{" "}
        {blockingCount === 1
          ? "Один тираж стоїть нижче дна "
          : `${blockingCount} тиражі стоять нижче дна `}
        {MIN_MARKUP_RATE} % — потрібне підтвердження СЕО або головного бухгалтера. Рахувати,
        редагувати й зберігати прорахунок це не заважає.
      </div>
    </div>
  );
}

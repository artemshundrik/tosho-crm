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
import { formatRatePercent, minMarkupRateFor, type QuoteDealType } from "@/lib/quoteDealType";

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
  dealType,
  approverLabel,
  onNoteChange,
  onCancel,
  onSubmit,
}: {
  mode: "request" | "reject" | null;
  note: string;
  busy: boolean;
  /** Дно цього прорахунку — заголовок має назвати те саме число, що й смуга. */
  dealType: QuoteDealType | null | undefined;
  /** Хто підписує: на поліграфії — ім'я однієї людини, на мерчі — ролі. */
  approverLabel?: string | null;
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
            {rejecting
              ? "Відхилити накрутку"
              : `Погодження накрутки нижче ${formatRatePercent(minMarkupRateFor(dealType))} %`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {rejecting
              ? "Число менеджера лишиться як є з міткою «відхилено» — автоматичного відкату до дна немає. Напишіть, чого бракує, щоб було з чим повернутись."
              : approverLabel?.trim()
                ? `Запит побачить ${approverLabel.trim()}; за її відсутності підписати може другий СЕО. До відповіді закриті лише КП клієнту й перехід у «Затверджено» — рахувати й зберігати можна далі.`
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

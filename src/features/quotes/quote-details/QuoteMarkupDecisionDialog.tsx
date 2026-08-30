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
import { HoverTip } from "@/components/ui/hover-tip";

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
export type QuoteMarkupGateRun = {
  id: string;
  /** «Куртка софтшел чоловіча · 50 шт.» — щоб не шукати очима по всій сторінці. */
  label: string;
  /** «15,65 %» — уже відформатований відсоток. */
  rateLabel: string;
};

export function QuoteMarkupGateChip({ blocking }: { blocking: QuoteMarkupGateRun[] }) {
  const blockingCount = blocking.length;
  if (blockingCount <= 0) return null;
  return (
    /*
      ЗАМОК СТОЇТЬ БІЛЯ СТАТУСУ, А НЕ СМУГОЮ НАД СТОРІНКОЮ (REQ-175#p56).

      Попередження було жовтою смугою на всю ширину — і на широкому екрані це
      майже метр кольору заради одного речення, яке до того ж нічого не блокує в
      роботі. Тепер воно живе на тому, чого стосується: поруч зі статусом, у який
      людина впреться, коли натисне. Текст лишився повністю — під наведенням.
    */
    <HoverTip
      side="bottom"
      contentClassName="max-w-[320px] px-3 py-2 text-2xs leading-relaxed"
      label={
        <span>
          <span className="font-semibold text-foreground">
            КП клієнту й перехід у «Затверджено» замкнені.
          </span>{" "}
          {blockingCount === 1
            ? "Один тираж стоїть нижче дна "
            : `${blockingCount} тиражі стоять нижче дна `}
          {MIN_MARKUP_RATE} % — потрібне підтвердження СЕО або головного бухгалтера. Рахувати,
          редагувати й зберігати прорахунок це не заважає.
          {/*
            НАЗИВАЄМО ТИРАЖ ПОІМЕННО (REQ-175#p61).

            Лічильник без імені коштував Артему пошуків по всій сторінці: у
            прорахунку три товари по два тиражі, і «1 нижче дна» не каже, у
            котрому з шести. Він переглянув перший товар, побачив 20 і 22 % і
            вирішив, що лічильник бреше. Двері рахуються по ВСІХ тиражах
            навмисно (щоб «позначу інший» не був обхідним шляхом) — тим
            потрібніше сказати, по якому саме.
          */}
          <span className="mt-2 flex flex-col gap-1 border-t border-border/40 pt-2">
            {blocking.map((run) => (
              <span key={run.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{run.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {run.rateLabel}
                </span>
              </span>
            ))}
          </span>
        </span>
      }
    >
      <span className="inline-flex h-8 shrink-0 cursor-default items-center gap-1.5 rounded-lg border border-border/60 bg-muted px-2.5 text-2xs font-medium text-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0 text-warning-solid" />
        <span className="tabular-nums">{blockingCount}</span> нижче дна
      </span>
    </HoverTip>
  );
}

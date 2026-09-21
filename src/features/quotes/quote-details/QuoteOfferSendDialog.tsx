import { AlertTriangle, Download, FileDown, Loader2, Printer } from "@/components/icons/appIcons";

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
import { DateInput } from "@/components/ui/picker-input";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { cn } from "@/lib/utils";

import type { OfferFormat } from "./useQuoteOfferSend";

/**
 * Коротка форма надсилання пропозиції (REQ-296#p3).
 *
 * ПРЕВ'Ю — САМ ДОКУМЕНТ В IFRAME, а не його переказ розміткою. У наборах прев'ю
 * зібране вручну з React-компонентів, і воно рік розходилось із тим, що
 * друкується. Тут показуємо рівно той HTML, який поїде, зменшеним до ширини
 * колонки: розійтися нема з чим.
 *
 * ВІКНО ВІДКРИВАЄТЬСЯ ПОРОЖНІМ і наповнюється на очах — документ збирається
 * 6–10 секунд (див. `useQuoteOfferSend`).
 */

const FORMATS: Array<{ value: OfferFormat; label: string; hint: string }> = [
  {
    value: "pdf",
    label: "PDF",
    hint: "Готовий файл — можна одразу переслати замовнику.",
  },
  {
    value: "xlsx",
    label: "Excel",
    hint: "Таблиця з рядком на кожен тираж; числа лишаються числами, їх можна рахувати.",
  },
  { value: "print", label: "Друк", hint: "Одразу на принтер, без файла." },
];

const SUBMIT_LABEL: Record<OfferFormat, string> = {
  pdf: "Зберегти PDF",
  xlsx: "Завантажити Excel",
  print: "Друкувати",
};

const SUBMIT_ICON: Record<OfferFormat, typeof FileDown> = {
  pdf: FileDown,
  xlsx: Download,
  print: Printer,
};

export function QuoteOfferSendDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteNumber: string;
  customerName: string;
  building: boolean;
  error: string | null;
  previewHtml: string;
  format: OfferFormat;
  onFormatChange: (format: OfferFormat) => void;
  validUntil: string;
  onValidUntilChange: (value: string) => void;
  includeVisualizations: boolean;
  onIncludeVisualizationsChange: (value: boolean) => void;
  visualizationCount: number;
  itemsWithoutPhoto: number[];
  onSubmit: () => void;
}) {
  const activeFormat = FORMATS.find((item) => item.value === props.format) ?? FORMATS[0];
  const SubmitIcon = SUBMIT_ICON[props.format];
  const ready = !props.building && !props.error && Boolean(props.previewHtml);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        dismissible
        /* Фіксована висота, а не «по вмісту»: прев'ю — головне у вікні, і воно
           мусить мати місце. За вмістом вікно виходило на третину екрана, а
           документ було видно до другої позиції. */
        className="flex h-[min(860px,90vh)] w-[min(1080px,calc(100vw-32px))] max-w-[1080px] flex-col gap-0 overflow-hidden p-0 sm:p-0"
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-5 pr-14">
          <DialogTitle>Надіслати пропозицію</DialogTitle>
          <DialogDescription>
            {props.quoteNumber} · {props.customerName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-5 md:border-r md:border-border/60">
            {props.building ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Збираємо документ…
              </div>
            ) : null}
            {props.error ? (
              <div className="flex items-start gap-2 rounded-lg border border-danger-soft-border bg-danger-soft px-4 py-3 text-sm text-danger-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{props.error}</span>
              </div>
            ) : null}
            {ready ? (
              /* 794 px — ширина сторінки A4 у документі; масштабуємо її під
                 колонку, щоб прев'ю лишалось тим самим документом, а не його
                 вузькою версією. */
              <div className="min-h-[320px] flex-1 overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                <div className="h-full w-full origin-top-left scale-[0.72]" style={{ width: "139%", height: "139%" }}>
                  <iframe
                    title="Прев'ю пропозиції"
                    srcDoc={props.previewHtml}
                    sandbox=""
                    className="h-full w-full border-0 bg-white"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto p-5 md:w-[320px]">
            <div className="space-y-2">
              <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                Формат
              </div>
              <SegmentedGroup className="w-full">
                {FORMATS.map((item) => (
                  <Button
                    key={item.value}
                    variant="segmented"
                    size="xs"
                    aria-pressed={props.format === item.value}
                    onClick={() => props.onFormatChange(item.value)}
                    className={cn("flex-1")}
                  >
                    {item.label}
                  </Button>
                ))}
              </SegmentedGroup>
              <p className="text-xs leading-relaxed text-muted-foreground">{activeFormat.hint}</p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="offer-valid-until"
                className="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Пропозиція дійсна до
              </label>
              <DateInput
                id="offer-valid-until"
                className="h-9"
                value={props.validUntil}
                onChange={(event) => props.onValidUntilChange(event.target.value)}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Стане рядком у шапці документа. Порожнє — рядка не буде.
              </p>
            </div>

            {props.visualizationCount > 0 ? (
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <Checkbox
                  checked={props.includeVisualizations}
                  onCheckedChange={(value) => props.onIncludeVisualizationsChange(value === true)}
                  className="mt-0.5"
                />
                <span>
                  Візуалізації{" "}
                  <span className="text-muted-foreground">— {props.visualizationCount} шт.</span>
                </span>
              </label>
            ) : null}

            {props.itemsWithoutPhoto.length > 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-warning-soft-border bg-warning-soft px-3 py-2.5 text-xs leading-relaxed text-warning-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Без фото{" "}
                  {props.itemsWithoutPhoto.length === 1 ? "позиція" : "позиції"}{" "}
                  {props.itemsWithoutPhoto.join(", ")} — у документі стане плитка з літерами.
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 px-5 py-4">
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
            Скасувати
          </Button>
          <Button disabled={!ready} onClick={props.onSubmit}>
            <SubmitIcon className="mr-1.5 h-4 w-4" />
            {SUBMIT_LABEL[props.format]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

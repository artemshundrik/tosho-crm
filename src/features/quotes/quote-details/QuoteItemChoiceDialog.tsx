import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type QuoteItemChoiceRow = {
  id: string;
  title: string;
  qty: number;
  unit: string;
  lineTotal: number;
};

/**
 * «Що погодив клієнт» — питається РІВНО ОДИН раз, у мить переведення в
 * «Затверджено» (REQ-267#p1).
 *
 * ЧОМУ САМЕ ТУТ, А НЕ У ВІКНІ СТВОРЕННЯ ЗАМОВЛЕННЯ, де список позицій із
 * галочками вже був. Те вікно відкривають через дні після того, як клієнт
 * відповів, і до нього відповідь не доживає — її доводиться згадувати. Та сама
 * причина, з якої позначка погодженого тиражу свого часу стала колонкою, а не
 * галочкою в останньому кроці (scripts/quote-run-approved.sql).
 *
 * УСІ ГАЛОЧКИ СТОЯТЬ ЗА ЗАМОВЧУВАННЯМ, і це не лінощі. Прорахунок на три різні
 * товари, де клієнт узяв усі три, — найчастіший випадок; порожній список
 * змушував би клацати три галочки щоразу заради рідкісного. Заразом це робить
 * «просто натиснути Затвердити» точним дзеркалом сьогоднішньої поведінки.
 *
 * ЖОДНОЇ ГАЛОЧКИ — НЕ «ЗАТВЕРДЖЕНО». Прорахунок, від якого клієнт відмовився
 * цілком, це «Скасовано», а не затверджений на нуль гривень, тож кнопка тут
 * гасне з поясненням, а не пускає далі.
 */
export function QuoteItemChoiceDialog({
  open,
  items,
  selectedIds,
  busy,
  currencyFormatter,
  onToggle,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  items: QuoteItemChoiceRow[];
  selectedIds: string[];
  busy: boolean;
  /** Форматувальник сторінки — валюта прорахунку, а не глобальна гривня. */
  currencyFormatter: (value: number) => string;
  onToggle: (itemId: string, checked: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const selected = new Set(selectedIds);
  const declinedCount = items.length - selected.size;
  const approvedTotal = items.reduce(
    (sum, item) => (selected.has(item.id) ? sum + item.lineTotal : sum),
    0
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Що погодив клієнт?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            У прорахунку {items.length} позиції. Зніміть галочку з тих, від яких клієнт
            відмовився — вони лишаться на картці, але не підуть ні в підсумок, ні в
            замовлення.
          </p>

          <div className="space-y-2">
            {items.map((item) => {
              const checked = selected.has(item.id);
              return (
                <label
                  key={item.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors",
                    checked ? "border-border/50" : "border-border/30 bg-muted/20"
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={busy}
                    onCheckedChange={(value) => onToggle(item.id, Boolean(value))}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "text-sm font-medium",
                        /* Знята галочка гасить рядок ТУТ-ТАКИ, а не лише після
                           збереження: людина має бачити наслідок кліку в ту саму
                           мить, коли вирішує. */
                        checked ? "text-foreground" : "text-muted-foreground line-through"
                      )}
                    >
                      {item.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.qty.toLocaleString("uk-UA")} {item.unit} ·{" "}
                      {currencyFormatter(item.lineTotal)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm">
            {selected.size === 0 ? (
              <span className="text-destructive">
                Не обрано жодної позиції. Якщо клієнт відмовився від усього — це «Скасовано»,
                а не «Затверджено».
              </span>
            ) : (
              <span className="text-foreground">
                У замовлення піде {selected.size} із {items.length} на{" "}
                <span className="font-semibold">{currencyFormatter(approvedTotal)}</span>
                {declinedCount > 0 ? (
                  <span className="text-muted-foreground"> · не взяли {declinedCount}</span>
                ) : null}
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Скасувати
          </Button>
          <Button onClick={onSubmit} disabled={busy || selected.size === 0}>
            {busy ? "Зберігаємо..." : "Затвердити"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

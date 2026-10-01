import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { pluralUk } from "@/lib/lastSeen";
import { cn } from "@/lib/utils";

export type QuoteItemChoiceRunOption = {
  id: string;
  qty: number;
  lineTotal: number;
};

export type QuoteItemChoiceRow = {
  id: string;
  title: string;
  unit: string;
  /**
   * Тираж, що поїде в замовлення: погоджений або єдиний (`pickApprovedRun`).
   * `null` — тиражів кілька й жоден не позначений, тобто суми ще не існує.
   */
  run: QuoteItemChoiceRunOption | null;
  /** Варіанти тиражу за зростанням кількості; порожньо, коли тираж один. */
  runOptions: QuoteItemChoiceRunOption[];
  /** Тиражів кілька, а погодженого нема — без вибору позиція не береться. */
  needsRunChoice: boolean;
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
 * ГАЛОЧКА — ТЕ, ЩО ВЖЕ ПОГОДЖЕНО НА КАРТЦІ (REQ-317). Спершу тут стояли
 * галочки на всіх позиціях, і на TS-0926-0053 це відправило б у замовлення
 * кепку, на якій жоден із трьох тиражів не був позначений «Погодив клієнт», та
 * ще й за ціною відкритої вкладки. Правило — `isQuoteItemPreselected`: позиція
 * з одним тиражем чи з погодженим стоїть із галочкою (прорахунок на три різні
 * товари, де взяли всі, як і раніше затверджується одним натисканням), а де
 * тиражів кілька без позначки — ні.
 *
 * ТИРАЖ ОБИРАЮТЬ ТУТ-ТАКИ, а не «скасуйте, позначте на картці, поверніться».
 * Саме так Влад і пройшов той прорахунок — двома заходами. Перемикач у рядку
 * пише ту саму позначку тим самим шляхом, що й кнопка на картці, і заразом
 * ставить галочку: тираж обирають лише для того, що взяли. Галочку без тиражу
 * поставити не можна — сума в підсумку була б вигадана, а замовлення однаково
 * зупинилось би на блокері «Позначено тираж, який погодив клієнт».
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
  canPickRun,
  currencyFormatter,
  onToggle,
  onPickRun,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  items: QuoteItemChoiceRow[];
  selectedIds: string[];
  busy: boolean;
  /** Чи можна позначати тираж — ті самі права, що й у кнопки на картці. */
  canPickRun: boolean;
  /** Форматувальник сторінки — валюта прорахунку, а не глобальна гривня. */
  currencyFormatter: (value: number) => string;
  onToggle: (itemId: string, checked: boolean) => void;
  onPickRun: (itemId: string, runId: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const selected = new Set(selectedIds);
  const declinedCount = items.length - selected.size;
  const approvedTotal = items.reduce(
    (sum, item) => (selected.has(item.id) ? sum + (item.run?.lineTotal ?? 0) : sum),
    0
  );
  const pendingRunCount = items.filter((item) => item.needsRunChoice && !selected.has(item.id)).length;

  const describeRun = (item: QuoteItemChoiceRow) => {
    if (item.run) {
      return `${item.run.qty.toLocaleString("uk-UA")} ${item.unit} · ${currencyFormatter(item.run.lineTotal)}`;
    }
    if (item.needsRunChoice) {
      return canPickRun
        ? "Тираж не погоджено — оберіть, який узяв клієнт"
        : "Тираж не погоджено — позначити його може менеджер прорахунку";
    }
    return "Тиражу немає";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-[560px]"
        /* Фокус — на саме вікно, а не на перший доступний елемент. Галочка
           позиції без тиражу вимкнена, тож Radix віддавав фокус першому
           ТИРАЖУ, і один Enter «погоджував» клієнтові найменший тираж, якого
           ніхто не обирав (побачено в прев'ю, REQ-317). Прийом той самий, що
           в sheet.tsx. */
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Що погодив клієнт?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            У прорахунку {pluralUk(items.length, "позиція", "позиції", "позицій")}. Галочкою
            позначено те, що вже погоджено на картці; де тиражів кілька — оберіть той, що взяв
            клієнт. Решта лишиться на картці, але не піде ні в підсумок, ні в замовлення.
          </p>

          <div className="space-y-2">
            {items.map((item) => {
              const checked = selected.has(item.id);
              const lockedWithoutRun = item.needsRunChoice && !checked;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 transition-colors",
                    checked ? "border-border/50" : "border-border/30 bg-muted/20"
                  )}
                >
                  {/* Мітка обіймає лише галочку з назвою, а перемикач тиражів
                      стоїть ПОЗА нею: кнопки всередині <label> легко
                      перетворюють «обрав тираж» на «зняв галочку». */}
                  <label
                    className={cn(
                      "flex items-start gap-3",
                      lockedWithoutRun ? "cursor-default" : "cursor-pointer"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={busy || lockedWithoutRun}
                      onCheckedChange={(value) => onToggle(item.id, Boolean(value))}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "text-sm font-medium",
                          /* Знята галочка гасить рядок ТУТ-ТАКИ, а не лише після
                             збереження: людина має бачити наслідок кліку в ту саму
                             мить, коли вирішує. Позиція, що чекає на тираж, не
                             закреслюється — від неї ще не відмовились. */
                          checked
                            ? "text-foreground"
                            : lockedWithoutRun
                              ? "text-muted-foreground"
                              : "text-muted-foreground line-through"
                        )}
                      >
                        {item.title}
                      </div>
                      <div className="text-xs text-muted-foreground">{describeRun(item)}</div>
                    </div>
                  </label>
                  {item.runOptions.length > 0 ? (
                    <div className="mt-2 pl-7">
                      <SegmentedGroup
                        className={cn("max-w-full overflow-x-auto", SEGMENTED_GROUP_SM)}
                        aria-label={`Тираж, який погодив клієнт: ${item.title}`}
                      >
                        {item.runOptions.map((option) => {
                          const active = item.run?.id === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              className={cn(SEGMENTED_TRIGGER_SM, "whitespace-nowrap tabular-nums")}
                              data-state={active ? "active" : "inactive"}
                              aria-pressed={active}
                              disabled={busy || !canPickRun}
                              onClick={() => onPickRun(item.id, option.id)}
                            >
                              {option.qty.toLocaleString("uk-UA")} {item.unit}
                            </button>
                          );
                        })}
                      </SegmentedGroup>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm">
            {selected.size === 0 && pendingRunCount > 0 ? (
              <span className="text-foreground">
                Оберіть тираж, який погодив клієнт: без нього позиція не піде в замовлення.
              </span>
            ) : selected.size === 0 ? (
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

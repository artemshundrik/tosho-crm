import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RunSalePricing } from "@/lib/quoteRuns";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Перелік тиражів позиції — РЯДКАМИ НА ЖОРСТКІЙ СІТЦІ (REQ-155 p1).
 *
 * ЧОМУ НЕ ПІГУЛКИ, ЯК БУЛО. Пігулка «100 шт» показувала рівно одне число з
 * пʼяти, які потрібні, щоб обрати тираж: скільки, з чого складається
 * собівартість, яка накрутка, скільки виходить і по чому за штуку. Решту
 * доводилось діставати по одному кліку на кожен тираж — тобто порівняння двох
 * тиражів між собою було неможливе в принципі.
 *
 * ЧОМУ САМЕ GRID, А НЕ FLEX. Це не смак: бейдж «Погоджено клієнтом» ширший за
 * кнопку «Погодити» на добру сотню пікселів, і на flex-і поява бейджа зсувала
 * сусідні колонки — суми в стовпчику переставали стояти одна під одною рівно в
 * тому рядку, який щойно погодили. Колонка фіксованої ширини тримає місце
 * незалежно від того, що в ній зараз лежить.
 *
 * ШИРИНИ КОЛОНОК: 18px радіо · 88px кількість · решта опис · 184px рішення
 * клієнта · 152px сума. На вузькому екрані рядок розкладається на три яруси
 * (кількість і сума зверху, опис і рішення під ними) — сітка з пʼятьох колонок
 * у 360 px не влазить ніяк, а стовпчик сум там і не з чим вирівнювати.
 */

const num = (value: number, digits = 0) =>
  (Math.round(value * 100) / 100).toLocaleString("uk-UA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/**
 * Сума рядка — те саме число, що й у блоці ціни нижче, з точністю до копійки.
 * Округлення до гривні тут виглядало б як ІНШЕ число: рядок казав би «47 613»,
 * а блок під ним — «47 612,67». Копійки показуються лише тоді, коли вони є, —
 * як і в `formatCurrency` по всій картці.
 */
const amount = (value: number) => {
  const rounded = Math.round(value * 100) / 100 || 0;
  return num(rounded, Number.isInteger(rounded) ? 0 : 2);
};

export type QuoteRunRowsProps = {
  runs: QuoteRun[];
  /** Обраний тираж — саме його поля показані нижче в «Активному тиражі». */
  activeRunId?: string | null;
  /** «шт.», «компл.» — уже нормалізована одиниця позиції. */
  unitLabel: string;
  currency?: string | null;
  getPricing: (run: QuoteRun) => RunSalePricing;
  canAddRun: boolean;
  onSelect: (run: QuoteRun) => void;
  onAddRun: () => void;
};

export function QuoteRunRows({
  runs,
  activeRunId,
  unitLabel,
  currency,
  getPricing,
  canAddRun,
  onSelect,
  onAddRun,
}: QuoteRunRowsProps) {
  const currencyLabel = currency ?? "UAH";

  return (
    <div>
      <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-caps text-muted-foreground">
        Тиражі
      </div>

      <div role="radiogroup" aria-label="Тиражі позиції">
        {runs.map((run, runIndex) => {
          const qty = Number(run.quantity) || 0;
          const isSelected = !!run.id && run.id === activeRunId;
          const isApproved = run.is_approved === true;
          const pricing = getPricing(run);
          const priced = pricing.costTotal > 0;
          const modelPrice = Number(run.unit_price_model) || 0;
          const printPrice = Number(run.unit_price_print) || 0;
          const logistics = Number(run.logistics_cost) || 0;
          const markupRate = Math.round((Number(run.markup_rate) || 0) * 100) / 100;

          return (
            <div
              key={run.id ?? `run-row:${runIndex}`}
              role="radio"
              tabIndex={0}
              aria-checked={isSelected}
              onClick={() => onSelect(run)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect(run);
              }}
              className={cn(
                "grid cursor-pointer items-center gap-x-3 gap-y-1.5 rounded-xl border-b border-border/40 px-2 py-2.5 transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                "grid-cols-[1.125rem_minmax(0,1fr)_auto]",
                "md:grid-cols-[1.125rem_5.5rem_minmax(0,1fr)_11.5rem_9.5rem]"
              )}
            >
              <span
                className={cn(
                  "col-start-1 row-start-1 grid h-4 w-4 place-items-center rounded-full border",
                  isSelected ? "border-primary" : "border-border"
                )}
                aria-hidden
              >
                {isSelected ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
              </span>

              <span className="col-start-2 row-start-1 whitespace-nowrap">
                <span className="font-mono text-base font-bold tabular-nums text-foreground">{qty}</span>
                <span className="ml-1 text-2xs text-muted-foreground">{unitLabel}</span>
              </span>

              <span className="col-start-2 col-end-4 row-start-2 min-w-0 text-xs text-muted-foreground md:col-start-3 md:col-end-4 md:row-start-1 md:truncate">
                {priced ? (
                  <>
                    <span className="font-mono tabular-nums">
                      {num(modelPrice, 2)} + {num(printPrice, 2)}
                    </span>{" "}
                    /од · логістика <span className="font-mono tabular-nums">{num(logistics)}</span> ·
                    накрутка <span className="font-mono tabular-nums">{num(markupRate, 2)} %</span>
                  </>
                ) : (
                  "собівартість не внесена"
                )}
              </span>

              {/* Колонка рішення клієнта. Порожня — теж колонка: вона тримає
                  ширину, щоб сума праворуч не їздила туди-сюди. */}
              <span className="col-start-2 col-end-4 row-start-3 flex items-center justify-start md:col-start-4 md:col-end-5 md:row-start-1 md:justify-end">
                {isApproved ? (
                  <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border border-success-soft-border bg-success-soft px-2.5 text-2xs font-semibold text-success-foreground">
                    Погоджено клієнтом
                  </span>
                ) : null}
              </span>

              <span className="col-start-3 row-start-1 text-right md:col-start-5">
                {priced ? (
                  <>
                    <span className="font-mono text-base font-semibold tabular-nums text-foreground">
                      {amount(pricing.saleTotal)}
                    </span>
                    <span className="ml-1 text-2xs font-medium text-muted-foreground">{currencyLabel}</span>
                    <span className="block font-mono text-2xs tabular-nums text-muted-foreground">
                      {pricing.saleUnitPrice === null ? "—" : `${num(pricing.saleUnitPrice, 2)} /${unitLabel}`}
                    </span>
                  </>
                ) : (
                  <span className="text-base text-muted-foreground">—</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {canAddRun ? (
        <div className="mt-2 px-2">
          <button
            type="button"
            onClick={onAddRun}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border/70 px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Тираж
          </button>
        </div>
      ) : null}
    </div>
  );
}

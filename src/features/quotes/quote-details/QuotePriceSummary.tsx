import { AlertTriangle, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Підсумок прорахунку мовою «Витрат»: число → смуга часток → легенда.
 *
 * Заголовка немає навмисно. Підпис «Активний підсумок» над сумою в 26 px нічого
 * не додавав — число й так єдине, чим ця картка може бути, — але коштував рядок
 * у колонці, де кожен рядок віднімається від розмови.
 *
 * Жодна величина тут не рахується: усе приходить готовим із
 * `computeRunSalePricing`, компонент лише показує.
 */

export type PriceBreakdownPart = {
  key: string;
  label: string;
  value: number;
  /** Клас заливки з категоріальної палітри графіків (bg-chart-N). */
  color: string;
};

type QuotePriceSummaryProps = {
  /** Сума продажу, компактно (без копійок). */
  totalLabel: string;
  /** Та сама сума повністю — для підказки. */
  totalTitle: string;
  markupLabel: string | null;
  markupTitle: string;
  /** Частка надцінки в сумі продажу, напр. «24%». */
  markupShareLabel: string | null;
  /** Ставки різні між тиражами — єдиний випадок, коли її показуємо. */
  managerRateNeedsAttention: boolean;
  parts: PriceBreakdownPart[];
  managerRateLabel: string;
  formatFull: (value: number) => string;
  formatCompact: (value: number) => string;
  open: boolean;
  onToggle: () => void;
};

export function QuotePriceSummary({
  totalLabel,
  totalTitle,
  markupLabel,
  markupTitle,
  markupShareLabel,
  managerRateNeedsAttention,
  parts,
  managerRateLabel,
  formatFull,
  formatCompact,
  open,
  onToggle,
}: QuotePriceSummaryProps) {
  return (
    <section className="shrink-0 overflow-hidden rounded-inner border border-border/40 bg-card">
      <div className="p-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span
            className="font-mono text-[26px] font-semibold leading-none tabular-nums tracking-tight text-primary"
            title={totalTitle}
          >
            {totalLabel}
          </span>
          {markupLabel ? (
            // Надцінка — текст поруч із числом, а не бейдж під ним: це друга
            // величина того самого підсумку, а не наліпка.
            <span className="text-xs font-semibold tabular-nums text-success-foreground" title={markupTitle}>
              +{markupLabel}
              {markupShareLabel ? ` · ${markupShareLabel}` : ""}
            </span>
          ) : null}
          {managerRateNeedsAttention ? (
            <span
              className="tone-warning inline-flex items-center gap-1 rounded-full border px-1.5 text-3xs font-semibold"
              title={`Тиражі рахувались за різними ставками менеджера (${managerRateLabel})`}
            >
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
              ставки різні
            </span>
          ) : null}
          {parts.length > 0 ? (
            // Стрілка описує ДІЮ по кліку, а не стан: розгорнуто — вістря вгору
            // («згорнути»), згорнуто — вниз («показати ще»). Стоїть у рядку з
            // числом, бо окремою смугою під роздільником займала цілий рядок
            // колонки заради одного гліфа.
            <button
              type="button"
              onClick={onToggle}
              className="ml-auto grid h-6 w-6 shrink-0 self-center place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              aria-expanded={open}
              aria-label={open ? "Згорнути склад ціни" : "Показати склад ціни"}
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
                aria-hidden
              />
            </button>
          ) : null}
        </div>

        {open && parts.length > 0 ? (
          <>
            {/* `flexGrow` за величиною, `minWidth` щоб дрібна частка не зникла в
                нуль і смуга не брехала складом. */}
            <div className="mt-3 flex h-2.5 gap-[3px] overflow-hidden rounded-full">
              {parts.map((part) => (
                <span
                  key={`bar-${part.key}`}
                  className={cn("rounded-[2px]", part.color)}
                  style={{ flexGrow: part.value, flexBasis: 0, minWidth: 6 }}
                />
              ))}
            </div>
            <dl className="mt-2.5 grid gap-1">
              {parts.map((part) => (
                <div key={`legend-${part.key}`} className="flex items-baseline gap-2 text-xs">
                  <span
                    className={cn("h-2.5 w-2.5 shrink-0 translate-y-[1px] rounded-[3px]", part.color)}
                    aria-hidden
                  />
                  <dt className="text-muted-foreground">{part.label}</dt>
                  <dd className="ml-auto font-mono font-medium tabular-nums" title={formatFull(part.value)}>
                    {formatCompact(part.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
      </div>
    </section>
  );
}

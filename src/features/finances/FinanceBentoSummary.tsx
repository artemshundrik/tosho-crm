import * as React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatOrderMoney } from "@/features/orders/orderRecords";

// Bento-підсумок розділу Фінансів: велике число за період, дельта до попереднього
// місяця та пропорційна смуга «з чого складається» з легендою. Один компонент на
// всі розділи (Витрати, Виплати, Податки, Каси, Календар), щоб мова була спільною.

/** Категоріальні кольори кошиків — стабільні за порядком появи. */
export const BENTO_COLORS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-400",
  "bg-slate-400",
];

export type BentoBucket = {
  key: string;
  label: string;
  amount: number;
  /** tailwind bg-клас сегмента; статусні розділи (календар) передають свої. */
  color: string;
};

// «3» або «0,8» — модуль відсотка дельти: цілим від 10%, інакше з одним знаком.
const formatDeltaPct = (abs: number) => (abs >= 9.95 ? String(Math.round(abs)) : abs.toFixed(1).replace(".", ","));

export function FinanceBentoSummary({
  title,
  totalText,
  deltaPct,
  deltaVs,
  increaseIsGood = false,
  buckets,
  onBucketClick,
  footnote,
}: {
  /** Напр. «Разом за Липень 2026» — малим капсом над числом. */
  title: string;
  /** Відформатоване велике число (напр. «94 307 ₴»). */
  totalText: string;
  /** Δ% до попереднього періоду; null/undefined — бейдж не показуємо. */
  deltaPct?: number | null;
  /** Родовий відмінок періоду порівняння: «червня» → «+3% до червня». */
  deltaVs?: string;
  /** true — ріст це добре (баланси); false — ріст це витрати (за замовчуванням). */
  increaseIsGood?: boolean;
  /** Кошики смуги; нульові суми фільтрує той, хто викликає. */
  buckets: BentoBucket[];
  /** Клік по легенді (напр. скрол до секції). Без нього легенда — просто текст. */
  onBucketClick?: (key: string) => void;
  /** Дрібний рядок під смугою (напр. «Регулярна база: …»). */
  footnote?: React.ReactNode;
}) {
  const deltaBadge =
    deltaPct === null || deltaPct === undefined || !deltaVs ? null : Math.abs(deltaPct) < 0.5 ? (
      <span className="inline-flex items-center rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        ≈ рівень {deltaVs}
      </span>
    ) : (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums",
          (deltaPct > 0) === increaseIsGood
            ? "border-success-soft-border bg-success-soft text-success-foreground"
            : "border-destructive/25 bg-destructive/5 text-destructive"
        )}
      >
        {deltaPct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {deltaPct > 0 ? "+" : "−"}
        {formatDeltaPct(Math.abs(deltaPct))}% до {deltaVs}
      </span>
    );

  const legendItem = (b: BentoBucket) => (
    <>
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", b.color)} />
      <span className="text-muted-foreground">{b.label}</span>
      <span className="font-medium tabular-nums text-foreground">{formatOrderMoney(b.amount, "UAH")}</span>
    </>
  );

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="figure mt-1.5 text-2xl font-semibold leading-none text-foreground sm:text-[28px]">
            {totalText}
          </div>
        </div>
        {deltaBadge}
      </div>

      {buckets.length > 0 ? (
        <>
          {/* Смуга — частки пропорційні сумам; дрібні лишаються видимі завдяки minWidth */}
          <div className="mt-4 flex h-2.5 gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
            {buckets.map((b) => (
              <div
                key={b.key}
                className={cn("rounded-[2px]", b.color)}
                style={{ flexGrow: b.amount, flexBasis: 0, minWidth: 6 }}
                title={`${b.label} — ${formatOrderMoney(b.amount, "UAH")}`}
              />
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1">
            {buckets.map((b) =>
              onBucketClick ? (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => onBucketClick(b.key)}
                  title="Перейти до секції"
                  className="-mx-1 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-xs hover:bg-muted/50"
                >
                  {legendItem(b)}
                </button>
              ) : (
                <span key={b.key} className="inline-flex items-center gap-1.5 px-0 py-0.5 text-xs">
                  {legendItem(b)}
                </span>
              )
            )}
          </div>
        </>
      ) : null}

      {footnote ? (
        <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
          {footnote}
        </div>
      ) : null}
    </div>
  );
}

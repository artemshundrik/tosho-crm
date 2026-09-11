import { formatQuoteItemChoiceStamp } from "./useQuoteItemChoice";

/**
 * Смужка «Клієнт не взяв» над позицією, від якої відмовились (REQ-267#p1).
 *
 * ПОЗИЦІЯ ЛИШАЄТЬСЯ НА СТОРІНЦІ. Прибрати її означало б стерти те, що ми
 * пропонували, — а «покажи, що затвердили, а що ні» саме про це й просить.
 * Дата й ім'я тут не прикраса: питання «хто це вирішив» виникає рівно тоді,
 * коли з рішенням не згодні.
 */
export function QuoteItemDeclinedBanner({
  at,
  byLabel,
}: {
  at?: string | null;
  byLabel?: string | null;
}) {
  const stamp = formatQuoteItemChoiceStamp(at);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-border/50 bg-muted/40 px-4 py-1.5 text-xs">
      <span className="font-medium text-foreground">Клієнт не взяв</span>
      {stamp ? (
        <span className="text-muted-foreground">
          {stamp}
          {byLabel ? ` · ${byLabel}` : ""}
        </span>
      ) : null}
    </div>
  );
}

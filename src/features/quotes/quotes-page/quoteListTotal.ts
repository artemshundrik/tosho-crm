import { isQuoteItemIncluded, type QuoteItemChoice } from "@/lib/quoteItemApproval";
import {
  getRunSalePricingFromRun,
  normalizeQuoteRunRow,
  pickApprovedRun,
  type QuoteRunRowInput,
} from "@/lib/quoteRuns";

export type QuoteListTotal = {
  amount: number;
  /** Є позиція з кількома тиражами без позначки клієнта: amount — нижня межа. */
  partial: boolean;
};

/** Рядок по позиції для картки при наведенні: ті самі правила, що й сума. */
export type QuoteListLine = {
  id: string;
  /** Клієнт відмовився від позиції: у суму не входить, ціни немає. */
  declined: boolean;
  /** Тираж: погоджений, єдиний чи (коли не обрано) нижня межа; без тиражів — кількість позиції. */
  quantity: number | null;
  unit: string | null;
  /** Ціна продажу позиції з тиражу; `null` — даних немає. */
  amount: number | null;
  /** «від»: кілька тиражів, клієнт не обрав, `amount` — нижня межа. */
  partial: boolean;
};

export type QuoteListTotalItem = QuoteItemChoice & {
  id: string;
  qty?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  line_total?: number | null;
};

/**
 * Сума прорахунку для таблиці: та сама логіка, що в `buildCommercialDocument`.
 * Ціна продажу — з тиражів (`quote_item_runs`), а не з `quotes.total`, який
 * у свіжих прорахунках лишається нулем. Позиція без тиражів живе на копії з
 * `quote_items`. Позиції, від яких клієнт відмовився, у суму не входять —
 * правило з `quoteItemApproval`, як у підсумку картки й замовленні.
 * `null` — даних немає зовсім.
 */
export function computeQuoteListTotal(
  items: QuoteListTotalItem[],
  runs: QuoteRunRowInput[]
): QuoteListTotal | null {
  return computeQuoteListBreakdown(items, runs).total;
}

/** Сума й рядки по кожній позиції (у порядку `items`) за одними й тими самими правилами. */
export function computeQuoteListBreakdown(
  items: QuoteListTotalItem[],
  runs: QuoteRunRowInput[]
): { total: QuoteListTotal | null; lines: QuoteListLine[] } {
  // Один товар у прорахунку ⇒ йому належать усі тиражі (quote_item_id інколи null).
  // Рахується ДО відбору: відхилена позиція не робить єдину решту «одним товаром».
  const singleItem = items.length === 1;
  let amount = 0;
  let partial = false;
  let included = 0;
  const lines: QuoteListLine[] = [];
  for (const item of items) {
    const unit = item.unit ?? null;
    if (!isQuoteItemIncluded(item)) {
      lines.push({ id: item.id, declined: true, quantity: null, unit, amount: null, partial: false });
      continue;
    }
    included += 1;
    const itemRuns = (singleItem ? runs : runs.filter((run) => run.quote_item_id === item.id))
      .map(normalizeQuoteRunRow)
      .filter((run) => run.quantity > 0);
    if (itemRuns.length === 0) {
      const qty = Number(item.qty ?? 0) || 0;
      const unitPrice = Number(item.unit_price ?? 0) || 0;
      const lineAmount =
        item.line_total !== null && item.line_total !== undefined && Number.isFinite(Number(item.line_total))
          ? Number(item.line_total)
          : qty * unitPrice;
      amount += lineAmount;
      lines.push({ id: item.id, declined: false, quantity: qty > 0 ? qty : null, unit, amount: lineAmount > 0 ? lineAmount : null, partial: false });
      continue;
    }
    const picked = pickApprovedRun(itemRuns);
    if (picked) {
      const saleTotal = getRunSalePricingFromRun(picked).saleTotal;
      amount += saleTotal;
      lines.push({ id: item.id, declined: false, quantity: picked.quantity, unit, amount: saleTotal, partial: false });
    } else {
      partial = true;
      const cheapest = itemRuns.reduce((best, run) =>
        getRunSalePricingFromRun(run).saleTotal < getRunSalePricingFromRun(best).saleTotal ? run : best
      );
      const saleTotal = getRunSalePricingFromRun(cheapest).saleTotal;
      amount += saleTotal;
      lines.push({ id: item.id, declined: false, quantity: cheapest.quantity, unit, amount: saleTotal, partial: true });
    }
  }
  return { total: included > 0 && amount > 0 ? { amount, partial } : null, lines };
}

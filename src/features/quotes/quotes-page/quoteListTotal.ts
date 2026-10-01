import { filterIncludedQuoteItems, type QuoteItemChoice } from "@/lib/quoteItemApproval";
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

export type QuoteListTotalItem = QuoteItemChoice & {
  id: string;
  qty?: number | null;
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
  // Один товар у прорахунку ⇒ йому належать усі тиражі (quote_item_id інколи null).
  // Рахується ДО відбору: відхилена позиція не робить єдину решту «одним товаром».
  const singleItem = items.length === 1;
  const includedItems = filterIncludedQuoteItems(items);
  if (includedItems.length === 0) return null;
  let amount = 0;
  let partial = false;
  for (const item of includedItems) {
    const itemRuns = (singleItem ? runs : runs.filter((run) => run.quote_item_id === item.id))
      .map(normalizeQuoteRunRow)
      .filter((run) => run.quantity > 0);
    if (itemRuns.length === 0) {
      const qty = Number(item.qty ?? 0) || 0;
      const unitPrice = Number(item.unit_price ?? 0) || 0;
      amount +=
        item.line_total !== null && item.line_total !== undefined && Number.isFinite(Number(item.line_total))
          ? Number(item.line_total)
          : qty * unitPrice;
      continue;
    }
    const picked = pickApprovedRun(itemRuns);
    if (picked) {
      amount += getRunSalePricingFromRun(picked).saleTotal;
    } else {
      partial = true;
      amount += Math.min(...itemRuns.map((run) => getRunSalePricingFromRun(run).saleTotal));
    }
  }
  return amount > 0 ? { amount, partial } : null;
}

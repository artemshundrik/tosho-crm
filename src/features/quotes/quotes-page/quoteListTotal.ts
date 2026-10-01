import { getRunSalePricingFromRun, pickApprovedRun } from "@/lib/quoteRuns";
import type { QuoteRun } from "@/lib/toshoApi";

export type QuoteListTotal = {
  amount: number;
  /** Є позиція з кількома тиражами без позначки клієнта: amount — нижня межа. */
  partial: boolean;
};

export type QuoteListTotalItem = {
  id: string;
  qty?: number | null;
  unit_price?: number | null;
  line_total?: number | null;
};

export type QuoteListTotalRun = {
  id?: string | null;
  quote_item_id?: string | null;
  quantity?: number | null;
  unit_price_model?: number | null;
  unit_price_print?: number | null;
  logistics_cost?: number | null;
  markup_rate?: number | null;
  manager_rate?: number | null;
  fixed_cost_rate?: number | null;
  vat_rate?: number | null;
  is_approved?: boolean | null;
};

// Ті самі дефолти ставок, що в getQuoteRuns: рядок без ставки не дорівнює нулю.
const rate = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toQuoteRun = (run: QuoteListTotalRun): QuoteRun => ({
  id: run.id ?? undefined,
  quote_item_id: run.quote_item_id ?? null,
  quantity: Number(run.quantity ?? 0) || 0,
  unit_price_model: Number(run.unit_price_model ?? 0) || 0,
  unit_price_print: Number(run.unit_price_print ?? 0) || 0,
  logistics_cost: Number(run.logistics_cost ?? 0) || 0,
  desired_manager_income: 0,
  markup_rate: rate(run.markup_rate, 40),
  manager_rate: rate(run.manager_rate, 10),
  fixed_cost_rate: rate(run.fixed_cost_rate, 30),
  vat_rate: rate(run.vat_rate, 20),
  is_approved: run.is_approved === true,
});

/**
 * Сума прорахунку для таблиці: та сама логіка, що в `buildCommercialDocument`.
 * Ціна продажу — з тиражів (`quote_item_runs`), а не з `quotes.total`, який
 * у свіжих прорахунках лишається нулем. Позиція без тиражів живе на копії з
 * `quote_items`. `null` — даних немає зовсім.
 */
export function computeQuoteListTotal(
  items: QuoteListTotalItem[],
  runs: QuoteListTotalRun[]
): QuoteListTotal | null {
  if (items.length === 0) return null;
  let amount = 0;
  let partial = false;
  for (const item of items) {
    // Один товар у прорахунку ⇒ беремо всі тиражі (quote_item_id інколи null).
    const itemRuns = (items.length === 1 ? runs : runs.filter((run) => run.quote_item_id === item.id))
      .map(toQuoteRun)
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

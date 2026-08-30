// Серверне дзеркало продажної ціни прорахунку.
//
// ДЖЕРЕЛО ПРАВДИ — src/lib/quoteRuns.ts (computeRunSalePricing +
// getRunSalePricingFromRun). Тут та сама формула для Netlify-функцій, які не
// імпортують клієнтський код. Міняється формула там — правити і тут.
//
// ВАЖЛИВО: quotes.total і quote_items.unit_price — застарілі снапшоти й НЕ є
// реальною ціною. Рахувати завжди з quote_item_runs.

export type QuoteRunPricingRow = {
  quote_id?: string | null;
  quote_item_id?: string | null;
  quantity?: number | string | null;
  unit_price_model?: number | string | null;
  unit_price_print?: number | string | null;
  logistics_cost?: number | string | null;
  desired_manager_income?: number | string | null;
  markup_rate?: number | string | null;
  manager_rate?: number | string | null;
  fixed_cost_rate?: number | string | null;
  vat_rate?: number | string | null;
};

// Дзеркало DEFAULT_MARKUP_RATE із src/lib/quoteRuns.ts і DEFAULT колонки
// markup_rate. Рядок без накрутки означав би ціну, рівну собівартості.
//
// Ставок менеджера, постійних витрат і ПДВ тут більше немає: у формулі
// «накрутка на собівартість» вони не впливають на СУМУ ціни, лише на розподіл
// усередині націнки, а сервер рахує саме суму.
const DEFAULT_MARKUP_RATE = 40;

function num(value: number | string | null | undefined): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

function rate(value: number | string | null | undefined, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Продажна сума одного run-у: собівартість плюс накрутка на неї.
 *
 * З 30.08.2026 ціна задається НАКРУТКОЮ НА СОБІВАРТІСТЬ, а не бажаним
 * заробітком менеджера (рішення СЕО). Постійні витрати й податковий резерв
 * лежать усередині накрутки, тому тут вони й не з'являються: сума ціни від них
 * більше не залежить, від них залежить лише розподіл усередині націнки.
 */
export function runSaleTotal(run: QuoteRunPricingRow): number {
  const quantity = Math.max(0, num(run.quantity));
  const costTotal = (num(run.unit_price_model) + num(run.unit_price_print)) * quantity + num(run.logistics_cost);
  const markupRate = Math.max(0, rate(run.markup_rate, DEFAULT_MARKUP_RATE));

  return costTotal * (1 + markupRate / 100);
}

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
  manager_rate?: number | string | null;
  fixed_cost_rate?: number | string | null;
  vat_rate?: number | string | null;
};

// Ставки в БД можуть бути null (дефолти проставляє клієнт при записі рядка).
// Ті самі fallback-значення, що в scripts/backfill-quote-totals.mjs.
const DEFAULT_MANAGER_RATE = 10;
const DEFAULT_FIXED_COST_RATE = 30;
const DEFAULT_VAT_RATE = 20;

function num(value: number | string | null | undefined): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

function rate(value: number | string | null | undefined, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
}

/** Продажна сума одного run-у (собівартість + валовий прибуток + постійні + ПДВ). */
export function runSaleTotal(run: QuoteRunPricingRow): number {
  const quantity = Math.max(0, num(run.quantity));
  const costTotal = (num(run.unit_price_model) + num(run.unit_price_print)) * quantity + num(run.logistics_cost);

  const desiredManagerIncome = Math.max(0, num(run.desired_manager_income));
  const managerRate = rate(run.manager_rate, DEFAULT_MANAGER_RATE);
  const fixedCostRate = rate(run.fixed_cost_rate, DEFAULT_FIXED_COST_RATE);
  const vatRate = rate(run.vat_rate, DEFAULT_VAT_RATE);

  const grossProfit = managerRate > 0 ? desiredManagerIncome / (managerRate / 100) : 0;
  const fixedCosts = grossProfit * (fixedCostRate / 100);
  const vatAmount = (grossProfit + fixedCosts) * (vatRate / 100);

  return costTotal + grossProfit + fixedCosts + vatAmount;
}

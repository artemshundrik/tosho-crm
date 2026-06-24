import type { QuoteRun } from "@/lib/toshoApi";

export type QuoteRunDraftValue = {
  id?: string | null;
  quantity: number;
};

type MergeQuoteRunsParams = {
  existingRuns: QuoteRun[];
  nextRuns: QuoteRunDraftValue[];
  quoteId: string;
  quoteItemId: string;
  managerRate: number;
  defaultManagerRate: number;
  defaultFixedCostRate: number;
  defaultVatRate: number;
};

function resolveNumericRate(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type RunSalePricing = {
  costTotal: number;
  costPerUnit: number | null;
  requiredGrossProfit: number;
  fixedCosts: number;
  vatAmount: number;
  markupTotal: number;
  saleTotal: number;
  saleUnitPrice: number | null;
};

/**
 * Канонічна формула продажної ціни прорахунку (з націнкою): собівартість +
 * валовий прибуток (під бажаний дохід менеджера) + постійні витрати + ПДВ.
 * Єдине джерело правди для розрахунку — використовується і в калькуляторі прорахунку
 * (QuoteDetailsPage `getRunPricing`), і в КП (QuotesPage `buildCommercialDocument`).
 */
export function computeRunSalePricing(params: {
  quantity: number;
  costTotal: number;
  desiredManagerIncome: number;
  managerRate: number;
  fixedCostRate: number;
  vatRate: number;
}): RunSalePricing {
  const quantity = Math.max(0, Number(params.quantity) || 0);
  const costTotal = Number(params.costTotal) || 0;
  const costPerUnit = quantity > 0 ? costTotal / quantity : null;
  const desiredManagerIncome = Math.max(0, Number(params.desiredManagerIncome) || 0);
  const managerRate = Number(params.managerRate) || 0;
  const fixedCostRate = Number(params.fixedCostRate) || 0;
  const vatRate = Number(params.vatRate) || 0;
  const requiredGrossProfit = managerRate > 0 ? desiredManagerIncome / (managerRate / 100) : 0;
  const fixedCosts = requiredGrossProfit * (fixedCostRate / 100);
  const vatAmount = (requiredGrossProfit + fixedCosts) * (vatRate / 100);
  const markupTotal = requiredGrossProfit + fixedCosts + vatAmount;
  const saleTotal = costTotal + markupTotal;
  const saleUnitPrice = quantity > 0 ? saleTotal / quantity : null;
  return {
    costTotal,
    costPerUnit,
    requiredGrossProfit,
    fixedCosts,
    vatAmount,
    markupTotal,
    saleTotal,
    saleUnitPrice,
  };
}

/**
 * Продажна ціна для збереженого run-у — бере собівартість (model+print+логістика)
 * і ставки безпосередньо з самого run-у (вони вже дефолтяться у getQuoteRuns).
 */
export function getRunSalePricingFromRun(run: QuoteRun): RunSalePricing {
  const quantity = Math.max(0, Number(run.quantity) || 0);
  const model = Number(run.unit_price_model) || 0;
  const print = Number(run.unit_price_print) || 0;
  const logistics = Number(run.logistics_cost) || 0;
  const costTotal = (model + print) * quantity + logistics;
  return computeRunSalePricing({
    quantity,
    costTotal,
    desiredManagerIncome: Number(run.desired_manager_income) || 0,
    managerRate: Number(run.manager_rate) || 0,
    fixedCostRate: Number(run.fixed_cost_rate) || 0,
    vatRate: Number(run.vat_rate) || 0,
  });
}

export function mergeQuoteRunsWithExisting({
  existingRuns,
  nextRuns,
  quoteId,
  quoteItemId,
  managerRate,
  defaultManagerRate,
  defaultFixedCostRate,
  defaultVatRate,
}: MergeQuoteRunsParams) {
  const normalizedExistingRuns = existingRuns.filter((run) => Number(run.quantity) > 0);
  const existingById = new Map(
    normalizedExistingRuns
      .filter((run): run is QuoteRun & { id: string } => typeof run.id === "string" && run.id.trim().length > 0)
      .map((run) => [run.id, run])
  );
  const usedIds = new Set<string>();

  const takeExistingRun = (preferredIndex: number, preferredId?: string | null) => {
    const normalizedPreferredId = preferredId?.trim();
    if (normalizedPreferredId) {
      const matchedById = existingById.get(normalizedPreferredId);
      if (matchedById && !usedIds.has(matchedById.id)) {
        usedIds.add(matchedById.id);
        return matchedById;
      }
    }

    const indexedRun = normalizedExistingRuns[preferredIndex];
    if (indexedRun?.id && !usedIds.has(indexedRun.id)) {
      usedIds.add(indexedRun.id);
      return indexedRun;
    }

    const nextUnusedRun = normalizedExistingRuns.find((run) => {
      if (!run.id) return true;
      return !usedIds.has(run.id);
    });
    if (nextUnusedRun?.id) {
      usedIds.add(nextUnusedRun.id);
    }
    return nextUnusedRun ?? null;
  };

  const payload = nextRuns
    .filter((run) => Number(run.quantity) > 0)
    .map((run, index) => {
      const source = takeExistingRun(index, run.id);
      return {
        id: source?.id ?? crypto.randomUUID(),
        quote_id: quoteId,
        quote_item_id: quoteItemId,
        quantity: Math.max(1, Number(run.quantity) || 1),
        unit_price_model: Math.max(0, Number(source?.unit_price_model) || 0),
        unit_price_print: Math.max(0, Number(source?.unit_price_print) || 0),
        logistics_cost: Math.max(0, Number(source?.logistics_cost) || 0),
        desired_manager_income: Math.max(0, Number(source?.desired_manager_income) || 0),
        manager_rate: resolveNumericRate(
          managerRate,
          resolveNumericRate(source?.manager_rate, defaultManagerRate)
        ),
        fixed_cost_rate: resolveNumericRate(source?.fixed_cost_rate, defaultFixedCostRate),
        vat_rate: resolveNumericRate(source?.vat_rate, defaultVatRate),
      } satisfies QuoteRun;
    });

  const keptIds = new Set(
    payload.map((run) => run.id).filter((id): id is string => typeof id === "string" && id.trim().length > 0)
  );
  const idsToDelete = normalizedExistingRuns
    .map((run) => run.id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0 && !keptIds.has(id));

  return { payload, idsToDelete };
}

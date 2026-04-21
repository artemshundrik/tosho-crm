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

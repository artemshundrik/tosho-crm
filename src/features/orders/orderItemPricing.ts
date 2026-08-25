import { getRunSalePricingFromRun } from "@/lib/quoteRuns";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * ГРОШІ ЗАМОВЛЕННЯ — ОКРЕМИМ МОДУЛЕМ, БЕЗ БАЗИ.
 *
 * Ці три функції вирішують, яка ціна й кількість підуть у `order_items`, а
 * звідти в рахунок і специфікацію. Раніше вони жили всередині
 * `orderRecords.ts`, який тягне за собою клієнт Supabase, — і тому не мали
 * жодного тесту: щоб їх покрити, довелось би піднімати браузерне оточення.
 * Тепер це чиста логіка, і `orderPricing.test.ts` тримає її за руку.
 */

/**
 * Тиражі, що належать цій позиції.
 *
 * Запасний варіант «позиція одна — беремо всі тиражі прорахунку» лишається
 * навмисно: у старих прорахунках `quote_item_id` порожній, і без нього ті
 * прорахунки залишились би зовсім без цін.
 */
export const collectRunsForItem = (
  quoteRuns: QuoteRun[],
  item: { id: string; quoteItemId?: string | null },
  itemCount: number
) => {
  const own = quoteRuns.filter(
    (run) => run.quote_item_id === item.quoteItemId || run.quote_item_id === item.id
  );
  if (own.length > 0) return own;
  return itemCount === 1 ? quoteRuns : [];
};

export const getRunUnitPrice = (run: QuoteRun) => getRunSalePricingFromRun(run).saleUnitPrice ?? 0;

export const getRunLineTotal = (run: QuoteRun) => getRunSalePricingFromRun(run).saleTotal;

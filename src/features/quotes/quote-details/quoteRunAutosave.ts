import { normalizeQuoteRunModelPriceVat } from "@/lib/quoteRuns";
import { resolveNumericRate } from "./config";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Підпис тиражів для автозбереження: за ним сторінка вирішує, чи є що писати.
 *
 * ЧОМУ ОКРЕМИМ МОДУЛЕМ. Ці 27 рядків стояли в `QuoteDetailsPage` ДВІЧІ —
 * окремо для стану форми й окремо для збереженого, — і будь-яка правка мусила
 * лягти в обидва місця однаково, інакше автозбереження або спить, або
 * смикається на порожньому місці.
 */

export type QuoteRunRateDefaults = {
  /**
   * Дефолт КОЛОНКИ, а не типу угоди: це підпис уже збереженого рядка. З числом
   * типу зміна типу угоди сама переписувала б підпис і смикала автозбереження
   * на тиражах, яких ніхто не чіпав.
   */
  markupFallback: number;
  managerRate: number;
  fixedCostRate: number;
  vatRate: number;
};

/**
 * Заготовка, якої ще ніхто не торкався: усі гроші по нулях і клієнт нічого не
 * погоджував.
 *
 * ЗВІДКИ ЦЕ ВЗЯЛОСЬ (REQ-243). Порожній перелік тиражів при наявному товарі
 * змушує сторінку створити заготовку — і вона одразу розходилась із
 * збереженим станом, тобто автозбереження писало її в базу через 900 мс після
 * відкриття картки. Ніхто нічого не вводив, а рядок у прод їхав. Найгірше, коли
 * перелік порожній не тому, що тиражів немає, а тому що їх не вдалося
 * прочитати: тоді відкриття чужого прорахунку дописувало в нього порожній
 * тираж поруч зі справжнім.
 */
export function isBlankDraftRun(run: QuoteRun): boolean {
  return (
    (Number(run.unit_price_model) || 0) === 0 &&
    (Number(run.unit_price_print) || 0) === 0 &&
    (Number(run.logistics_cost) || 0) === 0 &&
    (Number(run.desired_manager_income) || 0) === 0 &&
    run.is_approved !== true
  );
}

export function buildRunsAutosaveSignature(
  runs: QuoteRun[],
  rates: QuoteRunRateDefaults,
  /** Id тиражів, які вже є в базі: їхня порожнеча — факт, а не заготовка. */
  savedRunIds?: ReadonlySet<string>
): string {
  return JSON.stringify(
    runs
      // Незайманої заготовки автозбереження не бачить — писати нічого. Щойно в
      // неї введуть перше число, вона перестає бути порожньою й їде в базу
      // разом з усім іншим.
      .filter((run) => !(isBlankDraftRun(run) && !(run.id && savedRunIds?.has(run.id))))
      .map((run) => ({
        id: run.id ?? "",
        quote_item_id: run.quote_item_id ?? "",
        quantity: Math.max(1, Number(run.quantity) || 1),
        unit_price_model: Math.max(0, Number(run.unit_price_model) || 0),
        unit_price_model_vat: normalizeQuoteRunModelPriceVat(run.unit_price_model_vat),
        unit_price_print: Math.max(0, Number(run.unit_price_print) || 0),
        logistics_cost: Math.max(0, Number(run.logistics_cost) || 0),
        desired_manager_income: Math.max(0, Number(run.desired_manager_income) || 0),
        // Без накрутки підпис не мінявся від правки САМОГО поля ціни: 40 → 25
        // автозбереження не бачило, і число жило лише до переходу на іншу
        // сторінку. Ціну веде саме воно — у підписі має бути першим ділом.
        markup_rate: Math.max(0, resolveNumericRate(run.markup_rate, rates.markupFallback)),
        manager_rate: resolveNumericRate(run.manager_rate, rates.managerRate),
        fixed_cost_rate: resolveNumericRate(run.fixed_cost_rate, rates.fixedCostRate),
        vat_rate: resolveNumericRate(run.vat_rate, rates.vatRate),
        is_approved: run.is_approved === true,
      }))
  );
}

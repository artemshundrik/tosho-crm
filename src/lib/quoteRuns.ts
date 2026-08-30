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
  /**
   * Заробіток менеджера. У старій формі це вхід, у новій — НАСЛІДОК ціни.
   * Поле є в обох, щоб читачі не питали, яку саме форму порахували.
   */
  managerIncome: number;
};

/**
 * Канонічна формула продажної ціни прорахунку (з націнкою): собівартість +
 * валовий прибуток (під бажаний дохід менеджера) + постійні витрати + ПДВ.
 * Єдине джерело правди для розрахунку — використовується і в калькуляторі прорахунку
 * (QuoteDetailsPage `getRunPricing`), і в КП (QuotesPage `buildCommercialDocument`).
 */
// ЧОМУ ЦЯ ФУНКЦІЯ ЩЕ ТУТ, хоч застосунок нею більше не рахує. На ній тримається
// доказ, що переїзд на накрутку не зрушив жодної ціни: тест ганяє одні й ті самі
// вхідні крізь обидві форми й вимагає збігу. Прибрати її означає прибрати
// перевірку, а не мертвий код.
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
    managerIncome: requiredGrossProfit * (managerRate / 100),
  };
}

/**
 * Дно накрутки: нижче нього ціну може погодити лише СЕО або головний бухгалтер.
 * Менеджер сам туди не опускається (рішення СЕО 30.08.2026).
 */
export const MIN_MARKUP_RATE = 20;

/**
 * Що система підставляє сама, поки менеджер не змінив (рішення СЕО 30.08.2026).
 *
 * Це РЕКОМЕНДОВАНИЙ МІНІМУМ, а не стеля: заміряна медіанна накрутка по проду —
 * 46,9 %, і за розміром замовлення вона розкидана від 87,1 % на дрібних до
 * 23,0 % на замовленнях понад 50 тис. Тому підставлене число тут іде в парі з
 * відміткою-орієнтиром на смузі, інакше воно читалось би як «стільки й треба».
 */
export const DEFAULT_MARKUP_RATE = 40;

/**
 * Друга форма тієї самої формули: вхід — ЦІЛЬОВА НАКРУТКА НА СОБІВАРТІСТЬ,
 * а не бажаний заробіток менеджера.
 *
 * Рішення СЕО 30.08.2026: відсоток означає накрутку на собівартість, тобто
 * собівартість 10 000 ₴ при 40 % дає ціну 14 000 ₴. Постійні витрати й
 * податковий резерв НЕ додаються зверху — вони лежать усередині цих 40 %.
 * Інакше число в полі й число на екрані розходились би, а вся вигода від
 * підстановки в тому й полягає, що менеджер бачить ту саму ціну, яку назве
 * клієнту.
 *
 * Звідси зворотний хід ставок: валовий прибуток дістається діленням націнки
 * назад, а заробіток менеджера стає НАСЛІДКОМ ціни. Це не косметика — доти
 * зміна ставки менеджера переписувала вже показану клієнту ціну.
 */
export function computeRunSalePricingFromMarkup(params: {
  quantity: number;
  costTotal: number;
  markupRate: number;
  managerRate: number;
  fixedCostRate: number;
  vatRate: number;
}): RunSalePricing {
  const quantity = Math.max(0, Number(params.quantity) || 0);
  const costTotal = Number(params.costTotal) || 0;
  const costPerUnit = quantity > 0 ? costTotal / quantity : null;
  const markupRate = Math.max(0, Number(params.markupRate) || 0);
  const managerRate = Number(params.managerRate) || 0;
  // Ставки клампимо знизу: від'ємна постійна витрата або ПДВ — це не «знижка»,
  // а зіпсований довідник, і саме вони обнулили б дільник нижче.
  const fixedCostRate = Math.max(0, Number(params.fixedCostRate) || 0);
  const vatRate = Math.max(0, Number(params.vatRate) || 0);

  const markupTotal = costTotal * (markupRate / 100);
  const requiredGrossProfit = markupTotal / ((1 + fixedCostRate / 100) * (1 + vatRate / 100));
  const fixedCosts = requiredGrossProfit * (fixedCostRate / 100);
  const vatAmount = (requiredGrossProfit + fixedCosts) * (vatRate / 100);
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
    managerIncome: requiredGrossProfit * (managerRate / 100),
  };
}

/**
 * Чи треба на цю ціну погодження СЕО або головного бухгалтера.
 *
 * Тираж без собівартості не питаємо — це заготовка, яку щойно додали. Те саме
 * правило, що й у validateRunEconomics: поріг вмикається, коли з'являються
 * гроші, а не коли рядок створили.
 */
export function needsMarkupApproval(params: { costTotal: number; markupRate: number }): boolean {
  const costTotal = Number(params.costTotal) || 0;
  if (costTotal <= 0) return false;
  return (Number(params.markupRate) || 0) < MIN_MARKUP_RATE;
}

/**
 * Продажна ціна для збереженого run-у — бере собівартість (model+print+логістика)
 * і ставки безпосередньо з самого run-у (вони вже дефолтяться у getQuoteRuns).
 *
 * З 30.08.2026 рахує від НАКРУТКИ, а не від бажаного заробітку. Переїзд не
 * зрушив жодної історичної ціни: перенесення markup_rate робилось зворотним
 * ходом тієї самої формули й перевірене на проді — розбіг 0,0000 ₴ на всіх 163
 * тиражах із порахованою націнкою (scripts/quote-run-markup-rate-precision.sql).
 */
export function getRunSalePricingFromRun(run: QuoteRun): RunSalePricing {
  const quantity = Math.max(0, Number(run.quantity) || 0);
  const model = Number(run.unit_price_model) || 0;
  const print = Number(run.unit_price_print) || 0;
  const logistics = Number(run.logistics_cost) || 0;
  const costTotal = (model + print) * quantity + logistics;
  return computeRunSalePricingFromMarkup({
    quantity,
    costTotal,
    markupRate: Number(run.markup_rate) || 0,
    managerRate: Number(run.manager_rate) || 0,
    fixedCostRate: Number(run.fixed_cost_rate) || 0,
    vatRate: Number(run.vat_rate) || 0,
  });
}

/**
 * Який тираж вважається погодженим клієнтом — єдине правило на всі місця
 * (замовлення, підсумок картки, КП).
 *
 * ТРИ СТАНИ, а не два. `null` тут означає «вибір не зроблено, а зробити його
 * треба» — і це не те саме, що «тиражів немає». Саме на цьому стані стоїть
 * блокер створення замовлення: доти замовлення бралось за ПЕРШИМ створеним
 * тиражем, і рішення клієнта ніхто не питав (25.08.2026).
 *
 * Коли тираж один, вибирати нема з чого — беремо його й нічого не питаємо:
 * зайве підтвердження там, де двозначності немає, лише дратує.
 */
export function pickApprovedRun<T extends { is_approved?: boolean }>(runs: T[]): T | null {
  const approved = runs.filter((run) => run.is_approved === true);
  if (approved.length > 0) return approved[0];
  if (runs.length === 1) return runs[0];
  return null;
}

/** Чи треба питати людину, який тираж погоджено: тиражів кілька й жоден не позначений. */
export function needsApprovedRunChoice<T extends { is_approved?: boolean }>(runs: T[]): boolean {
  return runs.length > 1 && !runs.some((run) => run.is_approved === true);
}

/**
 * Перемкнути позначку «погоджено клієнтом» на одному тиражі.
 *
 * ОДИН ПОГОДЖЕНИЙ НА ПОЗИЦІЮ — і це не косметика: те саме обмеження стоїть у
 * базі частковим унікальним індексом, тож без зняття позначки в сусідів запис
 * просто впав би.
 *
 * Повторне натискання знімає позначку: помилились — виправили, а не живете з
 * чужим тиражем у замовленні.
 *
 * Чиста функція над масивом, а не метод сторінки: картка прорахунку й так
 * дев'ять тисяч рядків, а перевірити правило «сусіди гаснуть» треба тестом, а
 * не очима.
 */
export function applyApprovedRunToggle<T extends { id?: string | null; quote_item_id?: string | null; is_approved?: boolean }>(
  runs: T[],
  runId: string | null | undefined,
  quoteItemId?: string | null
): T[] {
  if (!runId) return runs;
  const target = runs.find((run) => run.id === runId);
  if (!target) return runs;
  const nextValue = target.is_approved !== true;
  const scopeItemId = quoteItemId ?? null;
  return runs.map((run) => {
    if (run.id === runId) return { ...run, is_approved: nextValue };
    // Гасимо позначку лише в сусідів ЦІЄЇ позиції: у прорахунку з кількох
    // товарів кожен має власний погоджений тираж.
    const sameItem = (run.quote_item_id ?? null) === scopeItemId;
    if (nextValue && sameItem && run.is_approved) return { ...run, is_approved: false };
    return run;
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
        // Накрутка наявного тиражу зберігається; новий стартує з підставленої.
        // Числа не беруться зі ставки менеджера: накрутка — власне рішення про
        // ціну, і воно має пережити будь-яку зміну ставок.
        markup_rate: Math.max(0, resolveNumericRate(source?.markup_rate, DEFAULT_MARKUP_RATE)),
        // Наявний тираж тримає СВОЮ ставку. Прорахунок, надісланий клієнту при
        // 10 %, не має мовчки подорожчати, коли менеджеру піднімуть ставку до
        // 12 % — а саме це й відбувалось при кожному пересохраненні (рішення
        // CEO 18.08: нова ставка діє лише на нові прорахунки). Поточну ставку
        // застосовуємо лише до НОВИХ тиражів, де source ще немає. Постійні
        // витрати і ПДВ поводились так завжди — тепер ставка з ними симетрична.
        manager_rate: source
          ? resolveNumericRate(source.manager_rate, defaultManagerRate)
          : resolveNumericRate(managerRate, defaultManagerRate),
        fixed_cost_rate: resolveNumericRate(source?.fixed_cost_rate, defaultFixedCostRate),
        vat_rate: resolveNumericRate(source?.vat_rate, defaultVatRate),
        // Позначку «погоджено клієнтом» несе наявний тираж; новий її не має.
        is_approved: source?.is_approved === true,
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

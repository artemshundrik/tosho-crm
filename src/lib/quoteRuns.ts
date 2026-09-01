import { minMarkupRateFor, type QuoteDealType } from "@/lib/quoteDealType";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Похибка порівняння відсотків. Та сама причина, що й у quoteMarkupApproval:
 * накрутка зберігається без округлення, і підставлене 53,846… не зобов'язане
 * пережити цикл читання-запису до останнього біта.
 */
const MARKUP_EPSILON = 1e-9;

/**
 * Ціна за штуку округлюється до КОПІЙОК, і сума тиражу рахується вже з неї.
 *
 * Рішення Артема 01.09.2026: «до двох знаків після коми за штуку». Порядок тут
 * не косметика — він визначає, яке з двох чисел збігається на екрані. Раніше
 * сума ділилась на кількість «як вийде», і в КП штука × кількість не давало
 * підсумок: 504,847… ₴ × 20 показувалось як 504,85 × 20 = 10 097,00, а в
 * підсумку стояло 10 096,94. Клієнт бачить обидва числа в одному рядку, і
 * розбіг у копійки читається як помилка в рахунку.
 *
 * Тому округлюємо ціну за штуку, а суму множимо назад із неї — тоді сходиться
 * саме те, що людина перевіряє очима.
 */
function roundUnitPrice(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Чи включає вартість товару ПДВ. Три стани, і `null` — повноцінний із них:
 * «ще не обрано». Дефолту немає навмисно (scripts/quote-run-model-price-vat.sql).
 *
 * ЖИВЕ САМЕ ТУТ, А НЕ В `toshoApi`, і це не смак: `toshoApi` тягне за собою
 * клієнт Supabase, який на імпорті чіпає `window`. Варто цьому модулю взяти
 * звідти хоч одне ЗНАЧЕННЯ (а не тип, який стирається), як усі тести правил
 * тиражу падають на «window is not defined» ще до першого `it`.
 */
export type QuoteRunModelPriceVat = "incl" | "excl";

export function normalizeQuoteRunModelPriceVat(value: unknown): QuoteRunModelPriceVat | null {
  return value === "incl" || value === "excl" ? value : null;
}

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
  /**
   * Накрутка для НОВОГО тиражу — з типу угоди (REQ-182).
   *
   * Обов'язковий параметр навмисно: доти новий рядок мовчки брав дефолт
   * колонки (40), і на поліграфії народжувався одразу нижче дна 53,8 %,
   * просячи погодження на порожньому місці.
   */
  defaultMarkupRate: number;
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
  const rawMarkupTotal = requiredGrossProfit + fixedCosts + vatAmount;
  // Те саме округлення, що й у формі з накрутки: інакше тест, який доводить
  // рівність двох форм, ловив би розбіг у копійки на порожньому місці.
  const saleUnitPrice =
    quantity > 0 ? roundUnitPrice((costTotal + rawMarkupTotal) / quantity) : null;
  const saleTotal = saleUnitPrice === null ? costTotal + rawMarkupTotal : saleUnitPrice * quantity;
  const markupTotal = saleTotal - costTotal;
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
 * Дно накрутки й підставлене число ПЕРЕЇХАЛИ В `@/lib/quoteDealType` (REQ-182).
 *
 * До 01.09.2026 тут стояли дві константи: дно 20 % і підстановка 40 %, однакові
 * для тендера на 400 тис. і для сотні кастомних блокнотів. Олена прислала шкалу
 * з чотирьох рівнів, і Артем вирішив, що від типу угоди залежить і підстановка,
 * і дно. Тепер це `minMarkupRateFor(dealType)` та `defaultMarkupRateFor(dealType)`.
 *
 * Константи прибрані НАВМИСНО, а не перейменовані з `@deprecated`: правило
 * захищає лише тих, хто його кличе, і читач, який далі бере число без типу
 * угоди, має зупинити компілятор, а не мовчки показати чуже дно.
 */

/**
 * Чим підмінюється порожня накрутка при читанні рядка — і НІЧОГО БІЛЬШЕ.
 *
 * Це дзеркало DEFAULT колонки `quote_item_runs.markup_rate` (`not null default
 * 40`, scripts/quote-run-markup-rate.sql), тобто відповідь на питання «що
 * лежить у рядку, де накрутки немає». Замір 01.09.2026: таких рядків нуль, тож
 * шлях суто оборонний.
 *
 * НЕ ПЛУТАТИ з тим, що система ПРОПОНУЄ менеджеру: це `defaultMarkupRateFor`
 * і воно залежить від типу угоди. Підставити сюди число типу означало б тихо
 * переоцінити старий рядок при першому ж читанні.
 */
export const COLUMN_MARKUP_FALLBACK = 40;

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

  // Ціну веде ШТУКА: округлюємо її, а суму множимо назад — див. roundUnitPrice.
  // Тираж без кількості ціни за штуку не має, тож там лишається сира сума.
  const saleUnitPrice = quantity > 0 ? roundUnitPrice((costTotal * (1 + markupRate / 100)) / quantity) : null;
  const saleTotal = saleUnitPrice === null ? costTotal * (1 + markupRate / 100) : saleUnitPrice * quantity;
  // Накрутку беремо з ОКРУГЛЕНОЇ суми, інакше «собівартість + накрутка» на
  // екрані не дорівнювало б ціні на ті самі копійки.
  const markupTotal = saleTotal - costTotal;
  const requiredGrossProfit = markupTotal / ((1 + fixedCostRate / 100) * (1 + vatRate / 100));
  const fixedCosts = requiredGrossProfit * (fixedCostRate / 100);
  const vatAmount = (requiredGrossProfit + fixedCosts) * (vatRate / 100);

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

/** Підписи позначки ПДВ — одні на перемикач, стрічку й читалки екрана. */
export const MODEL_PRICE_VAT_LABEL: Record<QuoteRunModelPriceVat, string> = {
  incl: "з ПДВ",
  excl: "без ПДВ",
};

/**
 * Тиражі, у яких вартість товару щойно змінили, але не сказали, з ПДВ вона чи
 * без (REQ-232). Саме на цьому списку стоїть відмова зберегти.
 *
 * ГЕЙТ ДИВИТЬСЯ НА ЗМІНУ, А НЕ НА ПОРОЖНЕЧУ ПРАПОРЦЯ, і це головне рішення тут.
 * Прапорця немає в жодного з 465 наявних тиражів — бекфілу свідомо не було, бо
 * відповіді ми не знаємо. Якби гейт вмикався від самої порожнечі, кожна стара
 * картка стала б незберігаємою при першому дотику до будь-чого сусіднього:
 * поправив дедлайн — і автозбереження тиражів мовчки стало. Тому питаємо лише
 * там, де людина щойно вписала суму й відповідь у неї перед очима.
 *
 * Нульова вартість не питається: тираж без товару — це заготовка, яку щойно
 * додали, і ПДВ на ній питати нема від чого. Те саме правило, що й у
 * `needsMarkupApproval`: поріг вмикається, коли з'являються гроші.
 */
export function findRunsNeedingModelPriceVat(
  nextRuns: QuoteRun[],
  savedRuns: QuoteRun[]
): QuoteRun[] {
  const savedById = new Map(
    savedRuns
      .filter((run): run is QuoteRun & { id: string } => Boolean(run.id))
      .map((run) => [run.id, run])
  );
  return nextRuns.filter((run) => {
    const price = Math.max(0, Number(run.unit_price_model) || 0);
    if (price <= 0) return false;
    if (normalizeQuoteRunModelPriceVat(run.unit_price_model_vat)) return false;
    const saved = run.id ? savedById.get(run.id) : undefined;
    // Тираж, якого в збереженому ще немає, — це щойно введена сума.
    if (!saved) return true;
    return Math.max(0, Number(saved.unit_price_model) || 0) !== price;
  });
}

/**
 * Чи треба на цю ціну погодження СЕО або головного бухгалтера.
 *
 * Тираж без собівартості не питаємо — це заготовка, яку щойно додали. Те саме
 * правило, що й у validateRunEconomics: поріг вмикається, коли з'являються
 * гроші, а не коли рядок створили.
 */
export function needsMarkupApproval(params: {
  costTotal: number;
  markupRate: number;
  /** Тип угоди прорахунку: від нього залежить дно (REQ-182). */
  dealType: QuoteDealType | null | undefined;
}): boolean {
  const costTotal = Number(params.costTotal) || 0;
  if (costTotal <= 0) return false;
  // Дно порівнюємо з допуском: накрутка зберігається без округлення, і
  // підставлене 53,846… після циклу читання-запису не зобов'язане збігтися
  // з порахованим до останнього біта. Без цього прорахунок за типовою ціною
  // час від часу сам просився б на погодження.
  return (Number(params.markupRate) || 0) < minMarkupRateFor(params.dealType) - MARKUP_EPSILON;
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
  defaultMarkupRate,
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

  const inheritedModelPriceVat =
    normalizedExistingRuns
      .map((run) => normalizeQuoteRunModelPriceVat(run.unit_price_model_vat))
      .find((value): value is QuoteRunModelPriceVat => value !== null) ?? null;

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
        // Новий тираж успадковує позначку ПДВ від сусіда по позиції: тиражі
        // одної позиції — це той самий товар у того самого постачальника, і
        // питати про нього вдруге означало б питати про очевидне (REQ-232).
        unit_price_model_vat:
          normalizeQuoteRunModelPriceVat(source?.unit_price_model_vat) ?? inheritedModelPriceVat,
        unit_price_print: Math.max(0, Number(source?.unit_price_print) || 0),
        logistics_cost: Math.max(0, Number(source?.logistics_cost) || 0),
        desired_manager_income: Math.max(0, Number(source?.desired_manager_income) || 0),
        // Накрутка наявного тиражу зберігається; новий стартує з підставленої.
        // Числа не беруться зі ставки менеджера: накрутка — власне рішення про
        // ціну, і воно має пережити будь-яку зміну ставок.
        // Збережений рядок несе своє число; НОВИЙ бере підстановку типу угоди.
        // Дефолт колонки тут був би помилкою: на поліграфії він дав би 40 при
        // дні 53,8 — тираж одразу «нижче дна» без жодної дії людини.
        markup_rate: Math.max(0, resolveNumericRate(source?.markup_rate, defaultMarkupRate)),
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

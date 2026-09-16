import { normalizeQuoteRunModelPriceVat, type QuoteRunModelPriceVat } from "@/lib/quoteRuns";
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

/**
 * Заготовка, яку сторінка створила сама: її id і кількість, яку вона ж
 * підставила. Усе, за чим її можна впізнати нечіпаною, поки гроші по нулях.
 */
export type PristineDraftRun = {
  id: string;
  quantity: number;
};

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
 * Заготовка, якої ще ніхто не торкався ГРОШИМА: усі суми по нулях і клієнт
 * нічого не погоджував.
 *
 * ЗВІДКИ ЦЕ ВЗЯЛОСЬ (REQ-243). Порожній перелік тиражів при наявному товарі
 * змушує сторінку створити заготовку — і вона одразу розходилась із
 * збереженим станом, тобто автозбереження писало її в базу через 900 мс після
 * відкриття картки. Ніхто нічого не вводив, а рядок у прод їхав. Найгірше, коли
 * перелік порожній не тому, що тиражів немає, а тому що їх не вдалося
 * прочитати: тоді відкриття чужого прорахунку дописувало в нього порожній
 * тираж поруч зі справжнім.
 *
 * КІЛЬКОСТІ ТУТ НЕМАЄ СВІДОМО, і сама по собі ця функція на питання «чи
 * торкались» більше не відповідає — див. `isPristineAutoDraftRun`. Кількість
 * сторінка підставляє сама (з кількості товару), тож «1000 замість 12» —
 * правка людини, а «12» — те, що вона застала.
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

/**
 * Заготовка, яку створила САМА сторінка і якої ще ніхто не торкався, — рівно
 * той рядок, що має мовчати.
 *
 * ЧОМУ НЕ «БУДЬ-ЯКИЙ ПОРОЖНІЙ ТИРАЖ» (REQ-278). Саме так фільтр і був
 * влаштований, і це коштувало втрачених тиражів: тираж, доданий кнопкою
 * «+ Тираж», теж порожній у мить створення, тож автозбереження його не бачило
 * — ні тоді, ні після того, як у нього вписували 1000 шт. Кількість у підпис
 * не входила, бо рядка в підписі не було взагалі. Людина набирала число,
 * перезавантажувала сторінку й не знаходила ні числа, ні тиражу.
 *
 * Тепер мовчить рівно один рядок — той, чий id сторінка запам'ятала, коли сама
 * його створила, і в якому досі стоїть підставлена нею ж кількість. Клік
 * «+ Тираж» — це намір, і намір їде в базу. Правка кількості — теж.
 */
export function isPristineAutoDraftRun(
  run: QuoteRun,
  pristineDraft: PristineDraftRun | null | undefined,
  savedRunIds?: ReadonlySet<string>
): boolean {
  if (!pristineDraft || !run.id || run.id !== pristineDraft.id) return false;
  // Уже в базі — це не заготовка, а рядок, який має право бути порожнім (і
  // який інакше неможливо було б видалити: без нього в підписі видалення не
  // видно).
  if (savedRunIds?.has(run.id)) return false;
  if (!isBlankDraftRun(run)) return false;
  return (Number(run.quantity) || 0) === pristineDraft.quantity;
}

export function buildRunsAutosaveSignature(
  runs: QuoteRun[],
  rates: QuoteRunRateDefaults,
  /** Id тиражів, які вже є в базі: їхня порожнеча — факт, а не заготовка. */
  savedRunIds?: ReadonlySet<string>,
  /** Заготовка сторінки, якщо вона є: єдиний рядок, який має право мовчати. */
  pristineDraft?: PristineDraftRun | null
): string {
  return JSON.stringify(
    runs
      // Незайманої заготовки автозбереження не бачить — писати нічого. Щойно в
      // неї введуть перше число (гроші АБО кількість), вона перестає бути
      // заготовкою й їде в базу разом з усім іншим.
      .filter((run) => !isPristineAutoDraftRun(run, pristineDraft, savedRunIds))
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

/**
 * Позиції, у чиїх тиражах зараз є незбережені зміни, — щоб відклик про
 * збереження стояв біля тієї картки, де справді щось правили.
 *
 * ЧОМУ ОКРЕМО ВІД ПІДПИСУ (REQ-278). Підпис відповідає на питання «чи є що
 * писати» для ВСЬОГО прорахунку: `persistQuoteRuns` шле всі тиражі одним
 * запитом, і ділити його нема сенсу. Але показувати «Зберігаю…» над усіма
 * товарами, коли правили один, означало б, що напис не про те, на що
 * дивишся. Тут той самий набір полів, лише згрупований по `quote_item_id`.
 *
 * Ключ `""` — тиражі, не прив'язані до позиції (старі прорахунки таке мають).
 * Вони теж група, просто безіменна.
 */
export function changedRunItemIds(
  nextRuns: QuoteRun[],
  savedRuns: QuoteRun[],
  /** Заготовка сторінки: нечіпана, вона не зміна — так само, як і в підписі. */
  pristineDraft?: PristineDraftRun | null
): Set<string> {
  const changed = new Set<string>();
  const nextById = runsById(nextRuns);
  const savedById = runsById(savedRuns);
  const savedIds = new Set(savedById.keys());

  for (const [id, run] of nextById) {
    if (isPristineAutoDraftRun(run, pristineDraft, savedIds)) continue;
    const saved = savedById.get(id);
    if (!saved || runFingerprint(run) !== runFingerprint(saved)) {
      changed.add(run.quote_item_id ?? "");
    }
  }
  // Видалений тираж — теж зміна, і саме в тій позиції, звідки він зник.
  for (const [id, run] of savedById) {
    if (!nextById.has(id)) changed.add(run.quote_item_id ?? "");
  }
  return changed;
}

function runsById(runs: QuoteRun[]): Map<string, QuoteRun> {
  return new Map(
    runs
      .filter((run): run is QuoteRun & { id: string } => Boolean(run.id))
      .map((run) => [run.id, run] as const)
  );
}

/**
 * Значуща частина тиражу рядком. Ставок за замовчуванням тут немає навмисно:
 * обидві сторони порівняння приходять з однієї дороги (`getQuoteRuns` уже
 * проставив ставки, `addRun` теж), а `Number` знімає різницю між «40.00» з
 * PostgREST і 40 зі стану.
 */
function runFingerprint(run: QuoteRun): string {
  return [
    Math.max(1, Number(run.quantity) || 1),
    Number(run.unit_price_model) || 0,
    normalizeQuoteRunModelPriceVat(run.unit_price_model_vat) ?? "",
    Number(run.unit_price_print) || 0,
    Number(run.logistics_cost) || 0,
    Number(run.desired_manager_income) || 0,
    Number(run.markup_rate) || 0,
    Number(run.manager_rate) || 0,
    Number(run.fixed_cost_rate) || 0,
    Number(run.vat_rate) || 0,
    run.is_approved === true ? 1 : 0,
  ].join("|");
}

/**
 * Новий, порожній тираж — один рецепт на обидва місця, де він народжується:
 * заготовку сторінки (товар є, тиражів немає) і кнопку «+ Тираж».
 *
 * ЧОМУ РАЗОМ. Рядки розійшлись би непомітно: два списки з одинадцяти полів,
 * що правляться нарізно, — і різницю видно лише тоді, коли в базу поїде тираж
 * без ставки, яку інша половина проставляє. Відрізняються вони рівно двома
 * речами, і обидві в аргументах: чи прив'язаний тираж до позиції і що йому
 * відомо про ПДВ на вартості товару.
 */
export function createBlankQuoteRun(params: {
  id: string;
  quantity: number;
  quoteItemId?: string | null;
  modelPriceVat?: QuoteRunModelPriceVat | null;
  rates: { markupRate: number; managerRate: number; fixedCostRate: number; vatRate: number };
}): QuoteRun {
  return {
    id: params.id,
    quote_item_id: params.quoteItemId ?? null,
    quantity: params.quantity,
    unit_price_model: 0,
    unit_price_model_vat: params.modelPriceVat ?? null,
    unit_price_print: 0,
    logistics_cost: 0,
    desired_manager_income: 0,
    markup_rate: params.rates.markupRate,
    manager_rate: params.rates.managerRate,
    fixed_cost_rate: params.rates.fixedCostRate,
    vat_rate: params.rates.vatRate,
    is_approved: false,
  } as QuoteRun;
}

/** Ставки новонародженого тиражу — один рядок замість чотирьох на кожному місці народження. */
export function blankRunRates(
  markupRate: number,
  managerRate: number,
  company: { fixedCostRate: number; vatRate: number }
) {
  return { markupRate, managerRate, fixedCostRate: company.fixedCostRate, vatRate: company.vatRate };
}

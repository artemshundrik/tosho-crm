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

// Дзеркало COLUMN_MARKUP_FALLBACK із src/lib/quoteRuns.ts і DEFAULT колонки
// markup_rate. Рядок без накрутки означав би ціну, рівну собівартості.
//
// САМЕ ДЕФОЛТ КОЛОНКИ, А НЕ ЧИСЛО ТИПУ УГОДИ (REQ-182). Сервер читає вже
// збережені тиражі й рахує суму, яку менеджер бачив на екрані. Підставити сюди
// `defaultMarkupRateFor(dealType)` означало б переоцінити старий рядок заднім
// числом — дайджест і відповіді ToSho AI розійшлися б із карткою.
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
  const raw = costTotal * (1 + markupRate / 100);

  // Дзеркало roundUnitPrice із src/lib/quoteRuns.ts (рішення Артема 01.09.2026):
  // ціну веде ШТУКА, округлена до копійок, а сума множиться назад із неї.
  // Без цього дайджест і відповіді ToSho AI розходились би з карткою на копійки
  // — саме на тих числах, які людина потім звіряє руками.
  if (quantity <= 0) return raw;
  return (Math.round((raw / quantity) * 100) / 100) * quantity;
}

/** Межі суми: найдешевший сценарій і найдорожчий. min === max — сума точна. */
export type MoneyRange = { min: number; max: number };

/**
 * Колонки, потрібні для розрахунку. Один рядок на всіх, бо копій цього select
 * було чотири, і саме через них помилка REQ-77 прожила так довго: `quote_item_id`
 * не вибирала жодна, тож згрупувати тиражі за позиціями було просто нічим.
 */
export const QUOTE_RUN_PRICING_COLUMNS =
  "quote_id,quote_item_id,quantity,unit_price_model,unit_price_print,logistics_cost," +
  "desired_manager_income,markup_rate,manager_rate,fixed_cost_rate,vat_rate";

/**
 * Сума прорахунку — це НЕ сума його тиражів.
 *
 * Рядки `quote_item_runs` однієї позиції — взаємовиключні варіанти: замовник
 * бере один тираж зі 100/150/200, а не всі три. Складати їх означає називати
 * суму, якої не буде в жодному можливому замовленні. На проді 38% прорахунків
 * мають більше одного тиражу, і завищення на цьому виходило щонайменше
 * 3,9 млн грн (REQ-77).
 *
 * Тому підсумок — це межі: найдешевший сценарій (у кожної позиції найдешевший
 * тираж) і найдорожчий. Коли тираж у позицій один, межі збігаються, і виходить
 * звичайна точна сума — тобто для 62% прорахунків нічого візуально не міняється.
 *
 * Це ДЗЕРКАЛО того, як рахує комерційна пропозиція (REQ-57,
 * `itemsTotalRange` у src/pages/QuotesPage.tsx). Свідомо не враховуємо
 * `is_approved`: КП його теж не враховує, а розійтися з документом, який
 * менеджер щойно надіслав клієнтові, дорожче за зайву точність. Міняти —
 * то в обох місцях разом.
 */
export function quoteSaleTotalRanges(runs: QuoteRunPricingRow[]): Map<string, MoneyRange> {
  const byQuote = new Map<string, Map<string, MoneyRange>>();

  for (const run of runs) {
    const quoteId = run.quote_id;
    if (!quoteId) continue;

    // Рядок без позиції нікуди не згрупувати, тож він сам собі позиція:
    // так він потрапить у суму, а не зникне і не склеїться з чужим тиражем.
    const itemKey = run.quote_item_id ?? `__unlinked_${byQuote.get(quoteId)?.size ?? 0}`;
    const total = runSaleTotal(run);

    let items = byQuote.get(quoteId);
    if (!items) { items = new Map(); byQuote.set(quoteId, items); }

    const seen = items.get(itemKey);
    items.set(itemKey, seen
      ? { min: Math.min(seen.min, total), max: Math.max(seen.max, total) }
      : { min: total, max: total });
  }

  const totals = new Map<string, MoneyRange>();
  for (const [quoteId, items] of byQuote) {
    let min = 0, max = 0;
    for (const item of items.values()) { min += item.min; max += item.max; }
    totals.set(quoteId, { min, max });
  }
  return totals;
}

/** Нуль для згортання: додавати межі можна лише до меж. */
export const ZERO_RANGE: MoneyRange = { min: 0, max: 0 };

export function addRange(a: MoneyRange, b: MoneyRange | undefined): MoneyRange {
  if (!b) return a;
  return { min: a.min + b.min, max: a.max + b.max };
}

/**
 * «12 300 ₴» або «12 300 – 18 900 ₴». Одне число там, де воно справді одне —
 * інакше межі виглядали б як невпевненість у 62% випадків, де її немає.
 */
export function formatMoneyRange(range: MoneyRange | undefined, format: (value: number) => string): string {
  const r = range ?? ZERO_RANGE;
  return r.min === r.max ? format(r.min) : `${format(r.min)} – ${format(r.max)}`;
}

import type { QuoteRun } from "@/lib/toshoApi";
import { MODEL_PRICE_VAT_LABEL, normalizeQuoteRunModelPriceVat } from "@/lib/quoteRuns";

/**
 * ЩО САМЕ ЗМІНИЛОСЬ У ТИРАЖАХ — рядками для стрічки справи (REQ-155 p10).
 *
 * ЧОМУ ЦЕ ВЗАГАЛІ ПОТРІБНО. Журнал прорахунку писав про тиражі одне речення —
 * «Прорахував тиражі», — і то лише на ручне збереження. Автозбереження (а це
 * майже всі зміни цін) не лишало сліду взагалі. Тобто на питання «хто і коли
 * опустив накрутку з 40 до 28» картка не відповідала ніяк.
 *
 * ЩО ЛОГУЄМО: собівартість (ціна моделі + нанесення + логістика одним фактом,
 * бо міняють їх разом), накрутку і позначку ПДВ на вартості товару. Кількість
 * не логуємо: вона видно в самій назві тиражу, і зміна тиражу — це радше нова
 * позиція, ніж правка ціни.
 *
 * ПОРІВНЮЄМО ЗБЕРЕЖЕНЕ ЗІ ЗБЕРЕЖЕНИМ. На вхід іде знімок `runsOriginal` (те, що
 * лежало в базі) і те, що щойно записали. Порівнювати зі станом форми не можна:
 * там числа, які ще не поїхали.
 */

export type QuoteRunChange = {
  /** Підпис події: «Собівартість тиражу 100 шт». */
  label: string;
  /** Порожнє означає «задали вперше» — стрічка покаже саме нове значення. */
  from: string;
  to: string;
};

const num = (value: unknown) => Math.max(0, Number(value) || 0);

const money = (value: number) =>
  (Math.round(value * 100) / 100).toLocaleString("uk-UA", { maximumFractionDigits: 2 });

const costLabel = (run: QuoteRun) => {
  const model = num(run.unit_price_model);
  const print = num(run.unit_price_print);
  const logistics = num(run.logistics_cost);
  if (model === 0 && print === 0 && logistics === 0) return "не внесена";
  const perUnit = `${money(model)} + ${money(print)} грн/од`;
  return logistics > 0 ? `${perUnit} · логістика ${money(logistics)}` : perUnit;
};

const markupLabel = (run: QuoteRun) => `${money(num(run.markup_rate))} %`;

/**
 * Позначка ПДВ логується окремо від собівартості, хоч і стосується тієї самої
 * суми (REQ-232): цифра не змінилась, змінилось те, ЩО ВОНА ОЗНАЧАЄ. Склеєні в
 * один рядок, ці дві події читались би як «ціна та сама, нічого не сталось».
 */
const modelPriceVatLabel = (run: QuoteRun) => {
  const value = normalizeQuoteRunModelPriceVat(run.unit_price_model_vat);
  return value ? MODEL_PRICE_VAT_LABEL[value] : "не вказано";
};

const runTitle = (run: QuoteRun) => `тиражу ${num(run.quantity) || 0} шт`;

export function describeRunChanges(previous: QuoteRun[], next: QuoteRun[]): QuoteRunChange[] {
  const before = new Map(previous.filter((run) => run.id).map((run) => [run.id as string, run]));
  const changes: QuoteRunChange[] = [];

  next.forEach((run) => {
    if (!run.id) return;
    const old = before.get(run.id);

    const nextCost = costLabel(run);
    const prevCost = old ? costLabel(old) : "не внесена";
    if (prevCost !== nextCost) {
      changes.push({ label: `Собівартість ${runTitle(run)}`, from: prevCost, to: nextCost });
    }

    const nextVat = modelPriceVatLabel(run);
    const prevVat = old ? modelPriceVatLabel(old) : "не вказано";
    if (prevVat !== nextVat) {
      changes.push({ label: `Вартість товару ${runTitle(run)}`, from: prevVat, to: nextVat });
    }

    const nextMarkup = markupLabel(run);
    const prevMarkup = old ? markupLabel(old) : null;
    // Новий тираж із типовою накруткою — не подія: її ніхто не ставив руками.
    if (prevMarkup && prevMarkup !== nextMarkup) {
      changes.push({ label: `Накрутка ${runTitle(run)}`, from: prevMarkup, to: nextMarkup });
    }
  });

  return changes;
}

import {
  findRunsNeedingModelPriceVat,
  normalizeQuoteRunModelPriceVat,
  type QuoteRunModelPriceVat,
} from "@/lib/quoteRuns";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Обв'язка гейта ПДВ на вартості товару (REQ-232) — усе, що картці прорахунку
 * потрібно від цього правила, крім самого правила.
 *
 * Саме правило — `findRunsNeedingModelPriceVat` у `lib/quoteRuns`, поруч із
 * рештою правил тиражу й під тестами. Тут — три речі, які інакше осіли б у
 * `QuoteDetailsPage.tsx` (7,4 тис. рядків і ратчет розміру): успадкування
 * позначки новим тиражем, набір id для підсвітки та тексти відмови.
 */

/**
 * Яку позначку взяти новому тиражу цієї позиції.
 *
 * Тиражі однієї позиції — той самий товар у того самого постачальника, тож
 * питати вдруге означало б питати про очевидне. Порожньо, коли сусідів немає
 * або жоден із них ще не відповів.
 */
export function inheritModelPriceVat(
  runs: QuoteRun[],
  quoteItemId: string | null
): QuoteRunModelPriceVat | null {
  return (
    runs
      .filter((run) => (run.quote_item_id ?? null) === quoteItemId)
      .map((run) => normalizeQuoteRunModelPriceVat(run.unit_price_model_vat))
      .find((value) => value !== null) ?? null
  );
}

/**
 * Id тиражів, які зараз тримає гейт, — для підсвітки поля в трьох місцях, де
 * вартість товару редагується, і для зупинки автозбереження.
 *
 * Саме Set, а не масив: перевірка йде в рендері на кожен тираж.
 */
export function collectRunIdsNeedingModelPriceVat(
  nextRuns: QuoteRun[],
  savedRuns: QuoteRun[]
): Set<string> {
  return new Set(
    findRunsNeedingModelPriceVat(nextRuns, savedRuns)
      .map((run) => run.id)
      .filter((id): id is string => Boolean(id))
  );
}

/** Чому збереження не пройшло — текст для шапки картки й тосту. */
export function modelPriceVatGateMessage(runCount: number): string {
  return runCount === 1
    ? "Вкажіть, з ПДВ вартість товару чи без, — інакше тираж не зберігається."
    : `Вкажіть, з ПДВ вартість товару чи без, — у ${runCount} тиражах.`;
}

/**
 * Підказка для компактного рядка й мобільної картки: перемикача там немає —
 * тісно, — тож підсвічене поле мусить сказати, куди йти. Клік по цьому ж рядку
 * і відкриває блок «Активний тираж», де перемикач стоїть.
 */
export const MODEL_PRICE_VAT_ROW_HINT =
  "Оберіть у блоці «Активний тираж», з ПДВ ця сума чи без — інакше тираж не збережеться.";

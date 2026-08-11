/**
 * Підбір тиражів під конкретну позицію прорахунку для діалогу редагування.
 *
 * Діалог показує ОДНУ позицію, і донедавна це завжди була перша: openEdit брав
 * itemRows.find(...) і решта товарів була недосяжна. Тепер позицію обирає
 * людина, тож та сама вибірка потрібна двічі — при відкритті й при перемиканні.
 * Тримаємо її в одному місці: саме через дві копії одного правила REQ-34 і
 * стався розліт позицій «Інше» по окремих прорахунках.
 */
export type QuoteEditRunLike = {
  id?: string;
  quote_item_id?: string | null;
  quantity?: number | null;
};

export type QuoteEditItemRuns = {
  /** Тиражі позиції як їх зберігає БД — для звірки при збереженні. */
  originalRuns: QuoteEditRunLike[];
  /** Те, що показуємо у формі: без нулів, з підстановкою з qty позиції. */
  formRuns: Array<{ id?: string; quantity: number }>;
  /** Кількість у полі «Тираж» верхнього рівня. */
  primaryQuantity: number | undefined;
};

export function resolveQuoteEditItemRuns(
  item: { id: string; qty?: number | null } | null,
  allRuns: QuoteEditRunLike[]
): QuoteEditItemRuns {
  const itemId = item?.id ?? null;
  const originalRuns = allRuns.filter((run) => (run.quote_item_id ?? null) === itemId);
  const itemQty = Number(item?.qty ?? 0) || 0;

  // Старі прорахунки живуть без рядків тиражу — там кількість лежить у самій
  // позиції. Без цієї підстановки форма відкривалась порожньою.
  const source: QuoteEditRunLike[] =
    originalRuns.length > 0 ? originalRuns : item && itemQty > 0 ? [{ quantity: itemQty }] : [];

  const formRuns = source
    .map((run) => ({ id: run.id, quantity: Number(run.quantity) || 0 }))
    .filter((run) => run.quantity > 0);

  const primary = Number(source[0]?.quantity ?? itemQty) || 0;

  return {
    originalRuns,
    formRuns,
    primaryQuantity: primary > 0 ? primary : undefined,
  };
}

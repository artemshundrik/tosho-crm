/**
 * Які позиції прорахунку взяв клієнт — єдине правило на всі місця (підсумок
 * картки, розділ «Замовлення», вікно створення замовлення).
 *
 * ТРИ СТАНИ, а не два, і `null` тут повноцінний: «питання не ставили». Саме він
 * лежить у всіх 333 наявних позиціях, тож правило нижче зобов'язане читати його
 * як «входить» — інакше міграція мовчки обнулила б підсумки 305 прорахунків.
 *
 * ЧОМУ ЦЕ НЕ `pickApprovedRun` І НЕ МОЖНА ПЕРЕВИКОРИСТАТИ ЙОГО. Тираж —
 * ВЗАЄМОВИКЛЮЧНИЙ варіант: із 100/150/200 клієнт бере один, і правило там
 * «обери рівно один». Позиції НЕ взаємовиключні: прорахунок на три різні
 * товари, де клієнт узяв усі три, — найчастіший випадок. Тому тут немає ні
 * «обери один», ні часткового унікального індексу в базі — лише відсів тих, від
 * кого відмовились.
 *
 * SQL: scripts/quote-item-approved.sql (REQ-267#p1).
 *
 * Читачі (додаєш нового — допиши себе сюди; друга половина захисту —
 * `scripts/check-rule-readers.mjs`, правило «погоджена позиція прорахунку»):
 *   - src/pages/QuoteDetailsPage.tsx — підсумок картки й вигляд відхиленої позиції
 *   - src/features/quotes/quote-details/useQuoteItemChoice.ts — запис вибору
 *   - src/features/orders/orderRecords.ts — що їде в замовлення
 *   - netlify/functions/_lib/quotePricing.ts — суми дайджестів і ToSho AI
 */

/** Мінімум, потрібний правилу. Структурний тип, щоб не тягти сюди подання сторінки. */
export type QuoteItemChoice = {
  is_approved?: boolean | null;
};

/**
 * Чи входить позиція в підсумок і в замовлення.
 *
 * `!== false`, а не `=== true`, і це головний рядок усього модуля: `null`
 * означає «не питали», і такий прорахунок має рахуватись так само, як рахувався
 * до появи колонки.
 */
export function isQuoteItemIncluded(item: QuoteItemChoice): boolean {
  return item.is_approved !== false;
}

/** Позиції, від яких клієнт відмовився — показуємо, але не рахуємо. */
export function isQuoteItemDeclined(item: QuoteItemChoice): boolean {
  return item.is_approved === false;
}

/** Лише те, що піде в гроші й у замовлення. */
export function filterIncludedQuoteItems<T extends QuoteItemChoice>(items: T[]): T[] {
  return items.filter(isQuoteItemIncluded);
}

/**
 * Чи питали вже про цей прорахунок. Відрізняє «менеджер підтвердила всі три»
 * від «діалогу ще не було»: на екрані це різні речі, і без цієї різниці людина
 * не бачить, чи зберігся її вибір.
 */
export function hasQuoteItemChoice(items: QuoteItemChoice[]): boolean {
  return items.some((item) => item.is_approved !== null && item.is_approved !== undefined);
}

/**
 * Чи ставити питання «що саме погодив клієнт» при переведенні в «Затверджено».
 *
 * Одна позиція — не питаємо: вибирати нема з чого, і зайве підтвердження там,
 * де двозначності немає, лише дратує. Те саме правило, що й у
 * `needsApprovedRunChoice` для тиражів.
 */
export function needsQuoteItemChoice(items: QuoteItemChoice[]): boolean {
  return items.length > 1;
}

/** Скільки взяли, скільки ні — для підпису в шапці й у вікні. */
export function summarizeQuoteItemChoice(items: QuoteItemChoice[]): {
  included: number;
  declined: number;
  total: number;
} {
  const declined = items.filter(isQuoteItemDeclined).length;
  return { included: items.length - declined, declined, total: items.length };
}

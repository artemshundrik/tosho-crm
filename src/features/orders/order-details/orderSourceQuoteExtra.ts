import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import type { QuotePartyExtra } from "@/features/quotes/quote-details/QuotePartyCard";

/**
 * «Прорахунок TS-…» у картці замовника збоку: замовлення має власний номер TO-…, а прорахунок,
 * з якого його зробили, лишається своїм. Не в шапці поруч із номером — там підпис зіштовхував
 * кнопки дій на другий рядок. Клік веде в прорахунок.
 */
export const orderSourceQuoteExtra = (record: DerivedOrderRecord): QuotePartyExtra | null => {
  const sourceNumber = record.sourceQuoteNumber?.trim();
  if (!record.linkedQuoteId || !sourceNumber || sourceNumber === record.quoteNumber) return null;
  return { label: "Прорахунок", value: sourceNumber, href: `/orders/estimates/${record.linkedQuoteId}` };
};

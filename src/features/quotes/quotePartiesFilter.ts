import {
  buildCompanySearchVariants,
  buildShortQueryPrefixVariants,
  scoreCompanyNameMatch,
} from "@/lib/companyNameSearch";

/**
 * Відбір замовників і лідів за набраним — БЕЗ походу в базу.
 *
 * Окремим модулем від `quoteParties.ts` тому, що той тягне supabase-клієнта, а
 * тут потрібна чиста функція: її й перевіряють тестом у вузлі, без браузера.
 */

/** Рівно те, по чому шукаємо. Решта полів рядка фільтру не цікавить. */
export type SearchableParty = { name?: string | null; legal_name?: string | null };

export const comparePartyName = (left: SearchableParty, right: SearchableParty) =>
  (left.name ?? "").localeCompare(right.name ?? "", "uk");

/**
 * Фільтр — дзеркало того, що робив сервер, тільки в браузері.
 *
 * До трьох символів — префікс по ТОРГОВІЙ назві з парою латиниця/кирилиця
 * («f» шукає й «ф»). Юрособу на коротких запитах не чіпаємо навмисно: там у
 * більшості рядків спереду «ФОП», «ТОВ», «ПП», і на одну літеру вони забили б
 * усю видачу.
 *
 * ВІД ТРЬОХ — ДВА СИТА ПОСПІЛЬ, І ДРУГЕ БЕЗ ПЕРШОГО НЕ ПРАЦЮЄ. Спершу підрядок
 * за будь-яким варіантом написання — те саме, що робив `ILIKE %варіант%`, —
 * і лише потім `scoreCompanyNameMatch` для порядку видачі. Перший захід
 * лишив саме́ оцінювання, і на «FANTOM» вигулькнув «FAYNA TEAM»: у нього той
 * самий кістяк приголосних (ф-н-т-м), а це в оцінці коштує 110. На сервері
 * такий рядок не доїжджав узагалі, бо не проходив `ILIKE`.
 */
export function filterQuoteParties<T extends SearchableParty>(parties: T[], search: string): T[] {
  const query = search.trim();
  if (!query) return parties.slice(0, 50);

  if (query.length < 3) {
    const prefixes = buildShortQueryPrefixVariants(query).map((value) => value.toLowerCase());
    return parties
      .filter((party) => {
        const name = (party.name ?? "").toLowerCase();
        return prefixes.some((prefix) => name.startsWith(prefix));
      })
      .slice(0, 50);
  }

  const variants = buildCompanySearchVariants(query).map((value) => value.toLowerCase());
  const hasVariant = (party: SearchableParty) => {
    const haystack = `${party.name ?? ""}\n${party.legal_name ?? ""}`.toLowerCase();
    return variants.some((variant) => variant && haystack.includes(variant));
  };

  return parties
    .filter(hasVariant)
    .map((party) => ({
      party,
      score: scoreCompanyNameMatch(query, [party.name ?? null, party.legal_name ?? null]),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || comparePartyName(left.party, right.party))
    .slice(0, 50)
    .map((entry) => entry.party);
}

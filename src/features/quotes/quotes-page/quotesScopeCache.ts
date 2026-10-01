import type { QuoteListRow, QuoteSetMembershipInfo } from "@/lib/toshoApi";

/** Результат однієї вкладки таблиці прорахунків — для миттєвого повторного відкриття. */
export type QuotesScopeCacheEntry = {
  rows: QuoteListRow[];
  membership: Map<string, QuoteSetMembershipInfo>;
  hasMore: boolean;
  /** Пошуковий запит, під який приїхали рядки. */
  searchTerm: string;
};

const MAX_ENTRIES = 16;

export const buildScopeCacheKey = (teamId: string, managerFilter: string, search: string, fetchStatus: string) =>
  `${teamId}|${managerFilter}|${search.trim().toLowerCase()}|${fetchStatus}`;

export function rememberQuotesScope(cache: Map<string, QuotesScopeCacheEntry>, key: string, entry: QuotesScopeCacheEntry) {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

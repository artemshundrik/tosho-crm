/**
 * Пошуковий фільтр списку прорахунків у синтаксисі PostgREST `.or(...)`.
 * Один будівник на `listQuotes` і на лічильники статусів: інакше цифри на
 * вкладках розходились би зі списком під ними.
 *
 * Знайдене за артикулом іде тим самим фільтром, а не окремим добором: так
 * сортування, статуси й посторінковість лишаються спільними.
 */
export function buildQuoteSearchOrFilter(
  searchableColumns: string[],
  escapedSearch: string,
  skuQuoteIds: string[]
): string | null {
  if (escapedSearch.length === 0) return null;
  const filters = searchableColumns.map((column) => `${column}.ilike.%${escapedSearch}%`);
  if (skuQuoteIds.length > 0) filters.push(`id.in.(${skuQuoteIds.join(",")})`);
  return filters.join(",");
}

/** Скільки прорахунків у кожному статусі — рахуємо в браузері з вибірки самих статусів. */
export function countQuotesByStatus(rows: Array<{ status?: string | null }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = row.status ?? "";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function escapePostgrestIlikeTerm(value: string) {
  return value
    .trim()
    .replace(/[(),]/g, " ")
    .replace(/[%_]/g, (match) => `\\${match}`)
    .replace(/\s+/g, " ");
}

type QuoteListFilterable = {
  in: (column: string, values: string[]) => QuoteListFilterable;
  eq: (column: string, value: string) => QuoteListFilterable;
  or: (filters: string) => QuoteListFilterable;
};

/** Умови списку прорахунків (пошук, статус, менеджер): спільні для `listQuotes` і лічильників. */
export function applyQuoteListFilters<T>(
  query: T,
  params: {
    escapedSearch: string;
    skuQuoteIds: string[];
    searchableColumns: string[];
    status?: string;
    statuses?: string[];
    managerUserId?: string | null;
  }
): T {
  let next = query as unknown as QuoteListFilterable;
  const searchFilter = buildQuoteSearchOrFilter(params.searchableColumns, params.escapedSearch, params.skuQuoteIds);
  if (searchFilter) next = next.or(searchFilter);
  if (params.statuses && params.statuses.length > 0) {
    next = next.in("status", params.statuses);
  } else if (params.status && params.status !== "all") {
    next = next.eq("status", params.status);
  }
  if (params.managerUserId?.trim()) next = next.eq("assigned_to", params.managerUserId.trim());
  return next as unknown as T;
}

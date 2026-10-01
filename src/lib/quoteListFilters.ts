import { customerFilterNames, type CustomerFilterValue } from "@/lib/customerFilter";

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

/**
 * Рівність без регістру для `.or(...)`: значення в подвійних лапках, тож коми й
 * дужки в назві нічого не ламають; `%` і `_` екрануємо для ILIKE, а `\` і `"` —
 * для самих лапок.
 */
export function quotePostgrestIlikeEquals(value: string) {
  const pattern = value.trim().replace(/[\\%_]/g, (match) => `\\${match}`);
  return `"${pattern.replace(/[\\"]/g, (match) => `\\${match}`)}"`;
}

/**
 * Умова «прорахунок цього замовника» для `.or(...)`. У `quotes` немає lead_id, а
 * частина рядків має замовника лише в `customer_name`, тож замовник —
 * це `customer_id` АБО (немає id і назва збігається з торговою чи юридичною),
 * лід — лише збіг назви при порожньому `customer_id`.
 */
export function buildQuoteCustomerOrFilter(customer: CustomerFilterValue): string | null {
  const byName = customerFilterNames(customer).map(
    (name) => `and(customer_id.is.null,customer_name.ilike.${quotePostgrestIlikeEquals(name)})`
  );
  if (customer.kind === "lead") return byName.length > 0 ? byName.join(",") : null;
  const filters = [`customer_id.eq.${customer.id}`, ...byName];
  return filters.join(",");
}

type QuoteListFilterable = {
  in: (column: string, values: string[]) => QuoteListFilterable;
  eq: (column: string, value: string) => QuoteListFilterable;
  or: (filters: string) => QuoteListFilterable;
};

/** Умови списку прорахунків (пошук, статус, менеджер, замовник): спільні для `listQuotes` і лічильників. */
export function applyQuoteListFilters<T>(
  query: T,
  params: {
    escapedSearch: string;
    skuQuoteIds: string[];
    searchableColumns: string[];
    status?: string;
    statuses?: string[];
    managerUserId?: string | null;
    customer?: CustomerFilterValue | null;
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
  const customerFilter = params.customer ? buildQuoteCustomerOrFilter(params.customer) : null;
  if (customerFilter) next = next.or(customerFilter);
  return next as unknown as T;
}

/**
 * Фільтр за замовником у тулбарах прорахунків і дизайн-задач.
 * `null` — фільтра немає. Назви беремо з вибраного рядка, бо звʼязок із
 * замовником у даних не скрізь по id: частина прорахунків і задач знає його
 * лише за назвою.
 */
export type CustomerFilterValue = {
  kind: "customer" | "lead";
  id: string;
  name: string;
  legalName?: string | null;
};

/** Назва для порівняння без регістру й зайвих пробілів. */
export const normalizeCustomerName = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Стабільний рядок для ключів кешу: різні замовники — різні ключі. */
export const customerFilterKey = (value: CustomerFilterValue | null | undefined) =>
  value ? `${value.kind}:${value.id}` : "";

/** Усі назви, під якими замовник може стояти в даних (торгова й юридична). */
export function customerFilterNames(value: CustomerFilterValue): string[] {
  const names = [value.name.trim()];
  if (value.kind === "customer" && value.legalName?.trim()) names.push(value.legalName.trim());
  return names.filter((name, index) => name.length > 0 && names.indexOf(name) === index);
}

/**
 * Чи належить задача замовнику. Три шляхи: id замовника (у metadata бува й id
 * ліда), назва, або прорахунок цього замовника.
 */
export function taskMatchesCustomerFilter(
  task: { customerId?: string | null; customerName?: string | null; quoteId?: string | null },
  value: CustomerFilterValue,
  quoteIds: ReadonlySet<string>
): boolean {
  if (task.customerId && task.customerId === value.id) return true;
  const taskName = normalizeCustomerName(task.customerName);
  if (taskName && customerFilterNames(value).some((name) => normalizeCustomerName(name) === taskName)) return true;
  return Boolean(task.quoteId && quoteIds.has(task.quoteId));
}

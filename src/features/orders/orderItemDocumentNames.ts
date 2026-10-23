/**
 * Назва позиції в рахунку, СП і акті — номенклатура, під якою бухгалтерія
 * веде товар у BAS (REQ-322#p38). Назва моделі з каталогу («Ніж Combo, TM
 * Discover») для цього не годиться: потрібне «Ніж з логотипом». Порожня —
 * друкуємо назву позиції, як досі.
 */
export const itemDocumentName = (item: { name: string; documentName?: string | null }) =>
  item.documentName?.trim() || item.name;

/** Підставити збережені назви в запис замовлення, не перечитуючи його з бази. */
export const withDocumentNames = <T extends { items: Array<{ id: string; documentName?: string | null }> }>(
  record: T,
  names: Map<string, string | null>
): T => ({
  ...record,
  items: record.items.map((item) => (names.has(item.id) ? { ...item, documentName: names.get(item.id) ?? null } : item)),
});

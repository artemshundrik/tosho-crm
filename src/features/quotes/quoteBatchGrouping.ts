import { pluralUk } from "@/lib/lastSeen";

import { quoteTypeLabel } from "./quotes-page/config";

/**
 * Товари з білдера розходяться по прорахунках за типом: мерч в один, поліграфія
 * в другий, «Інше» в третій.
 *
 * Правило було написане двічі — у QuotesPage (збереження) і в
 * QuoteBatchBuilderDialog (лічильник на кнопці), — і обидва рази однаково
 * помилково: позиції «Інше» розсипались по ОКРЕМОМУ прорахунку кожна, бо
 * список будувався через map по товарах, а не через filter по типу. Через це
 * два олівці в одному замовленні ставали двома прорахунками, а разом з ними
 * автоматично зʼявлялось КП, якого ніхто не просив.
 *
 * Тепер правило одне на обидва місця. Якщо міняється воно — міняється тут.
 */
export type QuoteBatchGroupType = "merch" | "print" | "other";

const GROUP_ORDER: QuoteBatchGroupType[] = ["merch", "print", "other"];

export type QuoteBatchGroup<T> = {
  key: QuoteBatchGroupType;
  quoteType: QuoteBatchGroupType;
  products: T[];
};

const normalizeGroupType = (value?: string | null): QuoteBatchGroupType => {
  const normalized = (value ?? "").trim().toLowerCase();
  return GROUP_ORDER.includes(normalized as QuoteBatchGroupType)
    ? (normalized as QuoteBatchGroupType)
    : // Невідомий тип не можна мовчки викидати: раніше такий товар просто
      // зникав зі списку груп і не потрапляв у жоден прорахунок.
      "merch";
};

export function groupProductsForQuotes<T extends { quoteType?: string | null }>(
  products: T[]
): QuoteBatchGroup<T>[] {
  return GROUP_ORDER.map((type) => ({
    key: type,
    quoteType: type,
    products: products.filter((product) => normalizeGroupType(product.quoteType) === type),
  })).filter((group) => group.products.length > 0);
}

/** Рядки на кшталт «Мерч · 3 товари» — щоб розклад було видно ДО збереження. */
export function describeQuoteBatchGroups<T>(groups: QuoteBatchGroup<T>[]): string[] {
  return groups.map(
    (group) =>
      `${quoteTypeLabel(group.quoteType)} · ${pluralUk(group.products.length, "позиція", "позиції", "позицій")}`
  );
}

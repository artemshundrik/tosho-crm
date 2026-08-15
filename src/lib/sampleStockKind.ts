/**
 * Підрозділи складу: «Взірці» й «Залишки на складі» (REQ-38).
 *
 * ЧОМУ ЦЕ НЕ КАТЕГОРІЯ. У складі вже є вільне поле `category` — Одяг, Посуд,
 * Пакування, Термопляшка. Воно відповідає на питання «що це за річ». Підрозділ
 * відповідає на інше: «це товар, який ми брендуємо, чи витратний матеріал, яким
 * пакуємо». Осі різні: «Пакування» — і категорія, і сьогоднішній збірник
 * витратних, а взірець пакування має бути можливий.
 *
 * Модуль без Supabase — щоб розкладку по підрозділах можна було перевірити
 * юнітами, а не очима.
 */

export type StockKind = "sample" | "supply";

/** Порядок підрозділів на сторінці. Взірці першими: їх більшість і саме з ними працюють щодня. */
export const STOCK_KINDS: StockKind[] = ["sample", "supply"];

export const STOCK_KIND_LABELS: Record<StockKind, string> = {
  sample: "Взірці",
  supply: "Залишки на складі",
};

/** Підпис під заголовком — щоб не гадати, що куди класти. */
export const STOCK_KIND_HINTS: Record<StockKind, string> = {
  sample: "Готова продукція, що лежить під брендування",
  supply: "Витратні матеріали: скотч, стрейч, коробки, пупирка",
};

export const DEFAULT_STOCK_KIND: StockKind = "sample";

/**
 * Значення з бази → підрозділ.
 *
 * Усе невідоме, порожнє й `null` стає «Взірцями», а не окремим станом
 * «невідомо»: рядок, який не належить жодному підрозділу, зник би зі сторінки
 * зовсім — а склад мовчки недорахованих позицій гірший за склад, де щось лежить
 * не на тій полиці.
 */
export function normalizeStockKind(value: string | null | undefined): StockKind {
  const normalized = value?.trim().toLowerCase();
  return normalized === "supply" ? "supply" : DEFAULT_STOCK_KIND;
}

/**
 * Розкласти позиції по підрозділах, зберігши вхідний порядок усередині кожного.
 *
 * Повертає ВСІ підрозділи, навіть порожні: підрозділ — це постійна структура
 * сторінки, а не наслідок того, що сьогодні щось завезли. Порожній заголовок
 * каже «тут нічого немає», а відсутній заголовок — «такого підрозділу немає».
 */
export function groupByStockKind<T>(
  items: T[],
  getKind: (item: T) => string | null | undefined
): Array<{ kind: StockKind; items: T[] }> {
  const buckets = new Map<StockKind, T[]>(STOCK_KINDS.map((kind) => [kind, []]));
  for (const item of items) {
    buckets.get(normalizeStockKind(getKind(item)))?.push(item);
  }
  return STOCK_KINDS.map((kind) => ({ kind, items: buckets.get(kind) ?? [] }));
}

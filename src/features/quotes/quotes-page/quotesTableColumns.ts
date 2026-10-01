/**
 * Колонки таблиці прорахунків, ширину яких можна змінити. Чекбокс, «Менеджер»
 * і меню рядка — фіксовані, «Що рахуємо» — гнучка й забирає залишок.
 */
export type QuotesColumnId = "number" | "customer" | "total" | "status" | "deadline";

export const QUOTES_COLUMN_IDS: readonly QuotesColumnId[] = ["number", "customer", "total", "status", "deadline"];

export const QUOTES_COLUMNS: Record<QuotesColumnId, { label: string; def: number; min: number }> = {
  number: { label: "Номер", def: 124, min: 96 },
  customer: { label: "Замовник / Лід", def: 172, min: 124 },
  total: { label: "Сума", def: 128, min: 96 },
  status: { label: "Статус", def: 140, min: 120 },
  deadline: { label: "Дедлайн", def: 100, min: 88 },
};

/** Чекбокс 40 + менеджер 64 + меню 44. */
export const QUOTES_FIXED_COLUMNS_PX = 148;
/** «Що рахуємо» не вужча за це. */
export const QUOTES_FLEX_MIN_PX = 160;
export const QUOTES_COLUMNS_STORAGE_KEY = "quotes-table-columns:v1";

/** Ширина колонки в стилі: змінну пише хук, поки її немає — типова. */
export const quotesColumnWidth = (id: QuotesColumnId) => `var(--qcol-${id}, ${QUOTES_COLUMNS[id].def}px)`;

export type QuotesColumnWidths = Record<QuotesColumnId, number>;

/**
 * Побажані ширини → ті, що вміщаються в контейнер. Якщо не вміщаються —
 * стискаємо пропорційно запасу над мінімумом кожної колонки, тож жодна не
 * вужча за свій мінімум, а горизонтальної прокрутки не буде (хіба що сам
 * контейнер менший за суму мінімумів).
 */
export function resolveQuotesColumnWidths(
  wanted: Partial<Record<QuotesColumnId, number>>,
  containerWidth: number
): QuotesColumnWidths {
  const base = {} as QuotesColumnWidths;
  for (const id of QUOTES_COLUMN_IDS) {
    base[id] = Math.max(QUOTES_COLUMNS[id].min, wanted[id] ?? QUOTES_COLUMNS[id].def);
  }
  const sum = QUOTES_COLUMN_IDS.reduce((acc, id) => acc + base[id], 0);
  const minSum = QUOTES_COLUMN_IDS.reduce((acc, id) => acc + QUOTES_COLUMNS[id].min, 0);
  const target = Math.max(minSum, containerWidth - QUOTES_FIXED_COLUMNS_PX - QUOTES_FLEX_MIN_PX);
  if (containerWidth <= 0 || sum <= target) return base;
  const slack = sum - minSum;
  const need = sum - target;
  const out = {} as QuotesColumnWidths;
  for (const id of QUOTES_COLUMN_IDS) {
    const free = base[id] - QUOTES_COLUMNS[id].min;
    out[id] = Math.floor(base[id] - (slack > 0 ? (free * need) / slack : 0));
  }
  return out;
}

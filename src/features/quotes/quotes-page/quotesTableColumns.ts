import { defineTableColumns, tableColumnWidth } from "@/components/app/table-columns/tableColumns";

/**
 * Колонки таблиці прорахунків, ширину яких можна змінити. Номер не вужчий за
 * 120: «TS-1026-0042» моноширинним займає ~101px, і вужча колонка ховала саме
 * останні цифри — усі рядки читались однаково. Чекбокс, «Менеджер»
 * і меню рядка — фіксовані, «Що рахуємо» — гнучка й забирає залишок.
 */
export type QuotesColumnId = "number" | "customer" | "total" | "status" | "deadline";

export const QUOTES_TABLE_COLUMNS = defineTableColumns<QuotesColumnId>({
  ids: ["number", "customer", "total", "status", "deadline"],
  columns: {
    number: { label: "Номер", def: 136, min: 120 },
    customer: { label: "Замовник / Лід", def: 172, min: 124 },
    total: { label: "Сума", def: 128, min: 96 },
    status: { label: "Статус", def: 140, min: 120 },
    deadline: { label: "Дедлайн", def: 100, min: 88 },
  },
  // Чекбокс 40 + менеджер 88 + меню 44.
  fixedPx: 172,
  flexMinPx: 160,
  storageKey: "quotes-table-columns:v1",
  varPrefix: "qcol",
});

export const QUOTES_COLUMNS = QUOTES_TABLE_COLUMNS.columns;

export const quotesColumnWidth = (id: QuotesColumnId) => tableColumnWidth(QUOTES_TABLE_COLUMNS, id);

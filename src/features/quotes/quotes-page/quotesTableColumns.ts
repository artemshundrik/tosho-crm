import { defineTableColumns, tableColumnWidth } from "@/components/app/table-columns/tableColumns";

/**
 * Колонки таблиці прорахунків, ширину яких можна змінити. Номер не вужчий за
 * 120: «TS-1026-0042» моноширинним займає ~101px, і вужча колонка ховала саме
 * останні цифри — усі рядки читались однаково. Чекбокс, «Менеджер»
 * — фіксовані. «Що рахуємо» тягнеться, як решта; залишок ширини забирає
 * колонка меню рядка в кінці.
 */
export type QuotesColumnId = "number" | "customer" | "title" | "total" | "status" | "deadline";

export const QUOTES_TABLE_COLUMNS = defineTableColumns<QuotesColumnId>({
  ids: ["number", "customer", "title", "total", "status", "deadline"],
  columns: {
    number: { label: "Номер", def: 136, min: 120 },
    customer: { label: "Замовник / Лід", def: 200, min: 124, max: 360 },
    title: { label: "Що рахуємо", def: 340, min: 180, max: 640 },
    total: { label: "Сума", def: 128, min: 96 },
    status: { label: "Статус", def: 140, min: 120 },
    deadline: { label: "Дедлайн", def: 100, min: 88 },
  },
  // Чекбокс 40 + менеджер 88; меню 44 — гнучке.
  grow: "title",
  fixedPx: 128,
  flexMinPx: 44,
  storageKey: "quotes-table-columns:v1",
  varPrefix: "qcol",
});

export const QUOTES_COLUMNS = QUOTES_TABLE_COLUMNS.columns;

export const quotesColumnWidth = (id: QuotesColumnId) => tableColumnWidth(QUOTES_TABLE_COLUMNS, id);

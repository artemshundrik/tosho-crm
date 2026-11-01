import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

/**
 * Колонки таблиці зразків, ширину яких можна змінити. «Товар» — гнучка й
 * забирає залишок; меню рядка нерухоме.
 */
export type SampleStockColumnId = "color" | "qty" | "price" | "total" | "location";

export const SAMPLE_STOCK_TABLE_COLUMNS = defineTableColumns<SampleStockColumnId>({
  ids: ["color", "qty", "price", "total", "location"],
  columns: {
    color: { label: "Колір", def: 150, min: 110 },
    qty: { label: "Залишок", def: 120, min: 96 },
    price: { label: "Ціна", def: 120, min: 96 },
    total: { label: "Сума", def: 130, min: 100 },
    location: { label: "Місце", def: 140, min: 100 },
  },
  // Меню рядка 48.
  fixedPx: 48,
  flexMinPx: 200,
  storageKey: "sample-stock-table-columns:v1",
  varPrefix: "scol",
});

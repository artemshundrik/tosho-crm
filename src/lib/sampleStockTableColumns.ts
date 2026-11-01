import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

/**
 * Колонки таблиці зразків, ширину яких можна змінити. «Товар» тягнеться і
 * першою забирає вільне місце; залишок іде в кінець рядка — колонці меню.
 */
export type SampleStockColumnId = "product" | "color" | "qty" | "price" | "total" | "location";

export const SAMPLE_STOCK_TABLE_COLUMNS = defineTableColumns<SampleStockColumnId>({
  ids: ["product", "color", "qty", "price", "total", "location"],
  columns: {
    product: { label: "Товар", def: 300, min: 180, max: 560 },
    color: { label: "Колір", def: 150, min: 110, max: 280 },
    qty: { label: "Залишок", def: 120, min: 96 },
    price: { label: "Ціна", def: 120, min: 96 },
    total: { label: "Сума", def: 130, min: 100 },
    location: { label: "Місце", def: 140, min: 100, max: 320 },
  },
  // Усе тягнеться; меню рядка 48 — гнучке.
  grow: "product",
  fixedPx: 0,
  flexMinPx: 48,
  storageKey: "sample-stock-table-columns:v2",
  varPrefix: "scol",
});

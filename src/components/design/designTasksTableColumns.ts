import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

/**
 * Колонки таблиці дизайну, ширину яких можна змінити. «Задача» тягнеться і
 * першою забирає вільне місце; залишок іде в кінець рядка — колонці «Дедлайн».
 */
export type DesignColumnId = "number" | "title" | "customer" | "product" | "status" | "assignee";

export const DESIGN_TABLE_COLUMNS = defineTableColumns<DesignColumnId>({
  ids: ["number", "title", "customer", "product", "status", "assignee"],
  columns: {
    number: { label: "Номер", def: 136, min: 120 },
    title: { label: "Задача", def: 300, min: 180, max: 560 },
    customer: { label: "Замовник", def: 200, min: 150, max: 320 },
    product: { label: "Товар", def: 210, min: 170, max: 360 },
    status: { label: "Статус", def: 176, min: 140 },
    assignee: { label: "Виконавець", def: 150, min: 120, max: 280 },
  },
  // Усе тягнеться; дедлайн 96 — гнучкий.
  grow: "title",
  fixedPx: 0,
  flexMinPx: 96,
  storageKey: "design-table-columns:v2",
  varPrefix: "dcol",
});

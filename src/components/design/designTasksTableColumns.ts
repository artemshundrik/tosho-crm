import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

/**
 * Колонки таблиці дизайну, ширину яких можна змінити. «Задача» — гнучка й
 * забирає залишок; «Дедлайн» нерухомий.
 */
export type DesignColumnId = "number" | "customer" | "product" | "status" | "assignee";

export const DESIGN_TABLE_COLUMNS = defineTableColumns<DesignColumnId>({
  ids: ["number", "customer", "product", "status", "assignee"],
  columns: {
    number: { label: "Номер", def: 136, min: 120 },
    customer: { label: "Замовник", def: 200, min: 150 },
    product: { label: "Товар", def: 210, min: 170 },
    status: { label: "Статус", def: 176, min: 140 },
    assignee: { label: "Виконавець", def: 150, min: 120 },
  },
  // Дедлайн 96.
  fixedPx: 96,
  flexMinPx: 160,
  storageKey: "design-table-columns:v1",
  varPrefix: "dcol",
});

import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

/**
 * Колонки таблиці підрядників і постачальників, ширину яких можна змінити.
 * Назва — гнучка й забирає залишок, меню рядка праворуч — фіксоване.
 */
export type ContractorsColumnId = "services" | "contact";

export const CONTRACTORS_TABLE_COLUMNS = defineTableColumns<ContractorsColumnId>({
  ids: ["services", "contact"],
  columns: {
    services: { label: "Послуги", def: 300, min: 200 },
    contact: { label: "Звʼязок", def: 196, min: 160 },
  },
  // Меню рядка 92.
  fixedPx: 92,
  flexMinPx: 200,
  storageKey: "contractors-table-columns:v1",
  varPrefix: "kcol",
});

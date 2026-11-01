import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

/**
 * Колонки таблиці підрядників і постачальників, ширину яких можна змінити.
 * Назва тягнеться і першою забирає вільне місце; залишок іде в кінець рядка — колонці меню.
 */
export type ContractorsColumnId = "name" | "services" | "contact";

export const CONTRACTORS_TABLE_COLUMNS = defineTableColumns<ContractorsColumnId>({
  ids: ["name", "services", "contact"],
  columns: {
    name: { label: "Назва", def: 280, min: 180, max: 520 },
    services: { label: "Послуги", def: 300, min: 200 },
    contact: { label: "Звʼязок", def: 196, min: 160, max: 320 },
  },
  // Усе тягнеться; меню рядка 92 — гнучке.
  grow: "name",
  fixedPx: 0,
  flexMinPx: 92,
  storageKey: "contractors-table-columns:v2",
  varPrefix: "kcol",
});

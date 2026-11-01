import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

export type CustomersColumnId = "entity" | "site" | "manager" | "ltv";

/** Колонки таблиці замовників. «Компанія» — гнучка; «Тип» і меню рядка — фіксовані. */
export const CUSTOMERS_TABLE_COLUMNS = defineTableColumns<CustomersColumnId>({
  ids: ["entity", "site", "manager", "ltv"],
  columns: {
    entity: { label: "Юрособа", def: 240, min: 170 },
    site: { label: "Сайт", def: 150, min: 110 },
    manager: { label: "Менеджер", def: 130, min: 100 },
    ltv: { label: "LTV", def: 196, min: 140 },
  },
  // Тип 76 + меню 48.
  fixedPx: 124,
  flexMinPx: 200,
  storageKey: "customers-table-columns:v1",
  varPrefix: "ccol",
});

export type LeadsColumnId = "contact" | "email" | "phones" | "source" | "site" | "manager";

/** Колонки таблиці лідів. «Компанія» — гнучка; меню рядка — фіксоване. */
export const LEADS_TABLE_COLUMNS = defineTableColumns<LeadsColumnId>({
  ids: ["contact", "email", "phones", "source", "site", "manager"],
  columns: {
    contact: { label: "Контакт", def: 140, min: 100 },
    email: { label: "Email", def: 190, min: 140 },
    phones: { label: "Телефони", def: 140, min: 110 },
    source: { label: "Джерело", def: 110, min: 90 },
    site: { label: "Сайт", def: 140, min: 100 },
    manager: { label: "Менеджер", def: 120, min: 96 },
  },
  // Меню 48.
  fixedPx: 48,
  flexMinPx: 200,
  storageKey: "leads-table-columns:v1",
  varPrefix: "lcol",
});

import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

export type CustomersColumnId = "company" | "entity" | "site" | "manager" | "ltv";

/** Колонки таблиці замовників. «Компанія» тягнеться й першою бере вільне місце; «Тип» фіксований, залишок забирає меню рядка в кінці. */
export const CUSTOMERS_TABLE_COLUMNS = defineTableColumns<CustomersColumnId>({
  ids: ["company", "entity", "site", "manager", "ltv"],
  columns: {
    company: { label: "Компанія", def: 280, min: 180, max: 560 },
    entity: { label: "Юрособа", def: 240, min: 170, max: 360 },
    site: { label: "Сайт", def: 150, min: 110, max: 300 },
    manager: { label: "Менеджер", def: 130, min: 100, max: 280 },
    ltv: { label: "LTV", def: 196, min: 140 },
  },
  // Тип 76; меню 48 — гнучке.
  grow: "company",
  fixedPx: 76,
  flexMinPx: 48,
  storageKey: "customers-table-columns:v2",
  varPrefix: "ccol",
});

export type LeadsColumnId = "company" | "contact" | "email" | "phones" | "source" | "site" | "manager";

/** Колонки таблиці лідів. «Компанія» тягнеться й першою бере вільне місце; залишок забирає меню рядка в кінці. */
export const LEADS_TABLE_COLUMNS = defineTableColumns<LeadsColumnId>({
  ids: ["company", "contact", "email", "phones", "source", "site", "manager"],
  columns: {
    company: { label: "Компанія", def: 280, min: 180, max: 560 },
    contact: { label: "Контакт", def: 140, min: 100, max: 280 },
    email: { label: "Email", def: 190, min: 140, max: 320 },
    phones: { label: "Телефони", def: 140, min: 110 },
    source: { label: "Джерело", def: 110, min: 90 },
    site: { label: "Сайт", def: 140, min: 100, max: 300 },
    manager: { label: "Менеджер", def: 120, min: 96, max: 280 },
  },
  // Меню 48 — гнучке.
  grow: "company",
  fixedPx: 0,
  flexMinPx: 48,
  storageKey: "leads-table-columns:v2",
  varPrefix: "lcol",
});

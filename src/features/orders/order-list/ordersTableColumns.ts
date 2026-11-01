import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

export type OrdersColumnId = "number" | "total" | "payment" | "documents" | "next";

/** Колонки таблиці замовлень у виробництві. «Замовник · що замовили» — гнучка. */
export const ORDERS_TABLE_COLUMNS = defineTableColumns<OrdersColumnId>({
  ids: ["number", "total", "payment", "documents", "next"],
  columns: {
    number: { label: "Номер", def: 140, min: 120 },
    total: { label: "Сума", def: 112, min: 96 },
    payment: { label: "Оплата", def: 132, min: 110 },
    documents: { label: "Документи", def: 116, min: 96 },
    next: { label: "Що далі · чий хід", def: 300, min: 210 },
  },
  // Чекбокс 52 + менеджер 56.
  fixedPx: 108,
  flexMinPx: 200,
  storageKey: "orders-table-columns:v1",
  varPrefix: "ocol",
});

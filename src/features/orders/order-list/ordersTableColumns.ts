import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

export type OrdersColumnId = "number" | "title" | "total" | "payment" | "documents" | "next";

/** Колонки таблиці замовлень у виробництві. «Замовник · що замовили» тягнеться й першою бере вільне місце; залишок забирає колонка менеджера в кінці. */
export const ORDERS_TABLE_COLUMNS = defineTableColumns<OrdersColumnId>({
  ids: ["number", "title", "total", "payment", "documents", "next"],
  columns: {
    number: { label: "Номер", def: 140, min: 120 },
    title: { label: "Замовник · що замовили", def: 320, min: 200, max: 640 },
    total: { label: "Сума", def: 112, min: 96 },
    payment: { label: "Оплата", def: 132, min: 110 },
    documents: { label: "Документи", def: 116, min: 96 },
    next: { label: "Що далі · чий хід", def: 300, min: 210 },
  },
  // Чекбокс 52; менеджер 56 — гнучка.
  grow: "title",
  fixedPx: 52,
  flexMinPx: 56,
  storageKey: "orders-table-columns:v2",
  varPrefix: "ocol",
});

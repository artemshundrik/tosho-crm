import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

export type OrdersQueueColumnId = "number" | "title" | "total" | "payment" | "needs";

/** Колонки черги «Готово до замовлення». «Замовник · що» тягнеться й першою бере вільне місце; залишок забирає колонка менеджера в кінці. */
export const ORDERS_QUEUE_TABLE_COLUMNS = defineTableColumns<OrdersQueueColumnId>({
  ids: ["number", "title", "total", "payment", "needs"],
  columns: {
    number: { label: "Прорахунок", def: 140, min: 120 },
    title: { label: "Замовник · що", def: 300, min: 180, max: 600 },
    total: { label: "Сума", def: 112, min: 96 },
    payment: { label: "Оплата", def: 104, min: 88 },
    needs: { label: "Що треба для замовлення", def: 320, min: 220 },
  },
  // Дія 176; менеджер 52 — гнучка.
  grow: "title",
  fixedPx: 176,
  flexMinPx: 52,
  storageKey: "orders-queue-table-columns:v2",
  varPrefix: "oqcol",
});

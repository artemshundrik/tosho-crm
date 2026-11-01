import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

export type OrdersQueueColumnId = "number" | "total" | "payment" | "needs";

/** Колонки черги «Готово до замовлення». «Замовник · що» — гнучка. */
export const ORDERS_QUEUE_TABLE_COLUMNS = defineTableColumns<OrdersQueueColumnId>({
  ids: ["number", "total", "payment", "needs"],
  columns: {
    number: { label: "Прорахунок", def: 140, min: 120 },
    total: { label: "Сума", def: 112, min: 96 },
    payment: { label: "Оплата", def: 104, min: 88 },
    needs: { label: "Що треба для замовлення", def: 320, min: 220 },
  },
  // Дія 176 + менеджер 52.
  fixedPx: 228,
  flexMinPx: 200,
  storageKey: "orders-queue-table-columns:v1",
  varPrefix: "oqcol",
});

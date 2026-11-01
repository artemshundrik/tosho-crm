import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

/**
 * Колонки реєстру документів, ширину яких можна змінити. «Замовник · підстава»
 * тягнеться і першою забирає вільне місце; «Відп.» нерухома, залишок іде в «Час».
 */
export type DocumentsColumnId = "kind" | "number" | "customer" | "status" | "total";

export const DOCUMENTS_TABLE_COLUMNS = defineTableColumns<DocumentsColumnId>({
  ids: ["kind", "number", "customer", "status", "total"],
  columns: {
    kind: { label: "Тип", def: 112, min: 88 },
    number: { label: "Документ", def: 150, min: 120 },
    customer: { label: "Замовник · підстава", def: 280, min: 180, max: 560 },
    status: { label: "Стан", def: 184, min: 150 },
    total: { label: "Сума", def: 112, min: 92 },
  },
  // Відп. 64; «Час» 64 — гнучка.
  grow: "customer",
  fixedPx: 64,
  flexMinPx: 64,
  storageKey: "documents-table-columns:v2",
  varPrefix: "doccol",
});

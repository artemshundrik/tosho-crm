import { defineTableColumns } from "@/components/app/table-columns/tableColumns";

/**
 * Колонки реєстру документів, ширину яких можна змінити. «Замовник · підстава»
 * — гнучка; «Відп.» і «Час» нерухомі.
 */
export type DocumentsColumnId = "kind" | "number" | "status" | "total";

export const DOCUMENTS_TABLE_COLUMNS = defineTableColumns<DocumentsColumnId>({
  ids: ["kind", "number", "status", "total"],
  columns: {
    kind: { label: "Тип", def: 112, min: 88 },
    number: { label: "Документ", def: 150, min: 120 },
    status: { label: "Стан", def: 184, min: 150 },
    total: { label: "Сума", def: 112, min: 92 },
  },
  // Відп. 64 + Час 64.
  fixedPx: 128,
  flexMinPx: 200,
  storageKey: "documents-table-columns:v1",
  varPrefix: "doccol",
});

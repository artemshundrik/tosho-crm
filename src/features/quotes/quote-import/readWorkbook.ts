import type { ParsedSheet, SheetCellValue, SheetLink } from "./sheetDump";
import { SHEET_DUMP_MAX_COLUMNS, SHEET_DUMP_MAX_ROWS } from "./sheetDump";

/**
 * Читання файлу відбувається В БРАУЗЕРІ (REQ-233): на сервер їде текстовий
 * дамп, а не файл.
 *
 * SheetJS підвантажується динамічним `import` — бібліотека важить під мегабайт,
 * і тягнути її в кожне відкриття картки прорахунку заради дії, яку роблять раз
 * на тиждень, не варте нічого. Пакет береться з офіційного CDN SheetJS
 * (package.json), бо в npm лишилась версія 2022 року з двома відомими дірками
 * розбору — а розбираємо ми саме чужі файли.
 */

/** Розширення, які ми беремо. Все інше — відмова ще до читання. */
export const QUOTE_IMPORT_ACCEPT = ".xlsx,.xls,.xlsm,.csv";

const ALLOWED_EXTENSIONS = ["xlsx", "xls", "xlsm", "csv"];

/** Стеля файлу. Більше — це вже не запит клієнта, а вивантаження бази. */
export const QUOTE_IMPORT_MAX_FILE_BYTES = 12 * 1024 * 1024;

export function isSupportedImportFile(fileName: string): boolean {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return false;
  return ALLOWED_EXTENSIONS.includes(fileName.slice(dot + 1).toLowerCase());
}

type SheetJsCell = {
  v?: unknown;
  w?: string;
  t?: string;
  l?: { Target?: string };
};

export async function readWorkbookSheets(file: File): Promise<ParsedSheet[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });

  const sheets: ParsedSheet[] = [];
  for (const name of workbook.SheetNames) {
    const worksheet = workbook.Sheets[name];
    if (!worksheet?.["!ref"]) continue;
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    const rows: SheetCellValue[][] = [];
    const links: SheetLink[] = [];

    const lastRow = Math.min(range.e.r, range.s.r + SHEET_DUMP_MAX_ROWS - 1);
    const lastCol = Math.min(range.e.c, range.s.c + SHEET_DUMP_MAX_COLUMNS - 1);

    for (let r = range.s.r; r <= lastRow; r += 1) {
      const cells: SheetCellValue[] = [];
      for (let c = range.s.c; c <= lastCol; c += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r, c })] as SheetJsCell | undefined;
        // `v` — значення, `w` — те, як його показує Excel. Числа беремо
        // значенням (інакше «319,00» приїхало б текстом із комою), а решту —
        // тим, що бачить людина.
        const value =
          cell === undefined
            ? null
            : typeof cell.v === "number" || cell.v instanceof Date
              ? (cell.v as SheetCellValue)
              : ((cell.w ?? cell.v ?? null) as SheetCellValue);
        cells.push(value);
        const target = cell?.l?.Target?.trim();
        if (target) links.push({ row: r + 1, url: target });
      }
      // Рядок кладемо за його індексом у файлі: дамп рахує номери саме так.
      rows[r] = cells;
    }

    for (let r = 0; r < rows.length; r += 1) {
      if (!rows[r]) rows[r] = [];
    }

    sheets.push({ name, rows, links });
  }

  return sheets;
}

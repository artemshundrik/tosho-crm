/**
 * Дамп аркуша: з того, що прочитав SheetJS, у текст, який поїде в модель.
 *
 * ЧОМУ ТЕКСТ, А НЕ ФАЙЛ. Файл довелося б вантажити на сервер і розбирати там —
 * зайвий круг, зайва пам'ять у функції й зайва поверхня (розбір чужого
 * бінарника). Браузер уже має файл у руках, а моделі потрібні лише рядки.
 *
 * НОМЕР РЯДКА — ПЕРША КОЛОНКА, і це не оздоблення: модель повертає
 * `sourceRows`, а менеджер у прев'ю має змогти відкрити файл і звірити рядок.
 * Тому нумерація тут — своя, від одиниці, а не адреса комірки Excel: після
 * викидання порожніх рядків адреси все одно розійшлися б.
 */

export type SheetCellValue = string | number | boolean | Date | null | undefined;

/** Гіперпосилання комірки — прив'язане до рядка аркуша (нумерація Excel, з 1). */
export type SheetLink = { row: number; url: string };

export type ParsedSheet = {
  name: string;
  /** Рядки аркуша підряд, включно з порожніми: індекс масиву = рядок Excel − 1. */
  rows: SheetCellValue[][];
  links: SheetLink[];
};

export type SheetDump = {
  text: string;
  rowCount: number;
  linkCount: number;
  truncated: boolean;
};

/**
 * Стеля дампа. Більший файл — це вже не запит клієнта, а вивантаження бази:
 * і модель на ньому дорога, і розбір безглуздий.
 */
export const SHEET_DUMP_MAX_CHARS = 250_000;

/** Скільки колонок і рядків узагалі читаємо — захист від «аркуша на мільйон». */
export const SHEET_DUMP_MAX_ROWS = 3_000;
export const SHEET_DUMP_MAX_COLUMNS = 60;

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  // Excel любить віддавати 319.00000000000006. Округлення до шести знаків
  // прибирає хвіст подання, не чіпаючи справжніх копійок.
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

function formatCell(value: SheetCellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "так" : "ні";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  // Переноси всередині комірки ламали б рядкову структуру дампа, а саме за
  // рядками модель і рахує `sourceRows`.
  return value.replace(/\s+/g, " ").trim();
}

function dropTrailingEmpty(cells: string[]): string[] {
  let end = cells.length;
  while (end > 0 && cells[end - 1] === "") end -= 1;
  return cells.slice(0, end);
}

/**
 * Зібрати дамп усіх непорожніх аркушів.
 *
 * Посилання йдуть окремою секцією внизу, а не всередині рядка: у файлі KMZ їх
 * тридцять, і вклеєні в рядок вони б з'їли більше токенів, ніж самі дані.
 */
export function buildSheetDump(
  sheets: ParsedSheet[],
  options?: { maxChars?: number }
): SheetDump {
  const maxChars = options?.maxChars ?? SHEET_DUMP_MAX_CHARS;
  const multiSheet = sheets.filter((sheet) => sheet.rows.some((row) => dropTrailingEmpty(row.map(formatCell)).length > 0)).length > 1;

  const blocks: string[] = [];
  const linkLines: string[] = [];
  const seenLinks = new Set<string>();
  let rowCount = 0;

  for (const sheet of sheets) {
    const lines: string[] = [];
    const usedRows = new Set<number>();

    sheet.rows.slice(0, SHEET_DUMP_MAX_ROWS).forEach((row, index) => {
      const cells = dropTrailingEmpty(row.slice(0, SHEET_DUMP_MAX_COLUMNS).map(formatCell));
      if (cells.length === 0) return;
      const rowNumber = index + 1;
      usedRows.add(rowNumber);
      lines.push(`${rowNumber}\t${cells.join("\t")}`);
    });

    if (lines.length === 0) continue;
    rowCount += lines.length;

    for (const link of sheet.links) {
      const url = (link.url ?? "").trim();
      if (!url || !usedRows.has(link.row)) continue;
      const key = `${sheet.name}#${link.row}#${url}`;
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      linkLines.push(multiSheet ? `${sheet.name}!${link.row}\t${url}` : `${link.row}\t${url}`);
    }

    blocks.push(multiSheet ? `=== Аркуш: ${sheet.name}\n${lines.join("\n")}` : lines.join("\n"));
  }

  const parts = [...blocks];
  if (linkLines.length > 0) {
    parts.push(`=== Посилання (рядок → адреса)\n${linkLines.join("\n")}`);
  }

  const full = parts.join("\n\n");
  const truncated = full.length > maxChars;
  return {
    text: truncated ? `${full.slice(0, maxChars)}\n… дамп обрізано` : full,
    rowCount,
    linkCount: linkLines.length,
    truncated,
  };
}

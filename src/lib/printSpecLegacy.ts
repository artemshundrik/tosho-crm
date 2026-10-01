import {
  CUSTOM_OPTION_VALUE,
  PRINT_SPEC_NOTEBOOK,
  PRINT_SPEC_NOTE_BLOCKS,
  PRINT_SPEC_PACKAGE,
  createEmptyPrintSpecValues,
  customValueKey,
  parsePrintSpecMetadata,
  reconcilePrintSpecValues,
  type PrintSpecMetadata,
  type PrintSpecPreset,
} from "@/lib/printSpec";

/**
 * Старі позиції пакета, блокнота й блоків для записів — у формат опису полів
 * (REQ-323#p4).
 *
 * ЧОМУ НА ЧИТАННІ, А НЕ МІГРАЦІЄЮ. Записати в `quote_items` скриптом не можна:
 * тригер перерахунку сум пускає лише учасника команди, а сеанс psql ним не є.
 * Позицій старого формату дві (пакет «На погодженні» й скасований блокнот, замір
 * 01.10.2026), і переписувати їх від чужого імені заради двох рядків — гірше,
 * ніж читати. Тож `metadata.printProduct` у базі лишається як є, а картка бачить
 * той самий `printSpec`, що й у нових позицій: стовпчики, підсвічення, версії.
 * Перше збереження з панелі запише вже справжній `printSpec` — і зробить знімок
 * версії, бо пакет на момент переїзду вже мав ціну.
 *
 * Старий сертифікат (`print_certificates`) сюди не входить: позицій із ним немає
 * жодної, а описовий сертифікат має інший ключ.
 */

/** Поле опису ← ключ старої конфігурації; пара — разом із текстом старого «Інше». */
type LegacyFieldMap = Record<string, string | [choice: string, customText: string]>;

const PACKAGE_FIELDS: LegacyFieldMap = {
  packageType: "packageType",
  supplierLink: "supplierLink",
  orientation: "orientation",
  paperType: "paperType",
  kraftColor: "kraftColor",
  density: "density",
  printSides: "printSides",
  printType: "printType",
  pantoneCount: "pantoneCount",
  stickerSize: "stickerSize",
  lamination: "lamination",
  extraFinishing: "extraFinishing",
  embossing: "embossing",
  handleType: "handleType",
  eyelets: "eyelets",
};

const NOTEBOOK_FIELDS: LegacyFieldMap = {
  format: ["notebookFormat", "notebookFormatCustom"],
  coverMaterial: "notebookCoverMaterial",
  coverStock: ["notebookCoverStock", "notebookCoverStockCustom"],
  coverPrint: "notebookCoverPrint",
  coverPantoneCount: "notebookCoverPantoneCount",
  lamination: "notebookLamination",
  laminationSides: "notebookLaminationSides",
  spotUv: "notebookSpotUv",
  spotUvCoverage: "notebookSpotUvCoverage",
  otherFinishing: "notebookCoverOtherFinishing",
  blockPaper: "notebookBlockPaper",
  blockDensity: ["notebookBlockDensity", "notebookBlockDensityCustom"],
  sheetCount: ["notebookSheetCount", "notebookSheetCountCustom"],
  blockPrint: "notebookBlockPrint",
  blockPantoneCount: "notebookBlockPantoneCount",
  binding: "notebookBinding",
  bindingSide: "notebookBindingSide",
};

const NOTE_BLOCK_FIELDS: LegacyFieldMap = {
  format: ["noteBlockFormat", "noteBlockFormatCustom"],
  paper: ["noteBlockPaper", "noteBlockPaperCustom"],
  density: ["noteBlockDensity", "noteBlockDensityCustom"],
  sheetCount: ["noteBlockSheetCount", "noteBlockSheetCountCustom"],
  print: "noteBlockPrint",
  pantoneCount: "noteBlockPantoneCount",
  hasCover: "noteBlockHasCover",
  glue: "noteBlockGlue",
  glueSide: "noteBlockGlueSide",
};

/** Який старий вид у який опис іде й звідки береться кожне поле. Експорт — для перевірки, що нічого не загубилось. */
export const LEGACY_PRINT_KINDS: Record<string, { preset: PrintSpecPreset; fields: LegacyFieldMap }> = {
  package: { preset: PRINT_SPEC_PACKAGE, fields: PACKAGE_FIELDS },
  notebook: { preset: PRINT_SPEC_NOTEBOOK, fields: NOTEBOOK_FIELDS },
  note_blocks: { preset: PRINT_SPEC_NOTE_BLOCKS, fields: NOTE_BLOCK_FIELDS },
};

/** Вид за ключем пресета — коли `productKind` у старій конфігурації порожній. */
const KIND_BY_PRESET: Record<string, string> = {
  print_package: "package",
  print_notebook: "notebook",
  print_note_blocks: "note_blocks",
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const text = (record: Record<string, unknown>, key: string): string =>
  typeof record[key] === "string" ? (record[key] as string).trim() : "";

/** Стара конфігурація з `quote_items.metadata` → `printSpec`; `null` — це не старий пакет/блокнот/блоки. */
export function printSpecFromLegacyMetadata(metadata: unknown): PrintSpecMetadata | null {
  const record = asRecord(metadata);
  const config = asRecord(record?.printProduct) ?? asRecord(record?.printPackage);
  if (!record || !config) return null;

  const kind = text(config, "productKind") || KIND_BY_PRESET[text(record, "configuratorPreset")] || "";
  const legacy = LEGACY_PRINT_KINDS[kind];
  if (!legacy) return null;

  const { preset, fields } = legacy;
  const values = createEmptyPrintSpecValues(preset);

  for (const field of preset.fields) {
    const source = fields[field.id];
    if (!source) continue;
    const [choiceKey, customKey] = Array.isArray(source) ? source : [source, null];
    const raw = text(config, choiceKey);
    if (!raw) continue;

    const isOption = field.options?.some((option) => option.value === raw) ?? false;
    if (field.type !== "single" || isOption || !field.allowCustom) {
      // Невідоме опису значення лишаємо як є: краще сирий рядок на картці, ніж
      // тихо зниклий вибір.
      values[field.id] = raw;
      continue;
    }
    // Старе «Інше» з текстом поруч — або значення, якого в списку немає, — стає «Інше…».
    values[field.id] = CUSTOM_OPTION_VALUE;
    values[customValueKey(field.id)] =
      raw === "other" ? (customKey ? text(config, customKey) : "") || "Інше" : raw;
  }

  if (kind === "package") {
    const size = { width: text(config, "widthMm"), height: text(config, "heightMm"), depth: text(config, "lengthMm") };
    if (size.width || size.height || size.depth) values.size = [size];
  }

  return { presetKey: preset.key, values: reconcilePrintSpecValues(preset, values) };
}

/**
 * Параметри виробу позиції: збережений `printSpec`, а якщо його немає — старий
 * формат, перекладений на опис. Один вхід для картки й для запису з панелі: інакше
 * перша правка старої позиції вважалась би першим заповненням і не робила знімка.
 */
export function readQuoteItemPrintSpec(metadata: unknown): PrintSpecMetadata | null {
  return parsePrintSpecMetadata(asRecord(metadata)?.printSpec) ?? printSpecFromLegacyMetadata(metadata);
}

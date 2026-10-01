import { describe, expect, it } from "vitest";

import { createEmptyPrintPackageConfig } from "@/lib/printPackage";
import { formatPrintSpecSummary, getPrintSpecPreset, type PrintSpecMetadata } from "@/lib/printSpec";
import { LEGACY_PRINT_KINDS, printSpecFromLegacyMetadata, readQuoteItemPrintSpec } from "@/lib/printSpecLegacy";

/**
 * Переїзд пакета, блокнота й блоків на опис полів (REQ-323#p4).
 *
 * Дві позиції нижче — справжні записи з бази на 01.10.2026 (лише значущі ключі):
 * пакет у прорахунку «На погодженні» і блокнот у скасованому. Переписати їх
 * скриптом не можна, тому картка перекладає старий формат при читанні — і саме
 * цей переклад має не загубити жодної відповіді.
 */

const legacyItem = (config: Record<string, string>, preset: string) => ({
  configuratorPreset: preset,
  printProduct: { ...createEmptyPrintPackageConfig(), ...config },
});

const PROD_PACKAGE = legacyItem(
  {
    productKind: "package",
    packageType: "custom",
    widthMm: "290",
    heightMm: "340",
    lengthMm: "120",
    orientation: "vertical",
    paperType: "cardboard",
    density: "205",
    handleType: "cord",
    eyelets: "yes",
    printSides: "one_side",
    printType: "pantone",
    pantoneCount: "2",
    lamination: "matte",
    extraFinishing: "spot_uv_25",
    embossing: "none",
  },
  "print_package"
);

const PROD_NOTEBOOK = legacyItem(
  {
    productKind: "notebook",
    notebookFormat: "a5",
    notebookCoverMaterial: "coated_paper",
    notebookCoverStock: "350",
    notebookCoverPrint: "4_4",
    notebookLamination: "matte",
    notebookLaminationSides: "1_0",
    notebookSpotUv: "no",
    notebookBlockPaper: "offset",
    notebookBlockDensity: "90",
    notebookSheetCount: "other",
    notebookSheetCountCustom: "40",
    notebookBlockPrint: "4_4",
    notebookBinding: "spring",
    notebookBindingSide: "long",
  },
  "print_notebook"
);

const summaryOf = (spec: PrintSpecMetadata | null) => {
  const preset = getPrintSpecPreset(spec?.presetKey);
  if (!spec || !preset) throw new Error("немає опису");
  return formatPrintSpecSummary(preset, spec.values);
};

describe("старі позиції поліграфії на описі полів", () => {
  it("пакет із бази читається повністю, разом із розміром у три виміри", () => {
    const spec = printSpecFromLegacyMetadata(PROD_PACKAGE);

    expect(spec?.presetKey).toBe("print_package");
    expect(summaryOf(spec)).toEqual([
      "Виріб: Паперовий пакет",
      "Тип пакета: Індивідуальний",
      "Розмір (Ш × В × Г): 290 × 340 × 120 мм",
      "Орієнтація: Вертикальний",
      "Матеріал: Картон",
      "Щільність: 205 г/м²",
      "Кількість нанесень: З одної сторони",
      "Тип нанесення: Pantone",
      "Кількість пантонів: 2 шт",
      "Ламінація: Матова",
      "Додаткове оздоблення: Вибірковий лак (до 25%)",
      "Тиснення: Немає",
      "Ручки: Шнурок",
      "Люверси: Так",
    ]);
  });

  it("блокнот із бази: старе «Інше» з числом стає «Інше…» з тим самим числом", () => {
    const spec = printSpecFromLegacyMetadata(PROD_NOTEBOOK);

    expect(spec?.values.sheetCount).toBe("__custom");
    expect(summaryOf(spec)).toEqual([
      "Виріб: Блокнот",
      "Формат: A5",
      "Матеріал обкладинки: Крейдований папір",
      "Щільність обкладинки: 350 г/м²",
      "Друк обкладинки: 4+4",
      "Ламінація: Мат",
      "Сторони ламінації: 1+0",
      "Вибірковий лак: Ні",
      "Папір блоку: Офсет",
      "Щільність блоку: 90 г/м²",
      "Кількість аркушів: 40",
      "Друк блоку: 4+4",
      "Метод скріплення: Пружина",
      "Сторона скріплення: По довгій стороні",
    ]);
  });

  it("блоки для записів: Pantone з кількістю і проклейка", () => {
    const spec = printSpecFromLegacyMetadata(
      legacyItem(
        {
          productKind: "note_blocks",
          noteBlockFormat: "other",
          noteBlockFormatCustom: "90×90 мм",
          noteBlockHasCover: "no",
          noteBlockPaper: "offset",
          noteBlockDensity: "80",
          noteBlockSheetCount: "100",
          noteBlockPrint: "pantone",
          noteBlockPantoneCount: "1",
          noteBlockGlue: "yes",
          noteBlockGlueSide: "top",
        },
        "print_note_blocks"
      )
    );

    expect(summaryOf(spec)).toEqual([
      "Виріб: Блоки для записів",
      "Формат: 90×90 мм",
      "Папір: Офсет",
      "Щільність: 80 г/м²",
      "Кількість аркушів: 100 аркушів",
      "Друк: Pantone",
      "Кількість пантонів: 1 шт",
      "Обкладинка: Ні",
      "Клей: Так",
      "Сторона проклейки: Зверху",
    ]);
  });

  it("«Інше» без тексту не губиться: лишається словом «Інше»", () => {
    const spec = printSpecFromLegacyMetadata(
      legacyItem({ productKind: "notebook", notebookCoverMaterial: "other" }, "print_notebook")
    );

    expect(summaryOf(spec)).toContain("Матеріал обкладинки: Інше");
  });

  it("порожній вид у старій конфігурації береться з пресета позиції", () => {
    const spec = printSpecFromLegacyMetadata(legacyItem({ productKind: "", packageType: "ready" }, "print_package"));

    expect(spec?.presetKey).toBe("print_package");
    expect(summaryOf(spec)).toContain("Тип пакета: Готовий");
  });

  /*
    Структурна гарантія «нічого не загубили»: кожне поле старої конфігурації,
    яке стосується виду, має куди переїхати. Новий ключ у старому форматі без
    рядка в перекладі впаде тут, а не мовчки зникне з картки.
  */
  it.each([
    ["notebook", (key: string) => key.startsWith("notebook")],
    ["note_blocks", (key: string) => key.startsWith("noteBlock")],
    [
      "package",
      (key: string) => !/^(notebook|noteBlock|certificate|productKind)/.test(key),
    ],
  ] as const)("%s: кожне старе поле має пару в описі", (kind, belongs) => {
    const legacyKeys = Object.keys(createEmptyPrintPackageConfig()).filter(belongs);
    const mapped = new Set(Object.values(LEGACY_PRINT_KINDS[kind].fields).flat());
    if (kind === "package") ["widthMm", "heightMm", "lengthMm"].forEach((key) => mapped.add(key));

    expect(legacyKeys.filter((key) => !mapped.has(key))).toEqual([]);
    const preset = LEGACY_PRINT_KINDS[kind].preset;
    for (const fieldId of Object.keys(LEGACY_PRINT_KINDS[kind].fields)) {
      expect(preset.fields.map((field) => field.id), `${kind}: поле ${fieldId}`).toContain(fieldId);
    }
  });
});

describe("що читає картка", () => {
  it("збережений printSpec перемагає старий формат", () => {
    const saved = { presetKey: "print_package", values: { packageType: "ready" } };
    const spec = readQuoteItemPrintSpec({ ...PROD_PACKAGE, printSpec: saved });

    expect(spec?.values.packageType).toBe("ready");
  });

  it("позиція без поліграфії нічого не отримує", () => {
    expect(readQuoteItemPrintSpec({ sku: "ART-1" })).toBeNull();
    expect(readQuoteItemPrintSpec(null)).toBeNull();
    // Старий сертифікат не переїжджає: позицій із ним немає, і в опису інший ключ.
    expect(
      readQuoteItemPrintSpec(legacyItem({ productKind: "certificates" }, "print_certificates"))
    ).toBeNull();
  });
});

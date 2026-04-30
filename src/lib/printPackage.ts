export type PrintConfiguratorPreset = "print_package" | "print_notebook" | "print_note_blocks";

export type PrintProductKind = "package" | "notebook" | "note_blocks";

export type PrintProductConfig = {
  productKind: PrintProductKind | "";
  supplierLink: string;
  packageType: string;
  widthMm: string;
  heightMm: string;
  lengthMm: string;
  orientation: string;
  paperType: string;
  kraftColor: string;
  density: string;
  handleType: string;
  eyelets: string;
  printSides: string;
  printType: string;
  pantoneCount: string;
  stickerSize: string;
  lamination: string;
  extraFinishing: string;
  embossing: string;
  notebookFormat: string;
  notebookFormatCustom: string;
  notebookCoverMaterial: string;
  notebookCoverStock: string;
  notebookCoverStockCustom: string;
  notebookCoverPrint: string;
  notebookCoverPantoneCount: string;
  notebookLamination: string;
  notebookLaminationSides: string;
  notebookSpotUv: string;
  notebookSpotUvCoverage: string;
  notebookCoverOtherFinishing: string;
  notebookBlockPaper: string;
  notebookBlockDensity: string;
  notebookBlockDensityCustom: string;
  notebookSheetCount: string;
  notebookSheetCountCustom: string;
  notebookBlockPrint: string;
  notebookBlockPantoneCount: string;
  notebookBinding: string;
  notebookBindingSide: string;
  noteBlockFormat: string;
  noteBlockFormatCustom: string;
  noteBlockHasCover: string;
  noteBlockPaper: string;
  noteBlockPaperCustom: string;
  noteBlockDensity: string;
  noteBlockDensityCustom: string;
  noteBlockSheetCount: string;
  noteBlockSheetCountCustom: string;
  noteBlockPrint: string;
  noteBlockPantoneCount: string;
  noteBlockGlue: string;
  noteBlockGlueSide: string;
};

export type PrintPackageConfig = PrintProductConfig;

export type QuoteItemMetadata = {
  sku?: string | null;
  catalogVariant?: {
    id: string;
    name: string;
    sku?: string | null;
    imageUrl?: string | null;
  } | null;
  configuratorPreset?: PrintConfiguratorPreset | null;
  printProduct?: PrintProductConfig | null;
  printPackage?: PrintProductConfig | null;
};

export type PrintPackageDetailField = {
  label: string;
  value: string;
};

export type PrintProductDetailSection = {
  title: string;
  fields: PrintPackageDetailField[];
};

const YES_NO_LABEL = (value: string) => (value === "yes" ? "так" : value === "no" ? "ні" : null);

const PACKAGE_PAPER_TYPE_LABELS: Record<string, string> = {
  cardboard: "картон",
  paper: "папір",
  kraft: "крафт",
};

const PACKAGE_HANDLE_LABELS: Record<string, string> = {
  ribbon: "лента",
  cord: "шнурок",
  twisted_paper: "кручена паперова",
  flat_paper: "плоска паперова",
};

const PACKAGE_PRINT_SIDE_LABELS: Record<string, string> = {
  one_side: "з одної сторони",
  two_sides: "з двох сторін",
};

const PACKAGE_PRINT_TYPE_LABELS: Record<string, string> = {
  cmyk: "CMYK",
  pantone: "Pantone",
  cmyk_pantone: "CMYK+Pantone",
  uv_dtf: "УФ-DTF",
  uv_print: "УФ-друк",
  screen_print: "Трафарет",
  sticker: "Наліпка/стікер",
};

const PACKAGE_FINISHING_LABELS: Record<string, string> = {
  none: "немає",
  spot_uv_25: "вибірковий лак (до 25%)",
  spot_uv_40: "вибірковий лак (до 40%)",
};

const PACKAGE_EMBOSSING_LABELS: Record<string, string> = {
  none: "немає",
  blind_1: "конгрев (сліпе) з одної сторони",
  blind_2: "конгрев (сліпе) з двох сторін",
  foil_1: "фольга з одної сторони",
  foil_2: "фольга з двох сторін",
};

const PACKAGE_LAMINATION_LABELS: Record<string, string> = {
  matte: "матова",
  gloss: "глянцева",
  no: "без ламінації",
  yes: "є, тип не вказано",
};

const NOTEBOOK_FORMAT_LABELS: Record<string, string> = {
  a4: "A4",
  a5: "A5",
  a6: "A6",
  other: "Інше",
};

const NOTEBOOK_COVER_MATERIAL_LABELS: Record<string, string> = {
  coated_paper: "крейдований папір",
  carton: "картон",
  other: "інше",
};

const NOTEBOOK_COVER_STOCK_LABELS: Record<string, string> = {
  "300": "300 г/м2",
  "350": "350 г/м2",
  other: "інше",
};

const NOTEBOOK_PRINT_LABELS: Record<string, string> = {
  "4_0": "4+0",
  "4_4": "4+4",
  pantone: "Pantone",
  "1_0": "1+0",
  "2_0": "2+0",
  "1_1": "1+1",
  "2_2": "2+2",
};

const NOTEBOOK_LAMINATION_LABELS: Record<string, string> = {
  matte: "мат",
  gloss: "глянець",
};

const NOTEBOOK_LAMINATION_SIDE_LABELS: Record<string, string> = {
  "1_0": "1+0",
  "1_1": "1+1",
};

const NOTEBOOK_SPOT_UV_COVERAGE_LABELS: Record<string, string> = {
  "25": "до 25%",
  "40": "до 40%",
};

const NOTEBOOK_BLOCK_PAPER_LABELS: Record<string, string> = {
  offset: "офсет",
  design_paper: "диз. папір",
};

const NOTEBOOK_BLOCK_DENSITY_LABELS: Record<string, string> = {
  "80": "80 г/м2",
  "90": "90 г/м2",
  other: "інше",
};

const NOTEBOOK_SHEET_COUNT_LABELS: Record<string, string> = {
  "25": "25 аркушів",
  "50": "50 аркушів",
  other: "інше",
};

const NOTEBOOK_BINDING_LABELS: Record<string, string> = {
  spring: "пружина",
  glue: "клей",
};

const BINDING_SIDE_LABELS: Record<string, string> = {
  short: "по короткій стороні",
  long: "по довгій стороні",
};

const NOTE_BLOCK_FORMAT_LABELS: Record<string, string> = {
  "85x85": "85×85",
  "95x95": "95×95",
  other: "інше",
};

const NOTE_BLOCK_PAPER_LABELS: Record<string, string> = {
  offset: "офсет",
  other: "інше",
};

const NOTE_BLOCK_DENSITY_LABELS: Record<string, string> = {
  "80": "80 г/м2",
  "90": "90 г/м2",
  other: "інше",
};

const NOTE_BLOCK_SHEET_COUNT_LABELS: Record<string, string> = {
  "50": "50 аркушів",
  "100": "100 аркушів",
  "200": "200 аркушів",
  other: "інше",
};

const NOTE_BLOCK_GLUE_SIDE_LABELS: Record<string, string> = {
  top: "зверху",
  left: "ліворуч",
};

const PRODUCT_LABELS: Record<PrintProductKind, string> = {
  package: "Пакет",
  notebook: "Блокнот",
  note_blocks: "Блоки для записів",
};

const getLabel = (map: Record<string, string>, value: string, custom?: string) => {
  if (!value) return null;
  if (value === "other") return custom?.trim() || "Інше";
  return map[value] ?? custom?.trim() ?? value;
};

const getPantoneSuffix = (count: string) => {
  const value = count.trim();
  return value ? ` (${value} Pantone)` : "";
};

const getPackageLaminationLabel = (value: string) => {
  if (!value) return null;
  return PACKAGE_LAMINATION_LABELS[value] ?? value;
};

export const createEmptyPrintPackageConfig = (): PrintProductConfig => ({
  productKind: "",
  supplierLink: "",
  packageType: "",
  widthMm: "",
  heightMm: "",
  lengthMm: "",
  orientation: "",
  paperType: "",
  kraftColor: "",
  density: "",
  handleType: "",
  eyelets: "",
  printSides: "",
  printType: "",
  pantoneCount: "",
  stickerSize: "",
  lamination: "",
  extraFinishing: "none",
  embossing: "none",
  notebookFormat: "",
  notebookFormatCustom: "",
  notebookCoverMaterial: "",
  notebookCoverStock: "",
  notebookCoverStockCustom: "",
  notebookCoverPrint: "",
  notebookCoverPantoneCount: "",
  notebookLamination: "",
  notebookLaminationSides: "",
  notebookSpotUv: "no",
  notebookSpotUvCoverage: "",
  notebookCoverOtherFinishing: "",
  notebookBlockPaper: "",
  notebookBlockDensity: "",
  notebookBlockDensityCustom: "",
  notebookSheetCount: "",
  notebookSheetCountCustom: "",
  notebookBlockPrint: "",
  notebookBlockPantoneCount: "",
  notebookBinding: "",
  notebookBindingSide: "",
  noteBlockFormat: "",
  noteBlockFormatCustom: "",
  noteBlockHasCover: "",
  noteBlockPaper: "",
  noteBlockPaperCustom: "",
  noteBlockDensity: "",
  noteBlockDensityCustom: "",
  noteBlockSheetCount: "",
  noteBlockSheetCountCustom: "",
  noteBlockPrint: "",
  noteBlockPantoneCount: "",
  noteBlockGlue: "",
  noteBlockGlueSide: "",
});

export const getConfiguratorProductLabel = (preset: PrintConfiguratorPreset): string => {
  switch (preset) {
    case "print_package":
      return PRODUCT_LABELS.package;
    case "print_notebook":
      return PRODUCT_LABELS.notebook;
    case "print_note_blocks":
      return PRODUCT_LABELS.note_blocks;
  }
};

export const getProductKindFromPreset = (preset: PrintConfiguratorPreset): PrintProductKind => {
  switch (preset) {
    case "print_package":
      return "package";
    case "print_notebook":
      return "notebook";
    case "print_note_blocks":
      return "note_blocks";
  }
};

export const getPresetFromProductKind = (productKind: PrintProductKind): PrintConfiguratorPreset => {
  switch (productKind) {
    case "package":
      return "print_package";
    case "notebook":
      return "print_notebook";
    case "note_blocks":
      return "print_note_blocks";
  }
};

export const getPrintProductConfig = (metadata?: QuoteItemMetadata | null): PrintProductConfig | null =>
  metadata?.printProduct ?? metadata?.printPackage ?? null;

export function formatPrintProductSummary(config: PrintProductConfig): string[] {
  if (config.productKind === "notebook") {
    const formatLabel = getLabel(NOTEBOOK_FORMAT_LABELS, config.notebookFormat, config.notebookFormatCustom);
    const coverMaterialLabel = getLabel(NOTEBOOK_COVER_MATERIAL_LABELS, config.notebookCoverMaterial);
    const coverStockLabel = getLabel(NOTEBOOK_COVER_STOCK_LABELS, config.notebookCoverStock, config.notebookCoverStockCustom);
    const coverPrintLabel = getLabel(NOTEBOOK_PRINT_LABELS, config.notebookCoverPrint);
    const laminationLabel = getLabel(NOTEBOOK_LAMINATION_LABELS, config.notebookLamination);
    const laminationSidesLabel = getLabel(NOTEBOOK_LAMINATION_SIDE_LABELS, config.notebookLaminationSides);
    const blockPaperLabel = getLabel(NOTEBOOK_BLOCK_PAPER_LABELS, config.notebookBlockPaper);
    const blockDensityLabel = getLabel(
      NOTEBOOK_BLOCK_DENSITY_LABELS,
      config.notebookBlockDensity,
      config.notebookBlockDensityCustom
    );
    const sheetCountLabel = getLabel(
      NOTEBOOK_SHEET_COUNT_LABELS,
      config.notebookSheetCount,
      config.notebookSheetCountCustom
    );
    const blockPrintLabel = getLabel(NOTEBOOK_PRINT_LABELS, config.notebookBlockPrint);
    const bindingLabel = getLabel(NOTEBOOK_BINDING_LABELS, config.notebookBinding);
    const bindingSideLabel = getLabel(BINDING_SIDE_LABELS, config.notebookBindingSide);

    return [
      "Виріб: блокнот",
      formatLabel ? `Формат: ${formatLabel}` : null,
      coverMaterialLabel ? `Обкладинка: ${coverMaterialLabel}` : null,
      coverStockLabel ? `Щільність обкладинки: ${coverStockLabel}` : null,
      coverPrintLabel
        ? `Друк обкладинки: ${coverPrintLabel}${config.notebookCoverPrint === "pantone" ? getPantoneSuffix(config.notebookCoverPantoneCount) : ""}`
        : null,
      laminationLabel
        ? `Ламінація: ${laminationLabel}${laminationSidesLabel ? `, ${laminationSidesLabel}` : ""}`
        : null,
      config.notebookSpotUv === "yes"
        ? `Вибірковий лак: ${getLabel(NOTEBOOK_SPOT_UV_COVERAGE_LABELS, config.notebookSpotUvCoverage) ?? "так"}`
        : null,
      config.notebookCoverOtherFinishing.trim()
        ? `Інше оздоблення: ${config.notebookCoverOtherFinishing.trim()}`
        : null,
      blockPaperLabel ? `Папір блоку: ${blockPaperLabel}` : null,
      blockDensityLabel ? `Щільність блоку: ${blockDensityLabel}` : null,
      sheetCountLabel ? `Кількість аркушів: ${sheetCountLabel}` : null,
      blockPrintLabel
        ? `Друк блоку: ${blockPrintLabel}${config.notebookBlockPrint === "pantone" ? getPantoneSuffix(config.notebookBlockPantoneCount) : ""}`
        : null,
      bindingLabel ? `Скріплення: ${bindingLabel}` : null,
      bindingSideLabel ? `Сторона скріплення: ${bindingSideLabel}` : null,
    ].filter(Boolean) as string[];
  }

  if (config.productKind === "note_blocks") {
    const formatLabel = getLabel(NOTE_BLOCK_FORMAT_LABELS, config.noteBlockFormat, config.noteBlockFormatCustom);
    const paperLabel = getLabel(NOTE_BLOCK_PAPER_LABELS, config.noteBlockPaper, config.noteBlockPaperCustom);
    const densityLabel = getLabel(
      NOTE_BLOCK_DENSITY_LABELS,
      config.noteBlockDensity,
      config.noteBlockDensityCustom
    );
    const sheetCountLabel = getLabel(
      NOTE_BLOCK_SHEET_COUNT_LABELS,
      config.noteBlockSheetCount,
      config.noteBlockSheetCountCustom
    );
    const glueSideLabel = getLabel(NOTE_BLOCK_GLUE_SIDE_LABELS, config.noteBlockGlueSide);

    return [
      "Виріб: блоки для записів",
      formatLabel ? `Формат: ${formatLabel}` : null,
      YES_NO_LABEL(config.noteBlockHasCover) ? `Обкладинка: ${YES_NO_LABEL(config.noteBlockHasCover)}` : null,
      paperLabel ? `Папір: ${paperLabel}` : null,
      densityLabel ? `Щільність: ${densityLabel}` : null,
      sheetCountLabel ? `Кількість аркушів: ${sheetCountLabel}` : null,
      config.noteBlockPrint === "4_0"
        ? "Друк: 4+0"
        : config.noteBlockPrint === "pantone"
          ? `Друк: Pantone${getPantoneSuffix(config.noteBlockPantoneCount)}`
          : null,
      YES_NO_LABEL(config.noteBlockGlue) ? `Клей: ${YES_NO_LABEL(config.noteBlockGlue)}` : null,
      config.noteBlockGlue === "yes" && glueSideLabel ? `Сторона проклейки: ${glueSideLabel}` : null,
    ].filter(Boolean) as string[];
  }

  const orientationLabel =
    config.orientation === "vertical" ? "вертикальний" : config.orientation === "horizontal" ? "горизонтальний" : null;
  const paperTypeLabel =
    config.paperType === "kraft"
      ? `крафт${config.kraftColor === "white" ? " білий" : config.kraftColor === "brown" ? " бурий" : ""}`
      : getLabel(PACKAGE_PAPER_TYPE_LABELS, config.paperType);
  const handleLabel = getLabel(PACKAGE_HANDLE_LABELS, config.handleType);
  const printSidesLabel = getLabel(PACKAGE_PRINT_SIDE_LABELS, config.printSides);
  const printTypeLabel = getLabel(PACKAGE_PRINT_TYPE_LABELS, config.printType);
  const embossingLabel = getLabel(PACKAGE_EMBOSSING_LABELS, config.embossing);
  const extraFinishingLabel = getLabel(PACKAGE_FINISHING_LABELS, config.extraFinishing);

  return [
    "Виріб: пакет",
    `Тип: ${config.packageType === "ready" ? "готовий" : "індивідуальний"}`,
    orientationLabel ? `Орієнтація: ${orientationLabel}` : null,
    config.packageType === "custom" && config.widthMm && config.heightMm && config.lengthMm
      ? `Розмір (Ш × В × Г): ${config.widthMm} × ${config.heightMm} × ${config.lengthMm} мм`
      : null,
    paperTypeLabel ? `Матеріал: ${paperTypeLabel}` : null,
    config.density ? `Щільність: ${config.density}г` : null,
    handleLabel ? `Ручки: ${handleLabel}` : null,
    config.eyelets ? `Люверси: ${config.eyelets === "yes" ? "так" : "ні"}` : null,
    printSidesLabel ? `Нанесення: ${printSidesLabel}` : null,
    printTypeLabel
      ? `Тип нанесення: ${printTypeLabel}${
          config.printType === "pantone" || config.printType === "cmyk_pantone"
            ? getPantoneSuffix(config.pantoneCount)
            : config.printType === "sticker" && config.stickerSize.trim()
              ? ` (${config.stickerSize.trim()})`
              : ""
        }`
      : null,
    getPackageLaminationLabel(config.lamination)
      ? `Ламінація: ${getPackageLaminationLabel(config.lamination)}`
      : null,
    extraFinishingLabel && config.extraFinishing !== "none" ? `Додаткове оздоблення: ${extraFinishingLabel}` : null,
    embossingLabel && config.embossing !== "none" ? `Тиснення: ${embossingLabel}` : null,
    config.supplierLink.trim() ? `Постачальник: ${config.supplierLink.trim()}` : null,
  ].filter(Boolean) as string[];
}

export function formatPrintPackageSummary(config: PrintProductConfig): string[] {
  return formatPrintProductSummary(config);
}

export function getPrintPackageDetailFields(config: PrintProductConfig): PrintPackageDetailField[] {
  return formatPrintProductSummary(config)
    .map((entry) => {
      const separatorIndex = entry.indexOf(": ");
      if (separatorIndex < 0) return null;
      return {
        label: entry.slice(0, separatorIndex),
        value: entry.slice(separatorIndex + 2),
      };
    })
    .filter(Boolean) as PrintPackageDetailField[];
}

export function getPrintProductDetailSections(config: PrintProductConfig): PrintProductDetailSection[] {
  const fields = getPrintPackageDetailFields(config);
  if (config.productKind === "notebook") {
    return [
      {
        title: "Обкладинка",
        fields: fields.filter((field) =>
          ["Формат", "Обкладинка", "Щільність обкладинки", "Друк обкладинки", "Ламінація", "Вибірковий лак", "Інше оздоблення"].includes(field.label)
        ),
      },
      {
        title: "Блок",
        fields: fields.filter((field) =>
          ["Папір блоку", "Щільність блоку", "Кількість аркушів", "Друк блоку", "Скріплення", "Сторона скріплення"].includes(field.label)
        ),
      },
    ].filter((section) => section.fields.length > 0);
  }
  if (config.productKind === "note_blocks") {
    return [
      {
        title: "Специфікація",
        fields: fields.filter((field) =>
          ["Формат", "Обкладинка", "Папір", "Щільність", "Кількість аркушів", "Друк", "Клей", "Сторона проклейки"].includes(field.label)
        ),
      },
    ].filter((section) => section.fields.length > 0);
  }
  return [
    {
        title: "Конструкція",
        fields: fields.filter((field) =>
        ["Тип", "Орієнтація", "Розмір (Ш × В × Г)", "Люверси", "Постачальник"].includes(field.label)
      ),
    },
    {
      title: "Матеріал",
      fields: fields.filter((field) =>
        ["Матеріал", "Щільність", "Ручки"].includes(field.label)
      ),
    },
    {
      title: "Друк та оздоблення",
      fields: fields.filter((field) =>
        ["Нанесення", "Тип нанесення", "Ламінація", "Додаткове оздоблення", "Тиснення"].includes(field.label)
      ),
    },
  ].filter((section) => section.fields.length > 0);
}

export function validatePrintProductConfig(config: PrintProductConfig): string | null {
  const positiveNumber = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;
  const positiveInteger = (value: string) => positiveNumber(value) && Number.isInteger(Number(value));
  const requiredOther = (value: string, custom: string) => value !== "other" || custom.trim().length > 0;

  if (config.productKind === "notebook") {
    if (!config.notebookFormat) return "Оберіть формат блокнота";
    if (!requiredOther(config.notebookFormat, config.notebookFormatCustom)) return "Вкажіть нестандартний формат блокнота";
    if (!config.notebookCoverMaterial) return "Оберіть матеріал обкладинки";
    if (!config.notebookCoverStock) return "Оберіть щільність обкладинки";
    if (!requiredOther(config.notebookCoverStock, config.notebookCoverStockCustom)) return "Вкажіть щільність обкладинки";
    if (!config.notebookCoverPrint) return "Оберіть друк обкладинки";
    if (config.notebookCoverPrint === "pantone" && !positiveInteger(config.notebookCoverPantoneCount)) {
      return "Вкажіть коректну кількість пантонів для обкладинки";
    }
    if (!config.notebookLamination) return "Оберіть ламінацію обкладинки";
    if (!config.notebookLaminationSides) return "Оберіть схему ламінації";
    if (config.notebookSpotUv === "yes" && !config.notebookSpotUvCoverage) return "Оберіть покриття вибіркового лаку";
    if (!config.notebookBlockPaper) return "Оберіть папір блоку";
    if (!config.notebookBlockDensity) return "Оберіть щільність блоку";
    if (!requiredOther(config.notebookBlockDensity, config.notebookBlockDensityCustom)) return "Вкажіть щільність блоку";
    if (!config.notebookSheetCount) return "Оберіть кількість аркушів";
    if (!requiredOther(config.notebookSheetCount, config.notebookSheetCountCustom)) return "Вкажіть кількість аркушів";
    if (!config.notebookBlockPrint) return "Оберіть друк блоку";
    if (config.notebookBlockPrint === "pantone" && !positiveInteger(config.notebookBlockPantoneCount)) {
      return "Вкажіть коректну кількість пантонів для блоку";
    }
    if (!config.notebookBinding) return "Оберіть тип скріплення";
    if (!config.notebookBindingSide) return "Оберіть сторону скріплення";
    return null;
  }

  if (config.productKind === "note_blocks") {
    if (!config.noteBlockFormat) return "Оберіть формат блоків для записів";
    if (!requiredOther(config.noteBlockFormat, config.noteBlockFormatCustom)) return "Вкажіть нестандартний формат блоків";
    if (!config.noteBlockHasCover) return "Оберіть, чи є обкладинка";
    if (!config.noteBlockPaper) return "Оберіть папір";
    if (!requiredOther(config.noteBlockPaper, config.noteBlockPaperCustom)) return "Вкажіть тип паперу";
    if (!config.noteBlockDensity) return "Оберіть щільність";
    if (!requiredOther(config.noteBlockDensity, config.noteBlockDensityCustom)) return "Вкажіть щільність";
    if (!config.noteBlockSheetCount) return "Оберіть кількість аркушів";
    if (!requiredOther(config.noteBlockSheetCount, config.noteBlockSheetCountCustom)) return "Вкажіть кількість аркушів";
    if (!config.noteBlockPrint) return "Оберіть друк";
    if (config.noteBlockPrint === "pantone" && !positiveInteger(config.noteBlockPantoneCount)) {
      return "Вкажіть коректну кількість пантонів";
    }
    if (!config.noteBlockGlue) return "Оберіть, чи потрібен клей";
    if (config.noteBlockGlue === "yes" && !config.noteBlockGlueSide) return "Оберіть сторону проклейки";
    return null;
  }

  if (!config.packageType) return "Оберіть тип пакету";
  if (config.packageType === "custom") {
    if (!positiveNumber(config.widthMm) || !positiveNumber(config.heightMm) || !positiveNumber(config.lengthMm)) {
      return "Для індивідуального пакету вкажіть коректні ширину, висоту і довжину";
    }
  }
  if (config.packageType === "ready" && !config.supplierLink.trim()) return "Для готового пакету додайте посилання постачальника";
  if (!config.orientation) return "Оберіть орієнтацію пакету";
  if (!config.paperType) return "Оберіть вид паперу";
  if (config.paperType === "kraft" && !config.kraftColor) return "Оберіть колір крафту";
  if (!config.density) return "Оберіть щільність";
  if (!config.handleType) return "Оберіть тип ручок";
  if (config.packageType === "custom" && config.paperType !== "kraft" && !config.eyelets) return "Оберіть, чи потрібні люверси";
  if (!config.printSides) return "Оберіть кількість нанесень";
  if (!config.printType) return "Оберіть тип нанесення";
  if ((config.printType === "pantone" || config.printType === "cmyk_pantone") && !positiveInteger(config.pantoneCount)) {
    return "Вкажіть коректну кількість пантонів";
  }
  if (config.printType === "sticker" && !config.stickerSize.trim()) return "Вкажіть розмір наліпки/стікера";
  if (config.packageType === "custom" && !config.lamination) return "Оберіть тип ламінації або варіант без ламінації";
  return null;
}

export function isPrintPackageMetadata(value: unknown): value is QuoteItemMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.configuratorPreset === "print_package" ||
    record.configuratorPreset === "print_notebook" ||
    record.configuratorPreset === "print_note_blocks"
  );
}

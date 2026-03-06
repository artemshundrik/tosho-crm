export type PrintPackageConfig = {
  productKind: string;
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
  supplierLink: string;
};

export type QuoteItemMetadata = {
  configuratorPreset?: "print_package" | null;
  printPackage?: PrintPackageConfig | null;
};

export type PrintPackageDetailField = {
  label: string;
  value: string;
};

export const createEmptyPrintPackageConfig = (): PrintPackageConfig => ({
  productKind: "",
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
  supplierLink: "",
});

export function formatPrintPackageSummary(config: PrintPackageConfig): string[] {
  const orientationLabel =
    config.orientation === "vertical" ? "вертикальний" : config.orientation === "horizontal" ? "горизонтальний" : null;
  const paperTypeLabel =
    config.paperType === "cardboard"
      ? "картон"
      : config.paperType === "paper"
        ? "папір"
        : config.paperType === "kraft"
          ? `крафт${config.kraftColor === "white" ? " білий" : config.kraftColor === "brown" ? " бурий" : ""}`
          : null;
  const handleLabel =
    config.handleType === "ribbon"
      ? "лента"
      : config.handleType === "cord"
        ? "шнурок"
        : config.handleType === "twisted_paper"
          ? "кручена паперова"
          : config.handleType === "flat_paper"
            ? "плоска паперова"
            : null;
  const printSidesLabel =
    config.printSides === "one_side"
      ? "з одної сторони"
      : config.printSides === "two_sides"
        ? "з двох сторін"
        : null;
  const printTypeLabel =
    config.printType === "cmyk"
      ? "CMYK"
      : config.printType === "pantone"
        ? "Pantone"
        : config.printType === "cmyk_pantone"
          ? "CMYK+Pantone"
          : config.printType === "uv_dtf"
            ? "УФ-DTF"
            : config.printType === "uv_print"
              ? "УФ-друк"
              : config.printType === "screen_print"
                ? "Трафарет"
                : config.printType === "sticker"
                  ? "Наліпка/стікер"
                  : null;
  const embossingLabel =
    config.embossing === "blind_1"
      ? "конгрев (сліпе) з одної сторони"
      : config.embossing === "blind_2"
        ? "конгрев (сліпе) з двох сторін"
        : config.embossing === "foil_1"
          ? "фольга з одної сторони"
          : config.embossing === "foil_2"
            ? "фольга з двох сторін"
            : null;
  const extraFinishingLabel =
    config.extraFinishing === "spot_uv_25"
      ? "вибірковий лак (до 25%)"
      : config.extraFinishing === "spot_uv_40"
        ? "вибірковий лак (до 40%)"
        : null;

  return [
    `Тип: ${config.packageType === "ready" ? "готовий" : "індивідуальний"}`,
    orientationLabel ? `Орієнтація: ${orientationLabel}` : null,
    config.packageType === "custom" && config.widthMm && config.heightMm && config.lengthMm
      ? `Розмір: ${config.widthMm} × ${config.heightMm} × ${config.lengthMm} мм`
      : null,
    paperTypeLabel ? `Матеріал: ${paperTypeLabel}` : null,
    config.density ? `Щільність: ${config.density}г` : null,
    handleLabel ? `Ручки: ${handleLabel}` : null,
    config.eyelets ? `Люверси: ${config.eyelets === "yes" ? "так" : "ні"}` : null,
    printSidesLabel ? `Нанесення: ${printSidesLabel}` : null,
    printTypeLabel
      ? `Тип нанесення: ${printTypeLabel}${
          config.printType === "pantone" || config.printType === "cmyk_pantone"
            ? ` (${config.pantoneCount} Pantone)`
            : config.printType === "sticker" && config.stickerSize.trim()
              ? ` (${config.stickerSize.trim()})`
              : ""
        }`
      : null,
    config.lamination ? `Ламінація: ${config.lamination === "yes" ? "так" : "ні"}` : null,
    extraFinishingLabel ? `Додаткове оздоблення: ${extraFinishingLabel}` : null,
    embossingLabel ? `Тиснення: ${embossingLabel}` : null,
    config.supplierLink.trim() ? `Постачальник: ${config.supplierLink.trim()}` : null,
  ].filter(Boolean) as string[];
}

export function getPrintPackageDetailFields(config: PrintPackageConfig): PrintPackageDetailField[] {
  return formatPrintPackageSummary(config)
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

export function isPrintPackageMetadata(value: unknown): value is QuoteItemMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.configuratorPreset === "print_package";
}

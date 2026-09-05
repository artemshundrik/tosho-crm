import type { PrintProductConfig, PrintProductKind } from "@/lib/printPackage";

/**
 * Правила сумісності полів конфігуратора пакета (REQ-245#p1).
 *
 * Раніше ці правила жили п'ятьма `useEffect` у `NewQuoteDialog` і ще двома в
 * `QuoteBatchBuilderDialog`: вікно спершу показувало неможливу комбінацію, а
 * наступним рендером мовчки стирало поле. Через це вибір «відкочувався сам» —
 * найпомітніше при відкритті вікна, коли вид виробу приїздив з моделі каталогу
 * вже після першого коміту й тягнув за собою скидання щільності та виду друку.
 *
 * Тепер це одна чиста функція, яку обидва вікна проганяють ПЕРЕД показом. Стан
 * лишається сирим, а на екран і в базу йде вже звірений: проміжного кадру з
 * неможливою комбінацією не існує, тож і стирати постфактум нічого.
 *
 * Функція навмисно повертає ТОЙ САМИЙ об'єкт, коли міняти нічого — інакше
 * похідне значення оновлювалось би на кожен рендер і тягнуло за собою
 * перерахунок усього, що від нього залежить.
 */

export type PrintPackageDensityOption = {
  value: string;
  label: string;
  onlyFor?: "kraft" | "cardboard";
};

export type PrintPackageHandleOption = {
  value: string;
  label: string;
  onlyFor?: "kraft";
};

export type PrintPackagePrintTypeOption = {
  value: string;
  label: string;
  notForReady?: boolean;
};

export const PRINT_PACKAGE_DENSITIES: PrintPackageDensityOption[] = [
  { value: "90", label: "90г" },
  { value: "110", label: "110г" },
  { value: "120", label: "120г", onlyFor: "kraft" },
  { value: "125", label: "125г" },
  { value: "200", label: "200г" },
  { value: "205", label: "205г", onlyFor: "cardboard" },
  { value: "250", label: "250г" },
];

export const PRINT_PACKAGE_HANDLES: PrintPackageHandleOption[] = [
  { value: "ribbon", label: "Лента" },
  { value: "cord", label: "Шнурок" },
  { value: "twisted_paper", label: "Кручена паперова", onlyFor: "kraft" },
  { value: "flat_paper", label: "Плоска паперова", onlyFor: "kraft" },
];

export const PRINT_PACKAGE_PRINT_TYPES: PrintPackagePrintTypeOption[] = [
  { value: "cmyk", label: "CMYK", notForReady: true },
  { value: "pantone", label: "Pantone" },
  { value: "cmyk_pantone", label: "CMYK+Pantone" },
  { value: "uv_dtf", label: "УФ-DTF" },
  { value: "uv_print", label: "УФ-друк" },
  { value: "screen_print", label: "Трафарет" },
  { value: "sticker", label: "Наліпка/стікер" },
];

/** Щільності паперу, доступні при поточному типі паперу. */
export const listPackageDensities = (config: PrintProductConfig): PrintPackageDensityOption[] =>
  PRINT_PACKAGE_DENSITIES.filter((option) => {
    if (option.onlyFor === "kraft") return config.paperType === "kraft";
    if (option.onlyFor === "cardboard") return config.paperType === "cardboard";
    return true;
  });

/** Ручки, доступні при поточному типі паперу: паперові бувають лише в крафта. */
export const listPackageHandles = (config: PrintProductConfig): PrintPackageHandleOption[] =>
  PRINT_PACKAGE_HANDLES.filter((option) => {
    if (option.onlyFor === "kraft") return config.paperType === "kraft";
    return true;
  });

/** Види друку, доступні при поточному типі пакета: на готовий CMYK не кладуть. */
export const listPackagePrintTypes = (config: PrintProductConfig): PrintPackagePrintTypeOption[] =>
  PRINT_PACKAGE_PRINT_TYPES.filter((option) => {
    if (option.notForReady) return config.packageType !== "ready";
    return true;
  });

/** Люверси питають лише про пакет власної форми і лише не з крафта. */
const hidesEyelets = (config: PrintProductConfig): boolean =>
  config.packageType !== "custom" || config.paperType === "kraft";

export type PrintPackageRulesContext = {
  /**
   * Вид виробу, який диктує обрана модель каталогу. Порожній рядок — модель без
   * пресета конфігуратора; тоді лишається те, що вже стоїть у конфігурації.
   */
  productKind: PrintProductKind | "";
};

/**
 * Звіряє конфігурацію з правилами сумісності: підставляє вид виробу з каталогу
 * й прибирає значення, яких при поточному виборі не існує.
 *
 * Чіпає лише пакет — у блокнотів, блоків і сертифікатів своїх умовних полів
 * немає, тож їхні конфігурації повертаються як є.
 */
export const reconcilePrintProductConfig = (
  config: PrintProductConfig,
  context: PrintPackageRulesContext
): PrintProductConfig => {
  const productKind = context.productKind || config.productKind;
  const productKindChanged = productKind !== config.productKind;

  if (productKind !== "package") {
    return productKindChanged ? { ...config, productKind } : config;
  }

  const base = productKindChanged ? { ...config, productKind } : config;

  const nextKraftColor = base.paperType === "kraft" ? base.kraftColor : "";
  const nextDensity = listPackageDensities(base).some((option) => option.value === base.density)
    ? base.density
    : "";
  const nextHandleType = listPackageHandles(base).some((option) => option.value === base.handleType)
    ? base.handleType
    : "";
  const nextEyelets = hidesEyelets(base) ? "" : base.eyelets;
  // Порожнє поле — це «ще не обрали», а не помилковий вибір: стирати нема чого.
  const printTypeValid =
    base.printType === "" || listPackagePrintTypes(base).some((option) => option.value === base.printType);

  const fieldsChanged =
    nextKraftColor !== base.kraftColor ||
    nextDensity !== base.density ||
    nextHandleType !== base.handleType ||
    nextEyelets !== base.eyelets ||
    !printTypeValid;

  if (!fieldsChanged) return base;

  return {
    ...base,
    kraftColor: nextKraftColor,
    density: nextDensity,
    handleType: nextHandleType,
    eyelets: nextEyelets,
    // Кількість пантонів і розмір наліпки описують саме вид друку, тож без нього
    // вони втрачають сенс і йдуть разом із ним.
    ...(printTypeValid ? null : { printType: "", pantoneCount: "", stickerSize: "" }),
  };
};

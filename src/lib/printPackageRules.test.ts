import { describe, expect, it } from "vitest";

import { createEmptyPrintPackageConfig } from "@/lib/printPackage";
import {
  listPackageDensities,
  listPackageHandles,
  listPackagePrintTypes,
  reconcilePrintProductConfig,
} from "@/lib/printPackageRules";

const packageConfig = (overrides: Partial<ReturnType<typeof createEmptyPrintPackageConfig>> = {}) => ({
  ...createEmptyPrintPackageConfig(),
  productKind: "package" as const,
  ...overrides,
});

describe("доступні значення", () => {
  it("щільність 120г лишає тільки крафту, 205г — тільки картону", () => {
    const kraft = listPackageDensities(packageConfig({ paperType: "kraft" })).map((o) => o.value);
    const cardboard = listPackageDensities(packageConfig({ paperType: "cardboard" })).map((o) => o.value);

    expect(kraft).toContain("120");
    expect(kraft).not.toContain("205");
    expect(cardboard).toContain("205");
    expect(cardboard).not.toContain("120");
  });

  it("паперові ручки бувають лише в крафта", () => {
    const kraft = listPackageHandles(packageConfig({ paperType: "kraft" })).map((o) => o.value);
    const cardboard = listPackageHandles(packageConfig({ paperType: "cardboard" })).map((o) => o.value);

    expect(kraft).toContain("twisted_paper");
    expect(cardboard).not.toContain("twisted_paper");
    expect(cardboard).toContain("ribbon");
  });

  it("на готовий пакет CMYK не пропонують", () => {
    const ready = listPackagePrintTypes(packageConfig({ packageType: "ready" })).map((o) => o.value);
    const custom = listPackagePrintTypes(packageConfig({ packageType: "custom" })).map((o) => o.value);

    expect(ready).not.toContain("cmyk");
    expect(custom).toContain("cmyk");
  });
});

describe("звірка конфігурації", () => {
  it("бере вид виробу з каталогу, коли він відомий", () => {
    const config = createEmptyPrintPackageConfig();

    const result = reconcilePrintProductConfig(config, { productKind: "notebook" });

    expect(result.productKind).toBe("notebook");
  });

  it("лишає вид виробу, коли модель без пресета", () => {
    const config = packageConfig();

    const result = reconcilePrintProductConfig(config, { productKind: "" });

    expect(result.productKind).toBe("package");
  });

  it("стирає щільність, якої при новому папері не існує", () => {
    const config = packageConfig({ paperType: "cardboard", density: "120" });

    const result = reconcilePrintProductConfig(config, { productKind: "package" });

    expect(result.density).toBe("");
  });

  it("лишає щільність, яка при новому папері доступна", () => {
    const config = packageConfig({ paperType: "cardboard", density: "250" });

    const result = reconcilePrintProductConfig(config, { productKind: "package" });

    expect(result.density).toBe("250");
  });

  it("стирає паперову ручку разом із відмовою від крафта", () => {
    const config = packageConfig({ paperType: "cardboard", handleType: "twisted_paper" });

    const result = reconcilePrintProductConfig(config, { productKind: "package" });

    expect(result.handleType).toBe("");
  });

  it("колір крафта живе лише при крафті", () => {
    const config = packageConfig({ paperType: "cardboard", kraftColor: "brown" });

    const result = reconcilePrintProductConfig(config, { productKind: "package" });

    expect(result.kraftColor).toBe("");
  });

  it("люверси питають лише про пакет власної форми не з крафта", () => {
    expect(
      reconcilePrintProductConfig(packageConfig({ packageType: "ready", eyelets: "yes" }), {
        productKind: "package",
      }).eyelets
    ).toBe("");
    expect(
      reconcilePrintProductConfig(packageConfig({ packageType: "custom", paperType: "kraft", eyelets: "yes" }), {
        productKind: "package",
      }).eyelets
    ).toBe("");
    expect(
      reconcilePrintProductConfig(
        packageConfig({ packageType: "custom", paperType: "cardboard", eyelets: "yes" }),
        { productKind: "package" }
      ).eyelets
    ).toBe("yes");
  });

  it("вид друку, недоступний для готового пакета, забирає з собою пантони", () => {
    const config = packageConfig({ packageType: "ready", printType: "cmyk", pantoneCount: "2", stickerSize: "10x10" });

    const result = reconcilePrintProductConfig(config, { productKind: "package" });

    expect(result.printType).toBe("");
    expect(result.pantoneCount).toBe("");
    expect(result.stickerSize).toBe("");
  });

  it("доступний вид друку лишає пантони на місці", () => {
    const config = packageConfig({ packageType: "ready", printType: "pantone", pantoneCount: "2" });

    const result = reconcilePrintProductConfig(config, { productKind: "package" });

    expect(result.printType).toBe("pantone");
    expect(result.pantoneCount).toBe("2");
  });

  it("не чіпає блокнот, у якого своїх умовних полів немає", () => {
    const config = {
      ...createEmptyPrintPackageConfig(),
      productKind: "notebook" as const,
      density: "120",
      handleType: "twisted_paper",
    };

    const result = reconcilePrintProductConfig(config, { productKind: "notebook" });

    expect(result).toBe(config);
  });

  it("повертає той самий об'єкт, коли міняти нічого", () => {
    const config = packageConfig({ paperType: "kraft", density: "120", handleType: "cord" });

    const result = reconcilePrintProductConfig(config, { productKind: "package" });

    expect(result).toBe(config);
  });

  it("зводиться за один прохід: зміна виду виробу вже враховує правила пакета", () => {
    // Саме цей ланцюжок раніше йшов трьома рендерами: спершу ефект ставив вид
    // виробу, наступний стирав щільність, ще наступний — вид друку.
    const config = {
      ...createEmptyPrintPackageConfig(),
      packageType: "ready",
      paperType: "cardboard",
      density: "120",
      printType: "cmyk",
    };

    const result = reconcilePrintProductConfig(config, { productKind: "package" });

    expect(result.productKind).toBe("package");
    expect(result.density).toBe("");
    expect(result.printType).toBe("");
  });
});

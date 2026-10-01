import { describe, expect, it } from "vitest";

import { parseQuoteItemMetadata } from "./quoteItemMetadata";

describe("читання metadata позиції прорахунку", () => {
  it("пропускає посилання постачальника — без них кнопка на картці сіра", () => {
    const metadata = parseQuoteItemMetadata({
      supplierUrl: "https://kmz.ua/mug",
      avantprintUrl: "https://avanprint.com/mug",
    });

    expect(metadata).toEqual({
      supplierUrl: "https://kmz.ua/mug",
      avantprintUrl: "https://avanprint.com/mug",
    });
  });

  it("не пропускає нічого, крім http(s): цей рядок їде прямо в href", () => {
    expect(parseQuoteItemMetadata({ supplierUrl: "javascript:alert(1)" })).toBeNull();
    expect(parseQuoteItemMetadata({ supplierUrl: "data:text/html,<script>" })).toBeNull();
    expect(parseQuoteItemMetadata({ supplierUrl: "не посилання" })).toBeNull();
  });

  it("тримає слід імпорту й стан дослідження", () => {
    const metadata = parseQuoteItemMetadata({
      import: { fileName: "kmz.xlsx", importedAt: "2026-09-01T10:00:00.000Z", sourceRows: [3, 4] },
      research: { status: "failed", fetchedAt: "2026-09-01T10:01:00.000Z", error: "403" },
      importLinks: ["https://kmz.ua/a", "javascript:alert(1)"],
    });

    expect(metadata?.import).toEqual({
      fileName: "kmz.xlsx",
      importedAt: "2026-09-01T10:00:00.000Z",
      sourceRows: [3, 4],
    });
    expect(metadata?.research?.status).toBe("failed");
    expect(metadata?.importLinks).toEqual(["https://kmz.ua/a"]);
  });

  it("невідомий статус дослідження не проходить", () => {
    expect(parseQuoteItemMetadata({ research: { status: "маємо надію", fetchedAt: "x" } })).toBeNull();
  });

  it("стара позиція пакета дістає printSpec зі старого формату, а сам формат лишається", () => {
    const metadata = parseQuoteItemMetadata({
      configuratorPreset: "print_package",
      sku: "  PKG-1  ",
      supplierUrl: "javascript:alert(1)",
      printProduct: { productKind: "package", packageType: "ready", supplierLink: "https://kraft.ua" },
    });

    expect(metadata?.printSpec?.presetKey).toBe("print_package");
    expect(metadata?.printSpec?.values.packageType).toBe("ready");
    expect(metadata?.configuratorPreset).toBe("print_package");
    // Старий запис доповнено порожніми ключами — зведення старого формату читає кожен.
    expect(metadata?.printProduct?.notebookFormat).toBe("");
    // Раніше такі позиції віддавались сирими — повз чистку артикула й посилань.
    expect(metadata?.sku).toBe("PKG-1");
    expect(metadata?.supplierUrl).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";

import {
  compactOrderItemMetadata,
  orderItemCargoTypeNames,
  orderItemSources,
  parseOrderItemMetadata,
} from "./orderItemMetadata";

describe("compactOrderItemMetadata", () => {
  it("лишає тільки заповнене", () => {
    expect(compactOrderItemMetadata({ sku: " A-1 ", color: "", sourceUrl: null })).toEqual({ sku: "A-1" });
  });

  it("порожнє стає null, а не {}", () => {
    expect(compactOrderItemMetadata({ sku: " " })).toBeNull();
    expect(compactOrderItemMetadata(null)).toBeNull();
  });
});

describe("parseOrderItemMetadata", () => {
  it("відкидає чужі ключі й типи", () => {
    expect(parseOrderItemMetadata({ sku: "A-1", color: 5, cost: "100" })).toEqual({ sku: "A-1" });
  });

  it("не об'єкт дає null", () => {
    expect(parseOrderItemMetadata("A-1")).toBeNull();
    expect(parseOrderItemMetadata([{ sku: "A-1" }])).toBeNull();
  });
});

describe("orderItemSources", () => {
  it("прибирає повтори, наш магазин першим", () => {
    const urls = orderItemSources({
      sourceUrl: "https://toptime.com.ua/x",
      supplierUrl: "https://toptime.com.ua/x",
      avantprintUrl: "https://avanprint.ua/y",
    }).map((source) => source.url);
    expect(urls).toEqual(["https://avanprint.ua/y", "https://toptime.com.ua/x"]);
  });

  it("позиція без даних не дає рядків", () => {
    expect(orderItemSources(null)).toEqual([]);
  });
});

describe("orderItemCargoTypeNames", () => {
  it("бере категорії лише з позицій без моделі, без повторів", () => {
    expect(
      orderItemCargoTypeNames([
        { catalogModelId: null, metadata: { typeName: "Одяг" } },
        { catalogModelId: null, metadata: { typeName: "Одяг" } },
        { catalogModelId: "m", metadata: { typeName: "Посуд" } },
        { catalogModelId: null, metadata: null },
      ])
    ).toEqual(["Одяг"]);
  });
});

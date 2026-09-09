import { describe, expect, it } from "vitest";

import type { SupplierPoolProduct } from "@/lib/supplierPoolRows";

import { filterSupplierPool, supplierSourceOptions } from "./SupplierPoolFilterBar";

const product = (over: Partial<SupplierPoolProduct> & { key: string }): SupplierPoolProduct =>
  ({
    key: over.key,
    supplierSlug: over.supplierSlug ?? "totobi.com.ua",
    name: over.name ?? "Ручка",
    article: null,
    vendor: null,
    category: null,
    imageUrl: null,
    priceMin: over.priceMin === undefined ? 10 : over.priceMin,
    priceMax: null,
    priceKind: "wholesale",
    currency: "UAH",
    variantCount: 1,
    variants: [],
    variantsAreColors: false,
  variantsHaveSizes: false,
    sources: over.sources ?? [{ supplierSlug: over.supplierSlug ?? "totobi.com.ua", name: "Ручка", url: null }],
    priceRowId: null,
  }) as unknown as SupplierPoolProduct;

describe("filterSupplierPool", () => {
  const rows = [
    product({ key: "t", supplierSlug: "totobi.com.ua" }),
    product({ key: "e", supplierSlug: "e-suvenir.com.ua" }),
    product({ key: "a", supplierSlug: "avanprint.ua", priceMin: null }),
  ];

  it("без фільтра віддає все", () => {
    expect(filterSupplierPool(rows, { source: null, pricedOnly: false })).toHaveLength(3);
  });

  it("«лише з ціною» ховає рядки без ціни — у Аванпринта вона довідкова", () => {
    const kept = filterSupplierPool(rows, { source: null, pricedOnly: true });
    expect(kept.map((row) => row.key)).toEqual(["t", "e"]);
  });

  it("злита картка лишається на чипі КОЖНОГО зі своїх джерел", () => {
    // Картка стоїть у черзі Аванпринта, але та сама річ є і в оптовика — і на
    // «Тотобі» вона мусить лишитись, бо саме звідти її ціна.
    const merged = product({
      key: "m",
      supplierSlug: "avanprint.ua",
      sources: [
        { supplierSlug: "avanprint.ua", name: "Ручка «MANILA»", url: null },
        { supplierSlug: "totobi.com.ua", name: "Екоручка «MANILA»", url: null },
      ],
    });
    expect(filterSupplierPool([merged], { source: "totobi.com.ua", pricedOnly: false })).toHaveLength(1);
    expect(filterSupplierPool([merged], { source: "avanprint.ua", pricedOnly: false })).toHaveLength(1);
    expect(filterSupplierPool([merged], { source: "bergamo.ua", pricedOnly: false })).toHaveLength(0);
  });
});

describe("supplierSourceOptions", () => {
  it("показує лише ті джерела, де щось знайшлось, і рахує картки", () => {
    const options = supplierSourceOptions([
      product({ key: "t1", supplierSlug: "totobi.com.ua" }),
      product({ key: "t2", supplierSlug: "totobi.com.ua" }),
      product({ key: "e1", supplierSlug: "e-suvenir.com.ua" }),
    ]);
    expect(options.map((option) => [option.name, option.count])).toEqual([
      ["Totobi", 2],
      ["E-Suvenir", 1],
    ]);
  });
});

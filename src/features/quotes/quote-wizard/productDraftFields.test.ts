import { describe, expect, it, vi } from "vitest";

import type { QuoteImportDraftItem } from "@/features/quotes/quote-import/types";
import type { SupplierPoolProduct, SupplierPoolVariant } from "@/lib/supplierPool";

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

const { applyDraftKind, applyPoolVariant, supplierProductFields } = await import("./productDraftFields");

const variant = (patch: Partial<SupplierPoolVariant> = {}): SupplierPoolVariant => ({
  id: "row-navy",
  priceRowId: "row-navy",
  article: "ka911",
  label: "Navy",
  price: 653.17,
  imageUrl: "https://toptime.com.ua/ka911_NV.jpg",
  url: "https://toptime.com.ua/ka911",
  ...patch,
});

const product = (patch: Partial<SupplierPoolProduct> = {}) =>
  ({
    name: "Фліс",
    article: null,
    imageUrl: "https://toptime.com.ua/ka911_SG.jpg",
    url: "https://toptime.com.ua/ka911",
    category: null,
    priceMin: 653.17,
    priceMax: 653.17,
    priceRowId: "row-sage",
    currency: "UAH",
    isKids: false,
    sources: [],
    variants: [variant(), variant({ id: "row-sage", label: "Sage" })],
    variantCount: 2,
    variantsAreColors: true,
    ...patch,
  }) as SupplierPoolProduct;

const draft = { name: "Фліс", sku: null, catalog: null, imprints: [] } as Pick<
  QuoteImportDraftItem,
  "name" | "sku" | "catalog" | "imprints" | "poolVariantRowId" | "poolVariantImageUrl"
>;

describe("вибір кольору доходить до позиції", () => {
  it("колір і його фото записуються, а не лишаються у вікні", () => {
    const next = applyPoolVariant(draft, product(), variant());

    expect(next).toMatchObject({
      sku: "ka911",
      color: "Navy",
      poolVariantRowId: "row-navy",
      poolVariantImageUrl: "https://toptime.com.ua/ka911_NV.jpg",
    });
  });

  it("колір без власного фото лишається без фото: чужий знімок брехав би", () => {
    const next = applyPoolVariant(draft, product(), variant({ imageUrl: null }));

    expect(next.poolVariantRowId).toBe("row-navy");
    expect(next.poolVariantImageUrl).toBeNull();
  });

  it("зміна виду фото кольору не губить", () => {
    const picked = applyPoolVariant(draft, product(), variant());

    expect(applyDraftKind(picked, null).poolVariantImageUrl).toBe("https://toptime.com.ua/ka911_NV.jpg");
  });

  it("товар з пошуку, звужений до кольору, закріплює колір і без вгаданого виду", () => {
    const fields = supplierProductFields([], product({ variants: [variant()], imageUrl: variant().imageUrl }));

    expect(fields).toMatchObject({
      color: "Navy",
      poolVariantRowId: "row-navy",
      poolVariantImageUrl: "https://toptime.com.ua/ka911_NV.jpg",
      catalog: null,
    });
  });

  it("кілька кольорів без вибору нічого не закріплюють", () => {
    const fields = supplierProductFields([], product());

    expect(fields.color).toBeNull();
    expect(fields.poolVariantRowId).toBeNull();
    expect(fields.poolVariantImageUrl).toBeNull();
  });
});

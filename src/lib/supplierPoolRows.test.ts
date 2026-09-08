import { describe, expect, it } from "vitest";

import {
  baseProductName,
  groupSupplierPoolRows,
  transliterateSearchTerm,
  type SupplierPoolRow,
} from "./supplierPoolRows";

/**
 * Згортання — єдине місце, де пул перетворюється на те, що бачить менеджер, і
 * воно тихе: помилка тут не падає, а показує на картці артикул чужого кольору.
 * Тому випадки взяті з живих фідів — berrytex (колір і розмір у назві, один
 * артикул на всі рядки) і totobi (колір у власному полі, свій код у кожного).
 */

const row = (over: Partial<SupplierPoolRow>): SupplierPoolRow => ({
  id: "id-1",
  supplier_slug: "totobi.com.ua",
  article: null,
  name: "Товар",
  vendor: null,
  category: null,
  price: null,
  currency: "UAH",
  price_kind: "retail",
  url: null,
  image_url: null,
  color: null,
  ...over,
});

describe("groupSupplierPoolRows", () => {
  it("згортає кольори totobi в одну картку й лишає артикул у варіантах", () => {
    const rows = [
      row({ id: "a", article: "18000-CG 3C", name: "Реглан Heavy Blend 271", price: 675.18, color: "ash grey" }),
      row({ id: "b", article: "18000-BK 3C", name: "Реглан Heavy Blend 271", price: 690, color: "чорний" }),
    ];

    const [product] = groupSupplierPoolRows(rows, 40);

    expect(product.name).toBe("Реглан Heavy Blend 271");
    expect(product.variantCount).toBe(2);
    // Артикули різні — на картці не показуємо жодного, інакше менеджер
    // скопіює код випадкового кольору.
    expect(product.article).toBeNull();
    expect(product.variants.map((v) => v.label)).toEqual(["ash grey", "чорний"]);
    expect(product.variants.map((v) => v.article)).toEqual(["18000-CG 3C", "18000-BK 3C"]);
    expect([product.priceMin, product.priceMax]).toEqual([675.18, 690]);
  });

  it("тримає артикул на картці, коли він у всіх варіантів однаковий (berrytex)", () => {
    const rows = [
      row({ id: "a", supplier_slug: "berrytex.com.ua", article: "JHK-PL", name: "JHK POLO (колір білий (WH), розмір 1/2)" }),
      row({ id: "b", supplier_slug: "berrytex.com.ua", article: "JHK-PL", name: "JHK POLO (колір чорний (BK), розмір 1/2)" }),
    ];

    const [product] = groupSupplierPoolRows(rows, 40);

    expect(product.name).toBe("JHK POLO");
    expect(product.article).toBe("JHK-PL");
    // Підпис варіанта береться з дужкового хвоста — свого поля кольору тут немає.
    expect(product.variants.map((v) => v.label)).toEqual([
      "колір білий (WH), розмір 1/2",
      "колір чорний (BK), розмір 1/2",
    ]);
  });

  it("піднімає товари з відомою ціною над безцінними", () => {
    const rows = [
      row({ id: "a", name: "Аркуш" }),
      row({ id: "b", name: "Ящик", price: 10 }),
    ];

    expect(groupSupplierPoolRows(rows, 40).map((p) => p.name)).toEqual(["Ящик", "Аркуш"]);
  });

  it("не склеює однойменні товари різних постачальників", () => {
    const rows = [
      row({ id: "a", supplier_slug: "totobi.com.ua", name: "Ліхтар" }),
      row({ id: "b", supplier_slug: "bergamo.ua", name: "Ліхтар" }),
    ];

    expect(groupSupplierPoolRows(rows, 40)).toHaveLength(2);
  });

  it("добирає фото, виробника й категорію з наступних рядків групи", () => {
    const rows = [
      row({ id: "a", name: "Кепка" }),
      row({ id: "b", name: "Кепка", image_url: "https://example/1.jpg", vendor: "Totobi", category: "Головні убори" }),
    ];

    const [product] = groupSupplierPoolRows(rows, 40);

    expect(product.imageUrl).toBe("https://example/1.jpg");
    expect(product.vendor).toBe("Totobi");
    expect(product.category).toBe("Головні убори");
  });
});

describe("baseProductName", () => {
  it("ріже від першої дужки — у berrytex вони вкладені", () => {
    expect(baseProductName("JHK POLO (колір білий (WH), розмір 1/2)")).toBe("JHK POLO");
  });

  it("лишає назву як є, коли дужок немає", () => {
    expect(baseProductName("Термокружка Magnum, ТМ Discover")).toBe("Термокружка Magnum, ТМ Discover");
  });
});

describe("transliterateSearchTerm", () => {
  it("ловить латиничну назву за кириличним запитом", () => {
    expect(transliterateSearchTerm("поло")).toBe("polo");
  });
});

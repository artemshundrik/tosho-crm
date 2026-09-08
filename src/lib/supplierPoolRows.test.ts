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
  it("роздає місця по черзі між постачальниками, а не віддає всі одному", () => {
    // Живий випадок 08.09.2026: у бергамо назви на «Д» і «Ф» ішли за абеткою
    // першими серед тих, у кого є ціна, і забирали всі шість місць вікна
    // візарда — Тотобі знову не було видно.
    const rows = [
      row({ id: "b1", supplier_slug: "bergamo.ua", name: "Двоколірна футболка", price: 793 }),
      row({ id: "b2", supplier_slug: "bergamo.ua", name: "Дитяча футболка", price: 405 }),
      row({ id: "b3", supplier_slug: "bergamo.ua", name: "Ще одна футболка", price: 500 }),
      row({ id: "t1", supplier_slug: "totobi.com.ua", name: "Футболка Atomic150", price: 120 }),
      row({ id: "t2", supplier_slug: "totobi.com.ua", name: "Футболка Bahrain 135", price: 121 }),
      row({ id: "a1", supplier_slug: "avanprint.ua", name: "Футболка «BASIC»", price: null }),
    ];

    const slugs = groupSupplierPoolRows(rows, 4).map((product) => product.supplierSlug);

    // Чотири місця на три джерела: кожне мусить дістати щонайменше одне.
    expect(new Set(slugs).size).toBe(3);
    expect(slugs.filter((slug) => slug === "bergamo.ua").length).toBeLessThanOrEqual(2);
    // Джерело без цін лишається позаду тих, у кого ціна є, але не зникає.
    expect(slugs).toContain("avanprint.ua");
  });

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

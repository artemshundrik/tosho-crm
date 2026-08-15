import { describe, expect, it } from "vitest";

import { STOCK_KIND_LABELS, groupByStockKind, normalizeStockKind } from "./sampleStockKind";

describe("normalizeStockKind", () => {
  it("розпізнає обидва підрозділи", () => {
    expect(normalizeStockKind("sample")).toBe("sample");
    expect(normalizeStockKind("supply")).toBe("supply");
    expect(normalizeStockKind(" SUPPLY ")).toBe("supply");
  });

  it("невідоме значення стає «Взірцями», а не окремим станом", () => {
    // Рядок, що не належить жодному підрозділу, зник би зі сторінки зовсім.
    // Склад мовчки недорахованих позицій гірший за склад, де щось лежить не на
    // тій полиці.
    expect(normalizeStockKind(null)).toBe("sample");
    expect(normalizeStockKind(undefined)).toBe("sample");
    expect(normalizeStockKind("")).toBe("sample");
    expect(normalizeStockKind("витратка")).toBe("sample");
  });
});

describe("groupByStockKind", () => {
  const items = [
    { id: "termos", kind: "sample" },
    { id: "korobka", kind: "supply" },
    { id: "hudi", kind: null },
    { id: "paket", kind: "supply" },
  ];

  it("розкладає позиції по двох підрозділах", () => {
    const groups = groupByStockKind(items, (item) => item.kind);
    expect(groups.map((group) => group.kind)).toEqual(["sample", "supply"]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["termos", "hudi"]);
    expect(groups[1].items.map((item) => item.id)).toEqual(["korobka", "paket"]);
  });

  it("зберігає вхідний порядок усередині підрозділу", () => {
    // Сторінка вже відсортувала рядки запитом (архівні вниз, далі за назвою) —
    // групування не має це перетасовувати.
    const groups = groupByStockKind(items, (item) => item.kind);
    expect(groups[1].items.map((item) => item.id)).toEqual(["korobka", "paket"]);
  });

  it("порожній підрозділ повертається, а не зникає", () => {
    // Заголовок «Залишки на складі · 0» каже «тут нічого немає»; зниклий
    // заголовок сказав би «такого підрозділу не існує».
    const groups = groupByStockKind([{ id: "one", kind: "sample" }], (item) => item.kind);
    expect(groups).toHaveLength(2);
    expect(groups[1].kind).toBe("supply");
    expect(groups[1].items).toEqual([]);
  });

  it("порожній вхід дає два порожні підрозділи", () => {
    const groups = groupByStockKind([] as Array<{ kind: string }>, (item) => item.kind);
    expect(groups.map((group) => group.items.length)).toEqual([0, 0]);
  });
});

describe("STOCK_KIND_LABELS", () => {
  it("підписи такі, як просили в картці", () => {
    expect(STOCK_KIND_LABELS.sample).toBe("Взірці");
    expect(STOCK_KIND_LABELS.supply).toBe("Залишки на складі");
  });
});
